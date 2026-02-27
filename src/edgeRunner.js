'use strict';

const fs = require('fs');
const path = require('path');

/**
 * EdgeRunner — Dynamic Lambda@Edge loader with multi-hook support and hot reload.
 *
 * Loads a user-provided Lambda@Edge module and runs it at the correct point
 * in the simulated CloudFront request/response lifecycle.
 *
 * Supported hook types (declared via exports.hookType in the Lambda module):
 *   - 'viewer-request'   : fires before cache check, can modify/reject the request
 *   - 'origin-request'   : fires before forwarding to origin, can rewrite URI/headers
 *   - 'origin-response'  : fires after origin responds, can modify response headers/body
 *   - 'viewer-response'  : fires before sending to viewer, can modify response headers
 *
 * If no hookType is declared, defaults to 'origin-request'.
 */
class EdgeRunner {
    constructor(edgePath, options = {}) {
        this.edgePath = path.resolve(edgePath);
        this.debug = options.debug || false;
        this.modules = {}; // hookType -> { handler, file }

        this._load();
        this._watch();
    }

    _load() {
        this.modules = {};
        try {
            const stat = fs.statSync(this.edgePath);
            if (stat.isDirectory()) {
                const files = fs.readdirSync(this.edgePath).filter(f => f.endsWith('.js'));
                for (const f of files) {
                    this._loadFile(path.join(this.edgePath, f));
                }
            } else {
                this._loadFile(this.edgePath);
            }
        } catch (err) {
            console.error(`❌ [CloudFrontize] Failed to load edge path: ${err.message}`);
        }
    }

