const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = 'D:/minadesign/github/antigravity/SERKAN/Keystatic/public/content/products';
// We use the worker's own domain as a proxy to avoid domain connection issues
const API_BASE = 'https://database.minalidya.wedding';
const BUCKET_NAME = 'minalidya-assets';

// Helper to map Keystatic slugs to nice Turkish labels for frontend compatibility
const labelMap = {
    "prenses": "Prenses", "balik": "Balık", "a-kesim": "A Kesim", "helen": "Helen", "duz": "Düz",
    "hakim-yaka": "Hakim Yaka", "v-yaka": "V Yaka", "kare-yaka": "Kare Yaka", "kayik-yaka": "Kayık Yaka", "straplez": "Straplez", "kalp-yaka": "Kalp Yaka", "halter-yaka": "Halter Yaka", "m-yaka": "M Yaka",
    "uzun-kol": "Uzun Kol", "kisa-kol": "Kısa Kol", "askili": "Askılı", "straplez-kol": "Straplez", "balon-kol": "Balon Kol", "dusuk-kol": "Düşük Kol", "tek-kol": "Tek Kol"
};

const resolveLabel = (slug) => {
    if (!slug) return '';
    if (labelMap[slug]) return labelMap[slug]; // Check exact match first

    // Fallback: Remove prefixes like 'material-' or 'size-' if they exist
    const cleanSlug = slug.replace(/^[a-z]+-/, '');
    return labelMap[cleanSlug] || cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
};

// --- SMART PATH RESOLVER ---
function resolveImage(productDir, dirName, fileName) {
    if (!fileName) return null;

    const possiblePaths = [
        path.join(productDir, fileName),
        path.join(productDir, 'index', fileName),
    ];

    // Add extension-flexible alternatives (Keystatic often converts png -> avif)
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const subParts = fileName.split('/');
    const subDir = subParts.length > 1 ? subParts[0] : null;
    const subFile = subParts.length > 1 ? subParts[1] : fileName;
    const subBase = subFile.replace(/\.[^/.]+$/, "");

    ['.avif', '.png', '.jpg', '.jpeg', '.webp'].forEach(ext => {
        // Direct or in index/
        possiblePaths.push(path.join(productDir, baseName + ext));
        possiblePaths.push(path.join(productDir, 'index', baseName + ext));

        // Gallery subfolders (common in modern Keystatic)
        possiblePaths.push(path.join(productDir, 'gallery', baseName + ext));
        possiblePaths.push(path.join(productDir, 'index', 'gallery', baseName + ext));

        if (subDir) {
            possiblePaths.push(path.join(productDir, subDir, subBase + ext));
            possiblePaths.push(path.join(productDir, 'index', subDir, subBase + ext));
        }
    });

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            // Found it! Return the local path and the key to use in R2
            const actualName = path.basename(p);
            // If it was in index/, we keep that in the key if we want, or flatten. 
            // We'll flatten the R2 structure to dir/image.ext for simplicity unless it's in a sub-sub folder.
            const inSub = p.includes(path.sep + 'gallery' + path.sep) || p.includes(path.sep + 'index' + path.sep + 'gallery' + path.sep);
            const r2Key = inSub ? `${dirName}/gallery/${actualName}` : `${dirName}/${actualName}`;

            return { local: p, r2Key: r2Key, url: `${API_BASE}/images/${encodeURIComponent(r2Key)}` };
        }
    }
    return null;
}

