'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');

const { AWS_RUNTIME, AWS_HEADERS, AWS_LIMITS } = require('./constants');
const { AsyncLocalStorage } = require('async_hooks');

class EdgeRunner {
    constructor(edgePath, options = {}) {
        this.edgePath = path.resolve(edgePath);
        this.envPath = options.envPath;
        this.bakePath = options.bakePath;
        this.outputPath = options.outputPath;
        this.strict = options.strict || false;
        this.debug = options.debug || false;
        this.logPath = options.logPath;
        this.logContext = new AsyncLocalStorage();

        // Initialize log file (overwrite)
        if (this.logPath) {
            fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
            fs.writeFileSync(this.logPath, '');
        }

        this.modules = {
            'viewer-request': [],
            'origin-request': [],
            'origin-response': [],
            'viewer-response': []
        };

        this.envVars = { ...AWS_RUNTIME.DEFAULT_ENV };
        this.bakeVars = {};
        this.watchers = [];
        this.whitelist = [...AWS_RUNTIME.ENV_WHITELIST];

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

    _detectHookType(code) {
        const match = code.match(/exports\.hookType\s*=\s*['"](.+?)['"]/);
        return match ? match[1] : null;
    }

    _loadFile(filePath) {
        let code = fs.readFileSync(filePath, 'utf8');
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

        if (this.outputPath) {
            fs.mkdirSync(this.outputPath, { recursive: true });
            const outFilePath = path.join(this.outputPath, path.basename(filePath));
            fs.writeFileSync(outFilePath, code);
        }

        const logger = (level, ...args) => {
            const ctx = this.logContext.getStore() || { requestId: 'INTERNAL', hookType: 'INIT' };
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
            const formatted = `${timestamp}  [${ctx.requestId}] [${ctx.hookType}]  ${message}\n`;

            if (this.debug) {
                process[level === 'error' ? 'stderr' : 'stdout'].write(formatted);
            }
            if (this.logPath) {
                fs.appendFileSync(this.logPath, formatted);
            }
        };

        const hookType = this._detectHookType(code);

        const mockModule = { exports: {} };
        const sandbox = {
            module: mockModule, exports: mockModule.exports,
            Buffer,
            console: {
                log: (...args) => logger('log', ...args),
                info: (...args) => logger('log', ...args),
                warn: (...args) => logger('warn', ...args),
                error: (...args) => logger('error', ...args),
            },
            setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
            URL, URLSearchParams, TextEncoder, TextDecoder,
            process: { env: { ...this.envVars }, nextTick: process.nextTick, version: process.version },
            require: (id) => {
                // 1. Check Global Forbidden List (Strict Bans)
                if (AWS_RUNTIME.FORBIDDEN_MODULES.includes(id)) {
                    throw new Error(`Forbidden: ${id} is restricted in the Lambda@Edge environment.`);
                }

                // 2. Validate against hook-specific whitelist
                let allowed = AWS_RUNTIME.ALLOWED_GLOBAL;
                if (hookType === 'origin-request' || hookType === 'origin-response') {
                    allowed = AWS_RUNTIME.ALLOWED_ORIGIN;
                } else if (hookType === 'viewer-request' || hookType === 'viewer-response') {
                    allowed = AWS_RUNTIME.ALLOWED_VIEWER;
                }

                // Check built-in and SDK whitelists
                const isAllowed = allowed.includes(id) || 
                                 id.startsWith('node:') || 
                                 (id.startsWith('@aws-sdk/client-') && (hookType?.startsWith('origin-')));

                if (!id.startsWith('.') && !isAllowed) {
                    throw new Error(`Forbidden: ${id} is not available in ${hookType || 'initialization'} context.`);
                }

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
            const existing = this.modules[mod.hookType][0];
            if (existing) {
                console.warn(`⚠️  [CloudFrontize] Warning: Multiple files found for "${mod.hookType}". Keeping "${path.basename(existing.file)}" and ignoring "${path.basename(filePath)}".`);
                return;
            }
            this.modules[mod.hookType].push({ handler: mod.handler, file: filePath });
        }
    }

    /* =========================================================
       FIDELITY: REQUEST PIPELINE (Checklist Item 1, 4, 12)
    ========================================================= */

    async runRequestHook(req, bodyBuffer, requestID = 'UNKNOWN') {
        let request = this._buildRequestRecord(req, bodyBuffer);

        for (const type of ['viewer-request', 'origin-request']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(request.headers);

                // Invoke the Lambda handler within the log context
                const result = await this.logContext.run({ requestId: requestID, hookType: type }, () => 
                    this._invoke(mod.handler, request, type)
                );

                // STRICT FIDELITY: If the hook was aborted (timeout in strict mode), return null
                if (result === null && this.strict) return null;
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

    async runResponseHook(req, resData, requestID = 'UNKNOWN') {
        const request = this._buildRequestRecord(req);
        let response = {
            status: String(resData.status || 200),
            statusDescription: 'OK',
            headers: this._normalizeHeadersInternal(resData.headers || {})
        };

        for (const type of ['origin-response', 'viewer-response']) {
            for (const mod of this.modules[type]) {
                const originalHeaders = this._deepClone(response.headers);
                
                const result = await this.logContext.run({ requestId: requestID, hookType: type }, () => 
                    this._invoke(mod.handler, { request, response }, type)
                );

                // STRICT FIDELITY: If the hook was aborted (timeout in strict mode), return null
                if (result === null && this.strict) return null;
                
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
            const isViewerHook = type.startsWith('viewer-');
            const limit = isViewerHook ? AWS_LIMITS.VIEWER_TIMEOUT_MS : AWS_LIMITS.ORIGIN_TIMEOUT_MS;
            const startTime = Date.now();

            const cloned = this._deepClone(record);
            const cf = type.includes('response') ? { request: cloned.request, response: cloned.response } : { request: cloned };
            const event = { Records: [{ cf }] };
            const context = {
                functionName: 'edgeRunner',
                getRemainingTimeInMillis: () => Math.max(0, limit - (Date.now() - startTime))
            };

            let timedOut = false;
            let resolved = false;
            const timer = setTimeout(() => {
                timedOut = true;
                const msg = `Lambda execution exceeded ${limit / 1000}s timeout limit.`;
                const ctx = this.logContext.getStore() || { requestId: 'UNKNOWN', hookType: type };
                const logMsg = `${new Date().toISOString()}  [${ctx.requestId}] [${ctx.hookType}]  [ERROR] ${msg}\n`;

                if (this.debug) process.stderr.write(logMsg);
                if (this.logPath) fs.appendFileSync(this.logPath, logMsg);

                if (this.strict) {
                    resolved = true;
                    resolve(null); // Abort execution in strict mode
                }
            }, limit);

            try {
                const handleResult = (res) => {
                    if (resolved) return;
                    
                    // In strict mode, if we already timed out, we MUST NOT resolve with the result.
                    // The timeout handler already resolved with null.
                    if (timedOut && this.strict) return;
                    
                    resolved = true;
                    clearTimeout(timer);
                    
                    if (timedOut && !this.strict) {
                        const ctx = this.logContext.getStore() || { requestId: 'UNKNOWN', hookType: type };
                        console.warn(`⚠️  [${ctx.requestId}] [${ctx.hookType}] Fidelity Warning: Handler took ${((Date.now() - startTime) / 1000).toFixed(2)}s, exceeding the AWS ${limit / 1000}s limit.`);
                    }
                    resolve(res);
                };

                const result = handler(event, context, (err, res) => {
                    if (resolved) return;
                    if (err) {
                        resolved = true;
                        clearTimeout(timer);
                        reject(err);
                    } else {
                        handleResult(res);
                    }
                });

                if (result && typeof result.then === 'function') {
                    result.then(handleResult).catch(err => {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(timer);
                        reject(err);
                    });
                } else if (result !== undefined) {
                    handleResult(result);
                }
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    reject(e);
                }
            }
        });
    }

    _buildRequestRecord(req, bodyBuffer) {
        const urlStr = req.url || '/';
        const urlObj = new URL(urlStr, 'http://localhost');

        const body = bodyBuffer ? {
            action: 'read',
            data: bodyBuffer.toString('base64'),
            encoding: 'base64',
            inputTruncated: false
        } : undefined;

        // QueryString Determinism (Sorting for Cache Keys)
        const params = [...urlObj.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const normalizedQs = new URLSearchParams(params).toString();

        return {
            method: req.method || 'GET',
            uri: urlObj.pathname,
            querystring: normalizedQs,
            headers: this._normalizeHeadersInternal(req.headers || {}),
            body
        };
    }

    _normalizeHeadersInternal(input) {
        const headers = {};
        for (const k in input) {
            const key = k.toLowerCase();
            const v = input[k];
            const val = Array.isArray(v) 
                ? (v[0]?.value ?? v[0]) 
                : (v && typeof v === 'object' ? v.value : v);
            headers[key] = [{ key: k, value: String(val ?? '') }];
        }
        return headers;
    }

    _validateBlacklistedHeaders(original, final, hook) {
        const isResponseHook = hook === 'origin-response' || hook === 'viewer-response';

        // AWS Forbidden/Read-only headers
        const blacklist = [...AWS_HEADERS.FORBIDDEN];

        // Headers that are forbidden ONLY in Request hooks
        if (!isResponseHook) {
            blacklist.push(...AWS_HEADERS.REQUEST_ONLY_FORBIDDEN);
        }

        blacklist.forEach(key => {
            const getVal = (headers) => {
                if (!headers) return null;
                const actualKey = Object.keys(headers).find(k => k.toLowerCase() === key);
                return actualKey ? headers[actualKey][0]?.value : null;
            };
            if (getVal(original) !== getVal(final)) {
                const msg = `[CloudFrontize] Forbidden: ${hook} modified blacklisted header "${key}"`;
                if (this.strict) {
                    throw new Error(msg);
                }
                console.warn(msg);
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
