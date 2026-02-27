'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

/**
 * Patch res.writeHead so we can inject extra headers from a response hook
 * before they are sent to the client.
 *
 * @param {import('http').ServerResponse} res
 * @param {function({status:number, headers:object}): Promise<object|null>} onBeforeWrite
 */
function patchResponseHeaders(res, onBeforeWrite) {
    const original = res.writeHead.bind(res);

    res.writeHead = function (statusCode, statusMessage, headers) {
        // Normalise overloaded signature
        if (typeof statusMessage === 'object' && !Array.isArray(statusMessage)) {
            headers = statusMessage;
            statusMessage = undefined;
        }
        headers = headers || {};

        // Collect currently set headers
        const existing = {};
        const rawHeaders = res.getHeaders ? res.getHeaders() : {};
        for (const [k, v] of Object.entries(rawHeaders)) {
            existing[k.toLowerCase()] = v;
        }

        // Fire the async hook — but writeHead must be synchronous in Node.
        // We inject headers we already know synchronously from the hook's last result.
        const extra = res._pendingEdgeHeaders || {};
        for (const [k, v] of Object.entries(extra)) {
            res.setHeader(k, v);
        }

        return statusMessage !== undefined
            ? original(statusCode, statusMessage, headers)
            : original(statusCode, headers);
    };
}

function startServer(options) {
    const { edgeRunner } = options;

    // CloudFront Simulation: Only compress files smaller than 10MB
    const compressMiddleware = compression({
        threshold: 0,
        filter: (req, res) => {
            if (res.getHeader('Content-Encoding')) return false;
            const contentLength = res.getHeader('Content-Length');
            if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
                return false;
            }
            return compression.filter(req, res);
        }
    });

    const server = http.createServer(async (req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';

        // === 1. REQUEST HOOKS (viewer-request, origin-request) ===
        if (edgeRunner) {
            const hookResult = await edgeRunner.runRequestHook(req);

            if (hookResult) {
                // Lambda short-circuited — e.g. a redirect response
                if (hookResult.shortCircuit) {
                    const cfRes = hookResult.response;
                    const status = parseInt(cfRes.status) || 200;
                    const outHeaders = {};
                    for (const [key, values] of Object.entries(cfRes.headers || {})) {
                        if (Array.isArray(values) && values.length > 0) {
                            outHeaders[key] = values[0].value;
                        }
                    }
                    res.writeHead(status, outHeaders);
                    res.end();
                    return;
                }

                // Lambda modified the request URI
                if (hookResult.url && hookResult.url !== req.url) {
                    if (options.debug) {
                        console.log(`[CloudFrontize] ${hookResult.type || 'request-hook'}: ${req.url} -> ${hookResult.url}`);
                    }

                    // For origin-request: check if the rewritten file exists
                    if (hookResult.type === 'origin-request') {
                        const fullPath = path.join(options.directory, hookResult.url);
                        if (fs.existsSync(fullPath)) {
                            req.url = hookResult.url;

                            // Set Content-Encoding and Content-Type for pre-compressed assets
                            if (hookResult.url.endsWith('.br') && acceptEncoding.includes('br')) {
                                res.setHeader('Content-Encoding', 'br');
                                const base = hookResult.url.replace(/\.br$/, '');
                                res.setHeader('Content-Type', base.endsWith('.js') ? 'application/javascript' : 'text/css');
                            } else if (hookResult.url.endsWith('.gz') && acceptEncoding.includes('gzip')) {
                                res.setHeader('Content-Encoding', 'gzip');
                                const base = hookResult.url.replace(/\.gz$/, '');
                                res.setHeader('Content-Type', base.endsWith('.js') ? 'application/javascript' : 'text/css');
                            }
                        } else {
                            if (options.debug) {
                                console.log(`[CloudFrontize] Fallback: ${hookResult.url} not found, serving original`);
                            }
                            // Keep original req.url (no rewrite)
                        }
                    } else {
                        req.url = hookResult.url;
                    }
                }
            }
        }

        // === 2. RESPONSE HOOK SETUP (origin-response, viewer-response) ===
        // We pre-run the hook with a mock 200 response snapshot and pre-apply
        // the resulting headers via setHeader() BEFORE the static handler runs.
        // This avoids ERR_HTTP_HEADERS_SENT since headers are set before any write().
        if (edgeRunner && (edgeRunner.modules['origin-response'] || edgeRunner.modules['viewer-response'])) {
            const mockResponseData = { status: 200, headers: {} };
            const extraHeaders = await edgeRunner.runResponseHook(req, mockResponseData);
            if (extraHeaders) {
                for (const [k, v] of Object.entries(extraHeaders)) {
                    res.setHeader(k, v);
                }
                if (options.debug) {
                    console.log(`[CloudFrontize] response-hooks: injected ${Object.keys(extraHeaders).join(', ')}`);
                }
            }
        }

        // === 3. STATIC FILE SERVING WITH CLOUDFRONT-STYLE COMPRESSION ===
        const runHandler = () => handler(req, res, {
            public: options.directory,
            cleanUrls: true,
            rewrites: options.single ? [{ source: '**', destination: '/index.html' }] : [],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: '**/*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] : []
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
            if (edgeRunner) {
                const hooks = Object.keys(edgeRunner.modules).join(', ');
                console.log(`⚡ Edge modules loaded from: ${path.basename(edgeRunner.edgePath)} (${hooks || 'none'})`);
            }
            if (options.debug) console.log(`🛠  Debug mode active`);
        }
    });
}

module.exports = { startServer };