    _loadFile(filePath) {
        try {
            // Clear from require cache to support hot reload
            delete require.cache[require.resolve(filePath)];
            const mod = require(filePath);

            // Ignore files without metadata
            if (!mod.hookType || !mod.handler) {
                return;
            }

            let hookType = mod.hookType || 'origin-request';

            const valid = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];
            if (!valid.includes(hookType)) {
                console.warn(`⚠️  [CloudFrontize] Unknown hookType "${hookType}" in ${filePath}. Defaulting to "origin-request".`);
                hookType = 'origin-request';
            }

            if (typeof mod.handler !== 'function') {
                return; // skip if no valid handler
            }

            if (this.modules[hookType]) {
                console.error(`Error: Found multiple handlers for '${hookType}' in ${path.basename(this.modules[hookType].file)} and ${path.basename(filePath)}. AWS CloudFront only supports one per trigger. Only one of each type is alllowed.`);
                process.exit(1);
            }

            this.modules[hookType] = { handler: mod.handler, file: filePath };

            if (this.debug) {
                console.log(`✅ [CloudFrontize] Loaded edge module: ${path.basename(filePath)} (${hookType})`);
            }
        } catch (err) {
            console.error(`❌ [CloudFrontize] Failed to load edge module: ${err.message}`);
        }
    }

    _watch() {
        try {
            fs.watch(this.edgePath, { persistent: false }, (eventType, filename) => {
                if (eventType === 'change' && filename && filename.endsWith('.js')) {
                    console.log(`🔄 [CloudFrontize] Edge module changed, reloading: ${filename || path.basename(this.edgePath)}`);
                    this._load();
                } else if (!filename) {
                    // For single files, filename might be null on some platforms
                    console.log(`🔄 [CloudFrontize] Edge module changed, reloading: ${path.basename(this.edgePath)}`);
                    this._load();
                }
            });
        } catch (err) {
            console.warn(`⚠️  [CloudFrontize] Could not watch edge path: ${err.message}`);
        }
    }

    /**
     * Run the Lambda handler with a simulated CloudFront event.
     * Returns a Promise resolving to the modified request or response object.
     */
    _invoke(handler, eventRecord) {
        return new Promise((resolve) => {
            const event = { Records: [{ cf: eventRecord }] };

            // AWS Lambda context mock
            const context = {
                functionName: 'cloudfrontize-local-function',
                functionVersion: '$LATEST',
                invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:cloudfrontize-local-function',
                memoryLimitInMB: '128',
                awsRequestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                logGroupName: '/aws/lambda/cloudfrontize-local-function',
                logStreamName: `2026/02/27/[$LATEST]${Math.random().toString(36).substr(2, 9)}`,
                callbackWaitsForEmptyEventLoop: true,
                getRemainingTimeInMillis: () => 3000 // Dummy value
            };

            const callback = (err, result) => {
                if (err) {
                    console.error(`❌ [CloudFrontize] Edge handler callback error: ${err.message || err}`);
                    return resolve(null); // Fail open — pass through
                }
                resolve(result);
            };

            try {
                const result = handler(event, context, callback);
                
                // If the handler returned a Promise (e.g., an async function)
                if (result && typeof result.then === 'function') {
                    result.then(
                        asyncResult => resolve(asyncResult),
                        asyncErr => {
                            console.error(`❌ [CloudFrontize] Edge async handler error: ${asyncErr.message || asyncErr}`);
                            resolve(null); // Fail open
                        }
                    );
                }
            } catch (err) {
                console.error(`❌ [CloudFrontize] Edge handler threw: ${err.message || err}`);
                resolve(null); // Fail open
            }
        });
    }

    /**
     * Build a CloudFront request event record from an incoming Node.js request.
     */
    _buildRequestRecord(req) {
        const headersRaw = req.headers || {};
        const cfHeaders = {};
        for (const [key, value] of Object.entries(headersRaw)) {
            cfHeaders[key.toLowerCase()] = [{ key, value: String(value) }];
        }

        const [uri, querystring] = (req.url || '').split('?');

        return {
            request: {
                method: req.method || 'GET',
                uri: uri || '/',
                querystring: querystring || '',
                headers: cfHeaders
            }
        };
    }

    /**
     * Validate against AWS CloudFront's blacklisted headers.
     * Emits a warning if a user attempts to mutate them.
     */
    _validateBlacklistedHeaders(headers, hookType) {
        if (!headers) return;
        const blacklisted = ['host', 'via', 'x-cache', 'x-forwarded-for'];
        for (const key of Object.keys(headers)) {
            const lowerKey = key.toLowerCase();
            if (blacklisted.includes(lowerKey) || lowerKey.startsWith('x-edge-') || lowerKey.startsWith('x-amz-')) {
                console.warn(`\x1b[33m⚠️  [CloudFrontize] WARNING: Modified blacklisted header "${key}" in ${hookType}. AWS CloudFront will reject this request/response with a 502 error.\x1b[0m`);
            }
        }
    }

    /**
     * Build a CloudFront response event record from a captured response.
     */
    _buildResponseRecord(req, responseData) {
        const requestRecord = this._buildRequestRecord(req);
        const cfHeaders = {};
        for (const [key, value] of Object.entries(responseData.headers || {})) {
            cfHeaders[key.toLowerCase()] = [{ key, value: String(value) }];
        }

        return {
            request: requestRecord.request,
            response: {
                status: String(responseData.status || 200),
                statusDescription: responseData.statusDescription || 'OK',
                headers: cfHeaders
            }
        };
    }

    /**
     * Run viewer-request or origin-request hook.
     * Returns the (potentially modified) request, or null to signal the Lambda
     * returned a short-circuit response (e.g. a 301 redirect).
     *
     * @param {import('http').IncomingMessage} req
     * @returns {Promise<{url: string, headers: object, type: string}|{shortCircuit: true, response: object}|null>}
     */
    async runRequestHook(req) {
        const vr = this.modules['viewer-request'];
        const or = this.modules['origin-request'];

        if (!vr && !or) return null;

        let record = this._buildRequestRecord(req);
        let finalType = null;

        if (vr) {
            const result = await this._invoke(vr.handler, record);
            if (!result) return null;
            if (result.status) {
                this._validateBlacklistedHeaders(result.headers, 'viewer-request (short-circuit)');
                return { shortCircuit: true, response: result, type: 'viewer-request' };
            }
            this._validateBlacklistedHeaders(result.headers, 'viewer-request');
            record.request = result;
            finalType = 'viewer-request';
        }

        if (or) {
            const result = await this._invoke(or.handler, record);
            if (!result) return null;
            if (result.status) {
                this._validateBlacklistedHeaders(result.headers, 'origin-request (short-circuit)');
                return { shortCircuit: true, response: result, type: 'origin-request' };
            }
            this._validateBlacklistedHeaders(result.headers, 'origin-request');
            record.request = result;
            finalType = 'origin-request';
        }

        const buildUrl = record.request.querystring ? `${record.request.uri}?${record.request.querystring}` : record.request.uri;
        return { url: buildUrl, headers: record.request.headers, type: finalType };
    }

    /**
     * Run origin-response or viewer-response hook.
     * Returns modified headers to apply to the outgoing response.
     *
     * @param {import('http').IncomingMessage} req
     * @param {{ status: number, headers: object }} responseData
     * @returns {Promise<object|null>} Updated headers object or null
     */
    async runResponseHook(req, responseData) {
        const or = this.modules['origin-response'];
        const vr = this.modules['viewer-response'];

        if (!or && !vr) return null;

        let record = this._buildResponseRecord(req, responseData);

        if (or) {
            const result = await this._invoke(or.handler, record);
            if (!result) return null;
            this._validateBlacklistedHeaders(result.headers, 'origin-response');
            record.response = result;
        }

        if (vr) {
            const result = await this._invoke(vr.handler, record);
            if (!result) return null;
            this._validateBlacklistedHeaders(result.headers, 'viewer-response');
            record.response = result;
        }

        // Flatten CloudFront header format back to plain key:value
        const flat = {};
        for (const [key, values] of Object.entries(record.response.headers || {})) {
            if (Array.isArray(values) && values.length > 0) {
                flat[key] = values[0].value;
            }
        }
        return flat;
    }
}

module.exports = { EdgeRunner };
