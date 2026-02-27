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
        this.module = null;
        this.hookType = 'origin-request';

        this._load();
        this._watch();
    }

    _load() {
        try {
            // Clear from require cache to support hot reload
            delete require.cache[require.resolve(this.edgePath)];
            this.module = require(this.edgePath);
            this.hookType = this.module.hookType || 'origin-request';

            const valid = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];
            if (!valid.includes(this.hookType)) {
                console.warn(`⚠️  [CloudFrontize] Unknown hookType "${this.hookType}". Defaulting to "origin-request".`);
                this.hookType = 'origin-request';
            }

            if (typeof this.module.handler !== 'function') {
                throw new Error(`Edge module at ${this.edgePath} must export a "handler" function.`);
            }

            if (this.debug) {
                console.log(`✅ [CloudFrontize] Loaded edge module: ${path.basename(this.edgePath)} (${this.hookType})`);
            }
        } catch (err) {
            console.error(`❌ [CloudFrontize] Failed to load edge module: ${err.message}`);
            this.module = null;
        }
    }

    _watch() {
        try {
            fs.watch(this.edgePath, { persistent: false }, (eventType) => {
                if (eventType === 'change') {
                    console.log(`🔄 [CloudFrontize] Edge module changed, reloading: ${path.basename(this.edgePath)}`);
                    this._load();
                }
            });
        } catch (err) {
            console.warn(`⚠️  [CloudFrontize] Could not watch edge file: ${err.message}`);
        }
    }

    /**
     * Run the Lambda handler with a simulated CloudFront event.
     * Returns a Promise resolving to the modified request or response object.
     */
    _invoke(eventRecord) {
        return new Promise((resolve, reject) => {
            if (!this.module) return resolve(null);

            const event = { Records: [{ cf: eventRecord }] };

            try {
                this.module.handler(event, {}, (err, result) => {
                    if (err) {
                        console.error(`❌ [CloudFrontize] Edge handler error: ${err.message}`);
                        return resolve(null); // Fail open — pass through
                    }
                    resolve(result);
                });
            } catch (err) {
                console.error(`❌ [CloudFrontize] Edge handler threw: ${err.message}`);
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

        return {
            request: {
                method: req.method || 'GET',
                uri: req.url,
                querystring: '',
                headers: cfHeaders
            }
        };
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
     * @returns {Promise<{url: string, headers: object}|{shortCircuit: true, response: object}|null>}
     */
    async runRequestHook(req) {
        if (!this.module) return null;
        if (this.hookType !== 'viewer-request' && this.hookType !== 'origin-request') return null;

        const record = this._buildRequestRecord(req);
        const result = await this._invoke(record);
        if (!result) return null;

        // Lambda returned a response object (short-circuit, e.g. redirect)
        if (result.status) {
            return { shortCircuit: true, response: result };
        }

        // Lambda returned a modified request
        return { url: result.uri, headers: result.headers };
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
        if (!this.module) return null;
        if (this.hookType !== 'origin-response' && this.hookType !== 'viewer-response') return null;

        const record = this._buildResponseRecord(req, responseData);
        const result = await this._invoke(record);
        if (!result) return null;

        // Flatten CloudFront header format back to plain key:value
        const flat = {};
        for (const [key, values] of Object.entries(result.headers || {})) {
            if (Array.isArray(values) && values.length > 0) {
                flat[key] = values[0].value;
            }
        }
        return flat;
    }
}

module.exports = { EdgeRunner };
