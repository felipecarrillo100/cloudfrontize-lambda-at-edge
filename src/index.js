'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

function startServer(options) {
    const { edgeRunner } = options;

    const compressMiddleware = compression({
        filter: (req, res) => {
            if (res.getHeader('Content-Encoding')) return false;
            return compression.filter(req, res);
        }
    });

    const server = http.createServer(async (req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';

        // === 0. BODY BUFFERING ===
        let bodyBuffer = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            bodyBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => resolve(Buffer.concat(chunks)));
                req.on('error', reject);
            });
        }

        // === 1. REQUEST HOOKS ===
        if (edgeRunner) {
            // 40KB Limit Check (Fidelity)
            if (bodyBuffer && bodyBuffer.length > 40 * 1024) {
                const msg = `[CloudFrontize] Body exceeds 40KB limit (Current: ${(bodyBuffer.length / 1024).toFixed(1)}KB)`;
                if (options.strict) {
                    console.error(`🛑 ${msg} - AWS would reject this request via viewer-request.`);
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Body too large for viewer-request)');
                    return;
                }
                console.warn(`⚠️  ${msg}. This is allowed locally but AWS will reject it.`);
            }

            try {
                const hookResult = await edgeRunner.runRequestHook(req, bodyBuffer);

                if (hookResult) {
                    if (hookResult._isResponse) {
                        const body = hookResult.body || '';
                        const bodySize = Buffer.byteLength(body);

                        if (bodySize > 1024 * 1024) {
                            const msg = `[CloudFrontize] Generated response exceeds 1MB limit (Current: ${(bodySize / (1024 * 1024)).toFixed(2)}MB)`;
                            if (options.strict) {
                                console.error(`🛑 ${msg} - AWS would reject this response.`);
                                res.writeHead(502, { 'Content-Type': 'text/plain' });
                                res.end('Bad Gateway (Generated response too large)');
                                return;
                            }
                            console.warn(`⚠️  ${msg}. This is allowed locally but AWS will reject it.`);
                        }

                        const status = parseInt(hookResult.status) || 200;
                        res.writeHead(status, hookResult.headers);
                        res.end(body);
                        return;
                    }

                    // 🔥 THE FALLBACK LOGIC: Only apply rewrite if the file actually exists
                    if (hookResult.url) {
                        const potentialPath = path.join(options.directory, decodeURIComponent(hookResult.url.split('?')[0]));

                        if (fs.existsSync(potentialPath)) {
                            req.url = hookResult.url;

                            // Set compression headers for pre-compressed assets
                            if (req.url.endsWith('.br') && acceptEncoding.includes('br')) {
                                res.setHeader('Content-Encoding', 'br');
                            } else if (req.url.endsWith('.gz') && acceptEncoding.includes('gzip')) {
                                res.setHeader('Content-Encoding', 'gzip');
                            }
                        }
                    }

                    // Sync custom headers (Mobile/Geo/Security)
                    if (hookResult.headers) {
                        for (const [k, values] of Object.entries(hookResult.headers)) {
                            if (values && values[0]) res.setHeader(k, values[0].value);
                        }
                    }
                }
            } catch (err) {
                if (options.strict && err.message.includes('Forbidden:')) {
                    console.error(`🛑 Strict Mode Violation: ${err.message}`);
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Forbidden Header Mutation)');
                    return;
                }
                throw err;
            }
        }

        // === 2. RESPONSE HOOK INTERCEPTION ===
        if (edgeRunner) {
            const urlPath = decodeURIComponent(req.url.split('?')[0]);
            const fullPath = path.join(options.directory, urlPath);
            let initialStatus = 200;

            // Simulate status for Range/Partial Content for the hook to analyze
            if (req.headers.range) initialStatus = 206;
            if (!fs.existsSync(fullPath)) initialStatus = 404;

            const hookResponse = await edgeRunner.runResponseHook(req, {
                status: initialStatus,
                headers: res.getHeaders()
            });

            if (hookResponse && hookResponse.headers) {
                for (const [k, values] of Object.entries(hookResponse.headers)) {
                    if (values && values[0]) res.setHeader(k, values[0].value);
                }
            }
        }

        // === 3. STATIC FILE SERVING ===
        const runHandler = () => handler(req, res, {
            public: options.directory,
            cleanUrls: true,
            rewrites: options.single ? [{ source: '**', destination: '/index.html' }] : [],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: '**/*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] : []
        });

        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const fullPath = path.join(options.directory, urlPath);
        let shouldCompress = !options.noCompression;

        if (shouldCompress && fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
            const stats = fs.statSync(fullPath);
            // Skip compression for files > 10MB (CloudFront Fidelity)
            if (stats.size > 10 * 1024 * 1024) shouldCompress = false;
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
