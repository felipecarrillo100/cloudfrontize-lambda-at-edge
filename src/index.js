'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

/**
 * Patch res.writeHead so we can inject extra headers from a response hook
 * before they are sent to the client.
 */
function patchResponseHeaders(res) {
    const original = res.writeHead.bind(res);

    res.writeHead = function (statusCode, statusMessage, headers) {
        if (typeof statusMessage === 'object' && !Array.isArray(statusMessage)) {
            headers = statusMessage;
            statusMessage = undefined;
        }
        headers = headers || {};

        // Apply headers set via res.setHeader previously in the hook
        return statusMessage !== undefined
            ? original(statusCode, statusMessage, headers)
            : original(statusCode, headers);
    };
}

function startServer(options) {
    const { edgeRunner } = options;

    // Standard compression config (threshold logic moved to pre-flight check)
    const compressMiddleware = compression({
        filter: (req, res) => {
            // Respect existing encoding if set by Edge hooks (e.g., .br / .gz rewrites)
            if (res.getHeader('Content-Encoding')) return false;
            return compression.filter(req, res);
        }
    });

    const server = http.createServer(async (req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';

        // === 1. REQUEST HOOKS ===
        if (edgeRunner) {
            const hookResult = await edgeRunner.runRequestHook(req);

            if (hookResult) {
                // Handle Lambda-generated responses (e.g., 302 redirects or 403s)
                if (hookResult.status) {
                    const status = parseInt(hookResult.status) || 200;
                    const outHeaders = {};
                    for (const [key, values] of Object.entries(hookResult.headers || {})) {
                        if (Array.isArray(values) && values.length > 0) {
                            outHeaders[key] = values[0].value;
                        }
                    }
                    res.writeHead(status, outHeaders);
                    res.end();
                    return;
                }

                // Handle URI Rewrites
                if (hookResult.url && hookResult.url !== req.url) {
                    if (options.debug) {
                        console.log(`[CloudFrontize] ${hookResult.type || 'request-hook'}: ${req.url} -> ${hookResult.url}`);
                    }

                    if (hookResult.type === 'origin-request') {
                        const fullPath = path.join(options.directory, hookResult.url);
                        if (fs.existsSync(fullPath)) {
                            req.url = hookResult.url;
                            // Native AWS fidelity for pre-compressed assets
                            if (hookResult.url.endsWith('.br') && acceptEncoding.includes('br')) {
                                res.setHeader('Content-Encoding', 'br');
                                const base = hookResult.url.replace(/\.br$/, '');
                                res.setHeader('Content-Type', base.endsWith('.js') ? 'application/javascript' : 'text/css');
                            } else if (hookResult.url.endsWith('.gz') && acceptEncoding.includes('gzip')) {
                                res.setHeader('Content-Encoding', 'gzip');
                                const base = hookResult.url.replace(/\.gz$/, '');
                                res.setHeader('Content-Type', base.endsWith('.js') ? 'application/javascript' : 'text/css');
                            }
                        }
                    } else {
                        req.url = hookResult.url;
                    }
                }
            }
        }

        // === 2. RESPONSE HOOK SETUP ===
        if (edgeRunner && (edgeRunner.modules['origin-response'] || edgeRunner.modules['viewer-response'])) {
            const mockResponseData = { status: 200, headers: {} };
            const hookResponse = await edgeRunner.runResponseHook(req, mockResponseData);
            if (hookResponse && hookResponse.headers) {
                for (const [k, values] of Object.entries(hookResponse.headers)) {
                    if (values && values[0]) {
                        res.setHeader(k, values[0].value);
                    }
                }
            }
        }

        // === 3. STATIC FILE SERVING & COMPRESSION PRE-FLIGHT ===
        const runHandler = () => handler(req, res, {
            public: options.directory,
            cleanUrls: true,
            rewrites: options.single ? [{ source: '**', destination: '/index.html' }] : [],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: '**/*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] : []
        });

        // Determine if we should compress based on actual file size (CloudFront Fidelity)
        let shouldCompress = !options.noCompression;

        if (shouldCompress) {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const fullPath = path.join(options.directory, urlPath);

            if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
                const stats = fs.statSync(fullPath);
                // CloudFront 10MB Threshold Logic
                if (stats.size > 10 * 1024 * 1024) {
                    shouldCompress = false;
                    if (options.debug) console.log(`[CloudFrontize] Skipping compression: ${urlPath} is > 10MB`);
                }
            }
        }

        if (shouldCompress) {
            compressMiddleware(req, res, runHandler);
        } else {
            runHandler();
        }
    });

    const sockets = new Set();
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });

    server.closeGracefully = function () {
        return new Promise(resolve => {
            if (edgeRunner) edgeRunner.close();
            for (const socket of sockets) socket.destroy();
            server.close(() => resolve());
        });
    };

    return server.listen(options.port, () => {
        if (!options.noRequestLogging) {
            console.log(`\n☁️  Cloudfrontize running on http://localhost:${options.port}`);
            if (edgeRunner) {
                const hooks = Object.keys(edgeRunner.modules).join(', ');
                console.log(`⚡ Edge modules loaded: ${hooks || 'none'}`);
            }
        }
    });
}

module.exports = { startServer };
