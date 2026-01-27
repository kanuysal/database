import products from './products.json';
import adminHtml from './admin.html';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // API Endpoint
        if (url.pathname === '/api/products') {
            return new Response(JSON.stringify(products), {
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

        return new Response('404 Not Found', { status: 404 });
    },
};
