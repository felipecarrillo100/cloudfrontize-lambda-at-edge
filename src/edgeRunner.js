'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');

class EdgeRunner {
    constructor(edgePath, options = {}) {
        this.edgePath = path.resolve(edgePath);
        this.envPath = options.envPath;
        this.bakePath = options.bakePath;
        this.outputPath = options.outputPath;

        this.modules = {
            'viewer-request': [],
            'origin-request': [],
            'origin-response': [],
            'viewer-response': []
        };

        this.envVars = {};
        this.bakeVars = {};
        this.watchers = [];
        this.whitelist = [
            'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_LAMBDA_FUNCTION_NAME',
            'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
            'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME',
            'NODE_OPTIONS', 'TZ', 'LANG', 'PATH'
        ];

        this._loadFidelityFiles();
        this._load();

        if (options.watch !== false) {
            this._watch();
        }
    }

    /* =========================================================
       FIDELITY: LOAD & SANDBOX (Checklist Item 9)
    ========================================================= */

    _load() {
        Object.keys(this.modules).forEach(k => this.modules[k] = []);
        if (!fs.existsSync(this.edgePath)) return;

        const stat = fs.statSync(this.edgePath);
        const files = stat.isDirectory()
            ? fs.readdirSync(this.edgePath).filter(f => f.endsWith('.js'))
            : [this.edgePath];

        files.forEach(f => {
            this._loadFile(stat.isDirectory() ? path.join(this.edgePath, f) : f);
        });
    }

    _loadFile(filePath) {
        let code = fs.readFileSync(filePath, 'utf8');
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

        if (this.outputPath) {
            fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
            fs.writeFileSync(this.outputPath, code);
        }

        const mockModule = { exports: {} };
        const sandbox = {
            module: mockModule, exports: mockModule.exports,
            Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
            URL, URLSearchParams, TextEncoder, TextDecoder,
            process: { env: { ...this.envVars }, nextTick: process.nextTick, version: process.version },
            require: (id) => {
                const forbidden = ['fs', 'child_process', 'os'];
                if (forbidden.includes(id)) throw new Error(`Forbidden: ${id}`);
                return id.startsWith('.') ? require(path.resolve(path.dirname(filePath), id)) : require(id);
            },
            __dirname: path.dirname(filePath),
            __filename: filePath
        };

        sandbox.global = sandbox;
        vm.createContext(sandbox);
        new vm.Script(code).runInContext(sandbox);

        const mod = mockModule.exports;
        if (mod.handler && mod.hookType) {
            this.modules[mod.hookType].push({ handler: mod.handler, file: filePath });
        }
    }

    /* =========================================================
       FIDELITY: REQUEST PIPELINE (Checklist Item 1, 4, 12)
    ========================================================= */

    async runRequestHook(req) {
        let request = this._buildRequestRecord(req);

        for (const type of ['viewer-request', 'origin-request']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(request.headers);

                // Invoke the Lambda handler
                const result = await this._invoke(mod.handler, request, type);

                if (!result) continue;

                // Short-circuit: Response returned instead of request mutation
                if (result.status && !result.uri) {
                    const finalResponse = this._flatten(result);
                    finalResponse._isResponse = true;
                    finalResponse.type = type;
                    return finalResponse;
                }

                // Apply Mutations (The "Connective Tissue")
                if (result.uri !== undefined) request.uri = result.uri;
                if (result.querystring !== undefined) request.querystring = result.querystring;

                if (result.headers) {
                    this._validateBlacklistedHeaders(originalHeaders, result.headers, type);
                    request.headers = this._normalizeHeadersInternal(result.headers);
                }

                // Origin Persistence (Fixes Country/Geo routing failures)
                if (result.origin) {
                    request.origin = request.origin || {};
                    if (result.origin.custom) {
                        request.origin.custom = { ...(request.origin.custom || {}), ...result.origin.custom };
                    }
                    if (result.origin.s3) {
                        request.origin.s3 = { ...(request.origin.s3 || {}), ...result.origin.s3 };
                    }
                }
                request.type = type;
            }
        }