async function prepare() {
    console.log('--- Universal Bridge v4 (Smart Sync) Start ---');
    const products = [];
    const uploadCommands = [];

    const dirs = fs.readdirSync(PRODUCTS_DIR).filter(d => fs.statSync(path.join(PRODUCTS_DIR, d)).isDirectory());

    for (const dir of dirs) {
        const productPath = path.join(PRODUCTS_DIR, dir);
        const indexPath = path.join(productPath, 'index.json');
        if (!fs.existsSync(indexPath)) continue;

        try {
            const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

            // --- IMAGE RESOLUTION WITH FALLBACKS ---
            let coverFile = data.cover;
            if (!coverFile) {
                // Fallback: search for any "cover.*" in the product directory
                const files = fs.readdirSync(productPath);
                const found = files.find(f => f.startsWith('cover.'));
                if (found) coverFile = found;
                else {
                    // Try inside index/
                    const indexPath = path.join(productPath, 'index');
                    if (fs.existsSync(indexPath)) {
                        const indexFiles = fs.readdirSync(indexPath);
                        const indexFound = indexFiles.find(f => f.startsWith('cover.'));
                        if (indexFound) coverFile = indexFound;
                    }
                }
            }

            const coverRes = resolveImage(productPath, dir, coverFile);
            if (coverRes) {
                uploadCommands.push(`call npx wrangler r2 object put ${BUCKET_NAME}/${coverRes.r2Key} --file="${coverRes.local}" --remote`);
            }

            // Gallery Fallback
            let galleryFiles = (data.gallery || []).filter(g => g !== null);
            if (galleryFiles.length === 0) {
                // Check if a gallery folder exists
                const galPath = fs.existsSync(path.join(productPath, 'gallery')) ? path.join(productPath, 'gallery') :
                    (fs.existsSync(path.join(productPath, 'index', 'gallery')) ? path.join(productPath, 'index', 'gallery') : null);

                if (galPath) {
                    galleryFiles = fs.readdirSync(galPath).filter(f => /\.(avif|webp|png|jpg|jpeg)$/i.test(f));
                }
            }

            const galleryObjs = galleryFiles.map(img => resolveImage(productPath, dir, img)).filter(x => x);
            galleryObjs.forEach(res => {
                uploadCommands.push(`call npx wrangler r2 object put ${BUCKET_NAME}/${res.r2Key} --file="${res.local}" --remote`);
            });

            const coverUrl = coverRes ? coverRes.url : '';
            const galleryUrls = galleryObjs.map(res => res.url);

            // 3. Modest Logic Enhancement (Explicit Selection + Smart Fallbacks)
            const hasModestTag = (data.tags?.tr || []).some(t => t.toLowerCase().includes('tesettür'));

            const isActuallyModest = data.isModest === 'yes' ||
                data.isModest === true ||
                data.brand === 'brand-mina-lidya-modest' ||
                data.category === 'tesettur' ||
                data.neckline === 'hakim-yaka' ||
                hasModestTag;

            products.push({
                id: data.id || dir,
                name: data.productName || data.title?.tr || dir,
                category: data.category || 'Diger',
                image: coverUrl,
                description: data.shortDescription?.tr || '',
                price: data.price ? `${data.price} TL` : 'Iletisim',
                slug: dir,
                gallery: galleryUrls,
                isModest: isActuallyModest, // TOP LEVEL for frontend compatibility

                images: [{ src: coverUrl }, ...galleryUrls.map(u => ({ src: u }))],
                mappedAttributes: {
                    "Etek Kesimi": resolveLabel(data.silhouette),
                    "Yaka Tipi": resolveLabel(data.neckline),
                    "Kol Tipi": resolveLabel(data.sleeve),
                    "Kumaş": (data.material || []).map(resolveLabel).join(', '),
                    "Beden": (data.size || []).map(resolveLabel).join(', '),
                    "Renk": (data.color || []).map(resolveLabel).join(', '),
                    "Tesettür Uyumu": isActuallyModest ? "Evet" : "Hayır"
                },

                silhouette: data.silhouette || '',
                neckline: data.neckline || '',
                sleeve: data.sleeve || '',
                color: data.color || [],
                material: data.material || [],
                brand: data.brand || '',
                size: data.size || [],
                availability: data.availability || 'satilik',
                usage: data.usage || [],
                features: data.features || [],
                tags: data.tags?.tr || []
            });
        } catch (e) {
            console.error(`Error processing ${dir}:`, e.message);
        }
    }

    const apiJsonPath = 'D:/minadesign/github/antigravity/SERKAN/my-product-api/src/products.json';
    fs.writeFileSync(apiJsonPath, JSON.stringify(products, null, 2), 'utf8');

    // De-duplicate upload commands
    const uniqueUploads = [...new Set(uploadCommands)];
    const batchScriptPath = 'D:/minadesign/github/antigravity/SERKAN/my-product-api/upload-assets.bat';
    fs.writeFileSync(batchScriptPath, `@echo off\necho --- BULK UPLOAD TO CLOUDFLARE R2 STARTS ---\n` + uniqueUploads.join('\n') + `\necho --- DONE ---`, 'utf8');

    console.log(`\n- Synced ${products.length} products.`);
    console.log(`- Queued ${uniqueUploads.length} images for R2 (Smart Resolution applied).`);
    console.log('\nFinal Step: Run "upload-assets.bat" then "npx wrangler deploy"');
}

prepare();
