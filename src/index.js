const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const { handler: edgeHandler } = require("./edge/contentNegotiation.js");

/**
 * Adapter to run a Lambda@Edge handler locally.
 * @param {string} url The request URL
 * @param {string} acceptEncoding The Accept-Encoding header value
 * @returns {{ uri: string, encoding: string|null }}
 */
function negotiate(url, acceptEncoding) {
    const event = {
        Records: [{
            cf: {
                request: {
                    uri: url,
                    headers: {
                        'accept-encoding': [{ key: 'Accept-Encoding', value: acceptEncoding }]
                    }
                }
            }
        }]
    };

    let resultUri = url;
    edgeHandler(event, {}, (err, request) => {
        if (!err && request) {
            resultUri = request.uri;
        }
    });

    let encoding = null;
    if (resultUri.endsWith('.br')) encoding = 'br';
    else if (resultUri.endsWith('.gz')) encoding = 'gzip';

    return { uri: resultUri, encoding };
}
function startServer(options) {
    const compressMiddleware = compression({
        threshold: 0,
        filter: (req, res) => {
            if (res.getHeader('Content-Encoding')) return false;

            // CloudFront Simulation: Only compress if smaller than 10MB
            // Note: In a real server we'd check the file size on disk here
            // but for the middleware we'll check the response length if available
            // or just rely on the general CloudFront 10MB behavior.
            const contentLength = res.getHeader('Content-Length');
            if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
                return false;
            }

            return compression.filter(req, res);
        }
    });

    const server = http.createServer((req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';

        // 1. CLOUDFRONT SIMULATION
        let { uri, encoding } = negotiate(req.url, acceptEncoding);

        // Check if the negotiated file actually exists
        if (encoding) {
            const fullPath = path.join(options.directory, uri);
            if (!fs.existsSync(fullPath)) {
                if (options.debug) console.log(`[CloudFrontize] Fallback: ${uri} not found, using original ${req.url}`);
                uri = req.url;
                encoding = null;
            }
        }

        if (encoding) {
            if (options.debug) console.log(`[CloudFrontize] Swapping: ${req.url} -> ${uri}`);
            req.url = uri;
            res.setHeader('Content-Encoding', encoding);

            // Determine Content-Type based on the original extension
            const originalUrl = req.url.replace(/\.(br|gz)$/, '');
            const type = (originalUrl.endsWith('.js'))
                ? 'application/javascript'
                : (originalUrl.endsWith('.css')) ? 'text/css' : 'text/plain';
            res.setHeader('Content-Type', type);
        }

        // 2. HYBRID COMPRESSION & STATIC SERVE
        const runHandler = () => handler(req, res, {
            public: options.directory,
            cleanUrls: true,
            rewrites: options.single ? [{ source: '**', destination: '/index.html' }] : [],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: "**/*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }] : []
        });

        if (!options.noCompression) {
            compressMiddleware(req, res, runHandler);
        } else {
            runHandler();
        }
    });

    server.listen(options.port, () => {
        if (!options.noRequestLogging) {
            console.log(`\n☁️  Cloudfrontize running on http://localhost:${options.port}`);
            if (options.debug) console.log(`🛠  Debug mode active`);
        }
    });
}

module.exports = { startServer };