        return this._flatten(request);
    }

    /* =========================================================
       FIDELITY: RESPONSE PIPELINE (Checklist Item 1)
    ========================================================= */

    async runResponseHook(req, resData) {
        const request = this._buildRequestRecord(req);
        let response = {
            status: String(resData.status || 200),
            statusDescription: 'OK',
            headers: this._normalizeHeadersInternal(resData.headers || {})
        };

        for (const type of ['origin-response', 'viewer-response']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(response.headers);
                const result = await this._invoke(mod.handler, { request, response }, type);

                response = result?.response || result || response;

                if (response.headers) {
                    this._validateBlacklistedHeaders(originalHeaders, response.headers, type);
                    response.headers = this._normalizeHeadersInternal(response.headers);
                }
            }
        }
        return this._flatten(response);
    }

    /* =========================================================
       FIDELITY: HELPERS (Checklist Item 2, 7, 10)
    ========================================================= */

    _invoke(handler, record, type) {
        return new Promise((resolve, reject) => {
            const cloned = this._deepClone(record);
            const cf = type.includes('response') ? { request: cloned.request, response: cloned.response } : { request: cloned };
            const event = { Records: [{ cf }] };
            const context = { functionName: 'edgeRunner', getRemainingTimeInMillis: () => 3000 };

            // Enforce 3s execution limit
            const timer = setTimeout(() => resolve(null), 3000);

            try {
                const result = handler(event, context, (err, res) => {
                    clearTimeout(timer);
                    if (err) reject(err); else resolve(res);
                });

                if (result && typeof result.then === 'function') {
                    result.then(res => { clearTimeout(timer); resolve(res); }).catch(reject);
                } else if (result !== undefined) {
                    clearTimeout(timer);
                    resolve(result);
                }
            } catch (e) {
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    _buildRequestRecord(req) {
        const urlStr = req.url || '/';
        const urlObj = new URL(urlStr, 'http://localhost');

        // QueryString Determinism (Sorting for Cache Keys)
        const params = [...urlObj.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const normalizedQs = new URLSearchParams(params).toString();

        return {
            method: req.method || 'GET',
            uri: urlObj.pathname,
            querystring: normalizedQs,
            headers: this._normalizeHeadersInternal(req.headers || {})
        };
    }

    _normalizeHeadersInternal(input) {
        const headers = {};
        for (const [k, v] of Object.entries(input)) {
            const key = k.toLowerCase();
            const val = Array.isArray(v) ? (v[0]?.value ?? v[0]) : (v?.value ?? v);
            headers[key] = [{ key: k, value: String(val) }];
        }
        return headers;
    }

    _validateBlacklistedHeaders(original, final, hook) {
        const blacklist = ['host', 'via', 'connection'];
        blacklist.forEach(key => {
            const getVal = (headers) => {
                if (!headers) return null;
                const actualKey = Object.keys(headers).find(k => k.toLowerCase() === key);
                return actualKey ? headers[actualKey][0]?.value : null;
            };
            if (getVal(original) !== getVal(final)) {
                console.warn(`[CloudFrontize] Warning: ${hook} modified blacklisted header "${key}"`);
            }
        });
    }

    _flatten(obj) {
        if (!obj) return obj;
        // Shallow copy for output to prevent mutation of internal state
        const out = { ...obj };

        if (obj.headers) {
            Object.keys(obj.headers).forEach(k => {
                const v = obj.headers[k]?.[0]?.value;
                if (v !== undefined) out[k.toLowerCase()] = v;
            });
        }
        if (out.uri) {
            out.url = out.querystring ? `${out.uri}?${out.querystring}` : out.uri;
        }
        return out;
    }

    _deepClone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return { ...obj }; }
    }

    _loadFidelityFiles() {
        if (this.envPath && fs.existsSync(this.envPath)) {
            const raw = dotenv.parse(fs.readFileSync(this.envPath));
            for (const [k, v] of Object.entries(raw)) {
                if (!this.whitelist.includes(k)) throw new Error(`Restricted Variable: "${k}"`);
                this.envVars[k] = v;
            }
        }
        if (this.bakePath && fs.existsSync(this.bakePath)) {
            this.bakeVars = dotenv.parse(fs.readFileSync(this.bakePath));
        }
    }

    _watch() {
        [this.edgePath, this.envPath, this.bakePath].filter(Boolean).forEach(t => {
            if (fs.existsSync(t)) this.watchers.push(fs.watch(t, () => this._load()));
        });
    }

    close() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }
}

module.exports = { EdgeRunner };
