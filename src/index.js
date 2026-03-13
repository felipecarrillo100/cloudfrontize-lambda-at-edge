'use strict';

const http = require('http');
const handler = require('serve-handler');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AWS_LIMITS } = require('./constants');

function startServer(options) {
    const { edgeRunner, cffRunner, headersPath } = options;

    // 1. Load simulated headers from file (Simulation Truth)
    let defaultHeaders = options.defaultHeaders || {};
    if (headersPath && fs.existsSync(headersPath)) {
        try {
            const fileData = JSON.parse(fs.readFileSync(headersPath, 'utf8'));
            // Merge file headers with any headers passed directly via options (for tests)
            defaultHeaders = { ...fileData, ...defaultHeaders };
            if (options.debug) console.log(`[CloudFrontize] Loaded headers from: ${headersPath}`);
        } catch (err) {
            console.error(`🛑 Error parsing headers file: ${err.message}`);
        }
    }

    const compressMiddleware = compression({
        filter: (req, res) => {
            if (res.getHeader('Content-Encoding')) return false;
            return compression.filter(req, res);
        }
    });

    const server = http.createServer(async (req, res) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const requestID = crypto.randomBytes(4).toString('hex');

        // === 0. DEFAULT HEADER INJECTION ===
        if (defaultHeaders) {
            for (const [key, value] of Object.entries(defaultHeaders)) {
                const lowerKey = key.toLowerCase();
                if (req.headers[lowerKey] === undefined) {
                    req.headers[lowerKey] = value;
                }
            }
        }

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

        // --- 1a. CloudFront Functions (viewer-request) ---
        if (cffRunner) {
            try {
                const cffEvent = cffRunner.toCFFEvent(req, bodyBuffer, 'viewer-request');
                const cffResult = await cffRunner.runChain('viewer-request', cffEvent);
                const mappedResult = cffRunner.fromCFFEvent(cffResult);

                if (mappedResult) {
                    if (mappedResult._isResponse) {
                        const status = parseInt(mappedResult.status) || 200;
                        if (mappedResult.headers) {
                            for (const [k, values] of Object.entries(mappedResult.headers)) {
                                if (values && values.length > 0) {
                                    const headerVals = values.map(v => v.value);
                                    res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                                }
                            }
                        }
                        res.writeHead(status);
                        res.end(mappedResult.body || '');
                        return;
                    }

                    if (mappedResult.url) req.url = mappedResult.url;
                    if (mappedResult.headers) {
                        for (const [k, values] of Object.entries(mappedResult.headers)) {
                            if (values && values.length > 0) {
                                // Sync first value to req.headers for downstream L@E access
                                req.headers[k.toLowerCase()] = values[0].value;
                                const headerVals = values.map(v => v.value);
                                res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`🛑 [CFF] viewer-request error: ${err.message}`);
            }
        }

        // --- 1b. Lambda@Edge (viewer-request, origin-request) ---
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
                const hookResult = await edgeRunner.runRequestHook(req, bodyBuffer, requestID);

                if (hookResult === null && options.strict) {
                    console.error('🛑 Strict Mode Violation: Lambda execution timed out and was aborted.');
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Lambda Execution Timeout)');
                    return;
                }

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
                                if (values && values.length > 0) {
                                    const headerVals = values.map(v => v.value);
                                    res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                                }
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
                            if (values && values.length > 0) {
                                const headerVals = values.map(v => v.value);
                                res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                            }
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
                }, requestID);

                if (hookResponse === null && options.strict) {
                    console.error('🛑 Strict Mode Violation: Lambda execution timed out and was aborted.');
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Bad Gateway (Lambda Execution Timeout)');
                    return;
                }

                if (hookResponse && hookResponse.headers) {
                    for (const [k, values] of Object.entries(hookResponse.headers)) {
                        if (values && values.length > 0) {
                            const headerVals = values.map(v => v.value);
                            res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                        }
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

        // --- 2b. CloudFront Functions (viewer-response) ---
        if (cffRunner) {
            try {
                // Determine current status for the CFF event
                const urlPath = decodeURIComponent(req.url.split('?')[0]);
                const fullPath = path.join(options.directory, urlPath);
                let initialStatus = res.statusCode || 200;
                if (!res.statusCode && !fs.existsSync(fullPath)) initialStatus = 404;

                const cffEvent = cffRunner.toCFFEvent(req, bodyBuffer, 'viewer-response', {
                    status: initialStatus,
                    headers: res.getHeaders()
                });

                const cffResult = await cffRunner.runChain('viewer-response', cffEvent);
                const mappedResult = cffRunner.fromCFFEvent(cffResult);

                if (mappedResult && mappedResult.headers) {
                    for (const [k, values] of Object.entries(mappedResult.headers)) {
                        if (values && values.length > 0) {
                            const headerVals = values.map(v => v.value);
                            res.setHeader(k, headerVals.length === 1 ? headerVals[0] : headerVals);
                        }
                    }
                }

                if (mappedResult && mappedResult.status) {
                    res.statusCode = parseInt(mappedResult.status);
                }
            } catch (err) {
                console.error(`🛑 [CFF] viewer-response error: ${err.message}`);
            }
        }

        // === 3. STATIC FILE SERVING ===
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const fullPath = path.join(options.directory, urlPath);

        // --- FIDELITY ENFORCEMENT (--mode rest) ---
        const isRestMode = options.mode === 'rest';
        if (options.debug) console.log(`[Debug] Mode: ${options.mode}, isRestMode: ${isRestMode}, URL: ${req.url}, FullPath: ${fullPath}`);

        if (isRestMode && urlPath !== '/') {
            try {
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                    if (options.debug) console.log(`[Debug] Triggering 403 for directory: ${fullPath}`);
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
            // cleanUrls is intentionally DISABLED in all modes.
            // S3 (both Website Hosting and REST/OAC) never strips .html extensions or does
            // clean-URL redirects. Enabling it creates infinite redirect loops when a
            // Lambda@Edge hook rewrites a path to '/index.html'.
            cleanUrls: false,
            directoryListing: !isRestMode, // In rest mode, no auto directory listing UI
            rewrites: [
                { source: '/', destination: '/index.html' },
                ...(options.single ? [{ source: '**', destination: '/index.html' }] : [])
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
                Object.entries(edgeRunner.modules).forEach(([hook, mods]) => {
                    if (mods.length > 0) {
                        const filename = path.basename(mods[0].file);
                        console.log(`⚡ ${hook} (${filename})`);
                    }
                });
            }
            if (cffRunner) {
                Object.entries(cffRunner.functions).forEach(([hook, fns]) => {
                    fns.forEach(fn => {
                        console.log(`⚡ [CFF] ${hook} (${fn.name})`);
                    });
                });
            }
        }
    });
}

module.exports = { startServer };
