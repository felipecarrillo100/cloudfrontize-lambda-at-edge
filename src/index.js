'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { AWS_LIMITS } = require('./constants');

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
            // Body Limit Check (Fidelity)
            if (bodyBuffer && bodyBuffer.length > AWS_LIMITS.VIEWER_REQUEST_BODY_BYTES) {
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

                        if (bodySize > AWS_LIMITS.GENERATED_RESPONSE_BODY_BYTES) {
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
                        if (hookResult.headers) {
                            for (const [k, values] of Object.entries(hookResult.headers)) {
                                if (values && values[0]) res.setHeader(k, values[0].value);
                            }
                        }
                        res.writeHead(status);
                        res.end(body);
                        return;
                    }

                    // === FIDELITY: REWRITE HANDLING ===
                    if (hookResult.url) {
                        const potentialPath = path.join(options.directory, decodeURIComponent(hookResult.url.split('?')[0]));
                        const exists = fs.existsSync(potentialPath);

                        if (exists) {
                            req.url = hookResult.url;
                            // Set compression headers for pre-compressed assets
                            if (req.url.endsWith('.br') && acceptEncoding.includes('br')) {
                                res.setHeader('Content-Encoding', 'br');
                            } else if (req.url.endsWith('.gz') && acceptEncoding.includes('gzip')) {
                                res.setHeader('Content-Encoding', 'gzip');
                            }
                        } else {
                            // Target does not exist. 
                            if (options.strict) {
                                // In strict mode, we apply the rewrite anyway. serve-handler will then 404.
                                // This matches AWS behavior where a missing rewrite target results in a 404.
                                req.url = hookResult.url;
                            } else {
                                // Default mode: Safety fallback to the original file to prevent local 404s.
                                // But we MUST warn the user that this is non-fidelity behavior.
                                console.warn(`⚠️  [CloudFrontize] Lambda rewritten URI to "${hookResult.url}" but file was not found at "${potentialPath}".`);
                                console.warn(`   Falling back to original file. (Note: AWS Lambda@Edge would return a 404 for this request).`);
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

            try {
                const hookResponse = await edgeRunner.runResponseHook(req, {
                    status: initialStatus,
                    headers: res.getHeaders()
                });

                if (hookResponse && hookResponse.headers) {
                    for (const [k, values] of Object.entries(hookResponse.headers)) {
                        if (values && values[0]) res.setHeader(k, values[0].value);
                    }
                }
            } catch (err) {
                if (options.strict && err.message.includes('Forbidden:')) {
                    console.error(`🛑 Strict Mode Violation (Response): ${err.message}`);
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Forbidden Response Header Mutation)');
                    return;
                }
                throw err;
            }
        }

        // === 3. STATIC FILE SERVING ===
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const fullPath = path.join(options.directory, urlPath);

        // --- FIDELITY ENFORCEMENT (--mode rest) ---
        // If mode is 'rest', CloudFront does NOT automatically serve index.html for folders.
        // It looks for a literal key matching the exact URI.
        // We must check if the target is a directory. If it is, and NOT the root '/',
        // we return 403 or 404 (S3 returns 403 if listing is denied, or 404 if not found).
        const isRestMode = options.mode === 'rest';
        if (isRestMode && urlPath !== '/') {
            try {
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('403 Forbidden - Directory indexing is disabled in --mode rest. Use a Lambda@Edge origin-request hook to append index.html to the URI.');
                    return;
                }
            } catch (err) {
                // Ignore stat errors, let serve-handler handle 404s
            }
        }

        const runHandler = () => handler(req, res, {
            public: options.directory,
            cleanUrls: !isRestMode, // In rest mode, /about does NOT resolve to /about.html
            directoryListing: !isRestMode, // In rest mode, no auto UI for folders
            rewrites: [
                ...(options.single ? [{ source: '**', destination: '/index.html' }] : []),
                ...(isRestMode ? [{ source: '/', destination: '/index.html' }] : [])
            ],
            etag: !options.noEtag,
            headers: options.cors ? [{ source: '**/*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] : []
        });

        let shouldCompress = !options.noCompression;

        if (shouldCompress && fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
            const stats = fs.statSync(fullPath);
            // Skip compression for large files (CloudFront Fidelity)
            if (stats.size > AWS_LIMITS.COMPRESSION_BYPASS_BYTES) shouldCompress = false;
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
                const hooks = Object.keys(edgeRunner.modules)
                    .filter(k => edgeRunner.modules[k].length > 0)
                    .join(', ');
                console.log(`⚡ Edge modules loaded: ${hooks || 'none'}`);
            }
        }
    });
}

module.exports = { startServer };
