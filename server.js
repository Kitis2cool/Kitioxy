const express = require('express');
const axios = require('axios');
const { URL } = require('url');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

// Rewrite URLs in HTML/CSS/JS so all assets route through /proxy
function rewriteUrls(content, baseUrl, contentType) {

    function toProxyUrl(url) {
        if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
        try {
            const abs = new URL(url, baseUrl).href;
            return `/proxy?url=${encodeURIComponent(abs)}`;
        } catch { return url; }
    }

    if (contentType.includes('text/html')) {
        content = content
            .replace(/((?:src|href|action)\s*=\s*["'])([^"']+)(["'])/gi, (m, pre, url, post) => {
                return pre + toProxyUrl(url) + post;
            })
            .replace(/(srcset\s*=\s*["'])([^"']+)(["'])/gi, (m, pre, srcset, post) => {
                const rewritten = srcset.split(',').map(s => {
                    const parts = s.trim().split(/\s+/);
                    parts[0] = toProxyUrl(parts[0]);
                    return parts.join(' ');
                }).join(', ');
                return pre + rewritten + post;
            })
            .replace(/(url\(['"]?)([^'")\s]+)(['"]?\))/gi, (m, pre, url, post) => pre + toProxyUrl(url) + post)
            .replace(/<meta[^>]+http-equiv=["']?(x-frame-options|content-security-policy)["']?[^>]*>/gi, '')
            .replace('</head>', `
<script>
(function() {
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, url, ...args) {
        try {
            const abs = new URL(url, location.href).href;
            if (!abs.startsWith(location.origin)) {
                return _open.call(this, m, '/proxy?url=' + encodeURIComponent(abs), ...args);
            }
        } catch(e) {}
        return _open.call(this, m, url, ...args);
    };

    const _fetch = window.fetch;
    window.fetch = function(url, opts) {
        try {
            if (typeof url === 'string') {
                const abs = new URL(url, location.href).href;
                if (!abs.startsWith(location.origin)) {
                    url = '/proxy?url=' + encodeURIComponent(abs);
                }
            }
        } catch(e) {}
        return _fetch(url, opts);
    };
})();
</script>
</head>`);
    }

    if (contentType.includes('text/css')) {
        content = content.replace(/url\(['"]?([^'")\s]+)['"]?\)/gi, (m, url) => {
            return 'url(' + toProxyUrl(url) + ')';
        });
    }

    return content;
}

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            responseType: 'arraybuffer',
            maxRedirects: 10,
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Referer': new URL(targetUrl).origin,
                'Origin': new URL(targetUrl).origin,
            }
        });

        const contentType = (response.headers['content-type'] || '').toLowerCase();

        const skipHeaders = new Set([
            'content-security-policy',
            'x-frame-options',
            'x-content-type-options',
            'strict-transport-security',
            'content-encoding',
        ]);

        Object.keys(response.headers).forEach(key => {
            if (!skipHeaders.has(key.toLowerCase())) {
                res.setHeader(key, response.headers[key]);
            }
        });

        if (contentType.includes('text/html') || contentType.includes('text/css') || contentType.includes('javascript')) {
            const text = response.data.toString('utf-8');
            const rewritten = rewriteUrls(text, targetUrl, contentType);
            res.setHeader('content-type', contentType);
            return res.send(rewritten);
        }

        res.send(response.data);

    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send(`
            <html><body style="background:#313338;color:#f2f3f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
            <h2>Failed to load</h2>
            <p style="color:#80848e">${error.message}</p>
            <p style="color:#80848e;font-size:12px">${targetUrl}</p>
            </body></html>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`Kitoxy running at http://localhost:${PORT}`);
});