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
        this.modules = {};
        this.envVars = {};
        this.bakeVars = {};
        this.watchers = [];
        this.whitelist = ['AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_LAMBDA_FUNCTION_NAME', 'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME', 'NODE_OPTIONS', 'TZ', 'LANG', 'PATH'];
        this._loadFidelityFiles();
        this._load();
        if (options.watch !== false) this._watch();
    }

    _loadFidelityFiles() {
        if (this.envPath && fs.existsSync(this.envPath)) {
            const raw = dotenv.parse(fs.readFileSync(this.envPath));
            for (const [key, value] of Object.entries(raw)) {
                if (this.whitelist.includes(key)) this.envVars[key] = value;
                else throw new Error(`Restricted Variable: "${key}"`);
            }
        }
        if (this.bakePath && fs.existsSync(this.bakePath)) {
            this.bakeVars = dotenv.parse(fs.readFileSync(this.bakePath));
        }
    }

    _load() {
        this.modules = {};
        if (!fs.existsSync(this.edgePath)) return;
        const stat = fs.statSync(this.edgePath);
        const files = stat.isDirectory() ? fs.readdirSync(this.edgePath).filter(f => f.endsWith('.js')) : [this.edgePath];
        files.forEach(f => this._loadFile(stat.isDirectory() ? path.join(this.edgePath, f) : f));
    }

    _loadFile(filePath) {
        let code = fs.readFileSync(filePath, 'utf8');

        // 🔥 Robust Variable Baking:
        // Uses a regex to find all __KEY__ patterns and replaces them with
        // literal values from bakeVars, safely ignoring special regex chars in the value.
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (match, key) => {
            return Object.prototype.hasOwnProperty.call(this.bakeVars, key)
                ? String(this.bakeVars[key])
                : match;
        });

        if (this.outputPath) {
            const outDir = path.dirname(this.outputPath);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(this.outputPath, code);
        }

        const mockModule = { exports: {} };
        const sandbox = {
            module: mockModule, exports: mockModule.exports, Buffer,
            process: {
                env: { ...this.envVars },
                nextTick: process.nextTick,
                version: process.version
            },
            console, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
            URL, URLSearchParams, TextEncoder, TextDecoder,
            require: (id) => {
                const forbidden = ['fs', 'child_process', 'os'];
                if (forbidden.includes(id)) throw new Error(`Forbidden: ${id}`);
                return id.startsWith('.') ? require(path.resolve(path.dirname(filePath), id)) : require(id);
            },
            __dirname: path.dirname(filePath), __filename: filePath
        };

        sandbox.global = sandbox;
        const context = vm.createContext(sandbox);
        new vm.Script(code).runInContext(context);

        const mod = mockModule.exports.handler ? mockModule.exports : sandbox.exports;
        if (mod.handler && mod.hookType) {
            this.modules[mod.hookType] = { handler: mod.handler, file: filePath };
        }
    }

    _invoke(handler, record, type) {
        return new Promise((resolve, reject) => {
            const clonedRecord = JSON.parse(JSON.stringify(record));
            const cf = {};
            if (type.includes('response')) {
                cf.request = clonedRecord.request;
                cf.response = clonedRecord.response;
            } else {
                cf.request = clonedRecord;
            }

            const event = { Records: [{ cf }] };
            const context = {
                functionName: 'cloudfrontize-local',
                functionVersion: '$LATEST',
                awsRequestId: `req-${Date.now()}`,
                getRemainingTimeInMillis: () => 3000
            };

            let settled = false;
            const finish = (err, result) => {
                if (settled) return;
                settled = true;
                if (err) return reject(err);
                // Return the result object from Lambda, or the original if null
                resolve(result || (type.includes('response') ? clonedRecord.response : clonedRecord));
            };

            try {
                const p = handler(event, context, finish);
                if (p && typeof p.then === 'function') p.then(res => finish(null, res)).catch(finish);
            } catch (e) { finish(e); }
        });
    }

    _buildRequestRecord(req) {
        const headers = {};
        const inputHeaders = req.headers || {};
        for (const [k, v] of Object.entries(inputHeaders)) {
            let val;
            if (Array.isArray(v) && v[0] && typeof v[0].value !== 'undefined') {
                val = String(v[0].value);
            } else if (v && typeof v === 'object' && typeof v.value !== 'undefined') {
                val = String(v.value);
            } else {
                val = String(v);
            }
            headers[k.toLowerCase()] = [{ key: k, value: val }];
        }
        const [uri, query] = (req.url || '').split('?');
        return { method: req.method || 'GET', uri: uri || '/', querystring: query || '', headers };
    }

    _validateBlacklistedHeaders(original, final, hook) {
        const black = ['host', 'via', 'connection'];
        if (!final) return;
        for (const k of Object.keys(final)) {
            const low = k.toLowerCase();
            if (black.includes(low)) {
                const origVal = original[low]?.[0]?.value;
                const finalVal = final[k]?.[0]?.value;
                if (origVal !== finalVal) {
                    console.warn(`[CloudFrontize] Warning: ${hook} modified blacklisted header "${low}"`);
                }
            }
        }
    }

    _flatten(obj, lastType) {
        if (!obj) return obj;
        const out = JSON.parse(JSON.stringify(obj));
        if (out.status) out.status = String(out.status);
        if (out.headers) {
            Object.keys(out.headers).forEach(k => {
                const low = k.toLowerCase();
                const vals = out.headers[k];
                if (vals && vals[0]) {
                    if (out[low] === undefined) out[low] = vals[0].value;
                    out.headers[low] = vals;
                }
            });
        }
        if (!out.url && out.uri) {
            out.url = out.querystring ? `${out.uri}?${out.querystring}` : out.uri;
        }
        if (lastType) out.type = lastType;
        return out;
    }

    async runRequestHook(req) {
        let request = this._buildRequestRecord(req);
        let lastRanType = null;
        const hooks = ['viewer-request', 'origin-request'];

        for (const type of hooks) {
            const mod = this.modules[type];
            if (!mod) continue;

            const originalHeaders = JSON.parse(JSON.stringify(request.headers));
            const result = await this._invoke(mod.handler, request, type);

            // If the handler generated a response (e.g. 302), return it immediately
            if (result && result.status) return this._flatten(result, type);

            // Update the request object for the next hook in the chain
            request = result.request || result;
            if (request.headers) {
                this._validateBlacklistedHeaders(originalHeaders, request.headers, type);
            }
            lastRanType = type;
        }
        return this._flatten(request, lastRanType);
    }

    async runResponseHook(req, resData) {
        const request = this._buildRequestRecord(req);
        const headers = {};
        for (const [k, v] of Object.entries(resData.headers || {})) {
            headers[k.toLowerCase()] = [{ key: k, value: String(v) }];
        }

        let response = {
            status: String(resData.status || 200),
            statusDescription: 'OK',
            headers
        };

        let lastRanType = null;
        const hooks = ['origin-response', 'viewer-response'];
        for (const type of hooks) {
            const mod = this.modules[type];
            if (!mod) continue;

            const originalHeaders = JSON.parse(JSON.stringify(response.headers));
            const result = await this._invoke(mod.handler, { request, response }, type);

            response = result.response || result;
            if (response.headers) {
                this._validateBlacklistedHeaders(originalHeaders, response.headers, type);
            }
            lastRanType = type;
        }
        return this._flatten(response, lastRanType);
    }

    _watch() {
        [this.edgePath, this.envPath, this.bakePath].filter(Boolean).forEach(t => {
            if (fs.existsSync(t)) this.watchers.push(fs.watch(t, () => this._load()));
        });
    }
    close() { this.watchers.forEach(w => w.close()); this.watchers = []; }
}

module.exports = { EdgeRunner };
