const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = 3000;

// Fixed proxy config
const PROXY_IP = '169.254.127.221';
const PROXY_PORT = '808';
const proxyAgent = new HttpsProxyAgent(`http://${PROXY_IP}:${PROXY_PORT}`);

// Serve static files from /public
app.use(express.static('public'));

// Proxy endpoint — usage: /proxy?url=https://example.com
app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing required parameter: url');
    }

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            responseType: 'stream',
            httpAgent: proxyAgent,
            httpsAgent: proxyAgent,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        // Forward response headers, strip CSP so pages render correctly
        Object.keys(response.headers).forEach(key => {
            if (key.toLowerCase() !== 'content-security-policy') {
                res.setHeader(key, response.headers[key]);
            }
        });

        response.data.pipe(res);

    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Routing traffic through ${PROXY_IP}:${PROXY_PORT}`);
});