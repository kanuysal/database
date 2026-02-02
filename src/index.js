import products from './products.json';
import adminHtml from './admin.html';
import docsHtml from './docs.html';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');

        const allowedOrigins = [
            'https://minalidya.wedding',
            'https://dergi.minalidya.wedding',
            'https://shop.minalidya.wedding',
            'https://rent.minalidya.wedding',
            'https://database.minalidya.wedding'
        ];

        let effectiveOrigin = 'https://minalidya.wedding';
        if (origin) {
            if (allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                effectiveOrigin = origin;
            }
        }

        const corsHeaders = {
            'Access-Control-Allow-Origin': effectiveOrigin,
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // API Endpoint (Protected by Key)
        if (url.pathname === '/api/products') {
            const apiKey = request.headers.get('x-api-key');
            // Allow both the internal secret and the user's dashboard password
            const isValid = apiKey === env.API_SECRET || apiKey === 'MinaLidya2026';

            if (!isValid) {
                return new Response('Unauthorized: Invalid API Key', { status: 401 });
            }

            // ENRICHMENT: Automatically detect Modest/Tesettür status
            // This ensures products are correctly filtered even if explicitly marked 'isModest: false' in DB
            const enrichedProducts = products.map(product => {
                let isModest = product.isModest === true || product.isModest === 'true';

                // Check Keywords in Slug, Category, Tags, Name
                if (!isModest) {
                    const keywords = ['tesettür', 'tesettur', 'modest', 'hijab']; // Removed 'kapalı' to be safe
                    const searchScope = (
                        (product.slug || '') + ' ' +
                        (product.category || '') + ' ' +
                        (Array.isArray(product.tags) ? product.tags.join(' ') : '') + ' ' +
                        (product.name || '')
                    ).toLowerCase();

                    if (keywords.some(k => searchScope.includes(k))) {
                        isModest = true;
                    }
                }

                // Clone to ensure safety
                const p = { ...product };

                // Update Fields
                p.isModest = isModest;
                p.mappedAttributes = { ...(p.mappedAttributes || {}) };

                // Normalize attribute for Frontend (expecting 'Evet'/'Hayır' or 'Yes'/'No')
                // The frontend handles translation, but 'Evet' is the standard TR value in this DB.
                p.mappedAttributes['Tesettür Uyumu'] = isModest ? 'Evet' : 'Hayır';

                return p;
            });

            return new Response(JSON.stringify(enrichedProducts), {
                headers: {
                    ...corsHeaders,
                    'content-type': 'application/json;charset=UTF-8',
                },
            });
        }

        // Admin Panel (Protected by Zero Trust)
        if (url.pathname === '/' || url.pathname === '/admin') {
            return new Response(adminHtml, {
                headers: {
                    'content-type': 'text/html;charset=UTF-8',
                },
            });
        }

        // --- SERVE R2 IMAGES (Proxy) ---
        if (url.pathname.startsWith('/images/')) {
            const key = decodeURIComponent(url.pathname.replace('/images/', ''));
            const object = await env.ASSETS_BUCKET.get(key);

            if (!object) {
                return new Response('Object Not Found', { status: 404 });
            }

            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            headers.set('cache-control', 'public, max-age=14400'); // 4 hours
            headers.set('Access-Control-Allow-Origin', '*');

            return new Response(object.body, { headers });
        }

        // API Documentation [NEW]
        if (url.pathname === '/docs') {
            return new Response(docsHtml, {
                headers: {
                    'content-type': 'text/html;charset=UTF-8',
                },
            });
        }

        return new Response('404 Not Found', { status: 404 });
    },
};
