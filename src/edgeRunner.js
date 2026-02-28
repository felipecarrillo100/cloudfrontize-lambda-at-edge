'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');

/**
 * EdgeRunner — High-Fidelity Lambda@Edge Emulator
 * Features: VM Sandboxing, Variable Baking, Environment Whitelisting, and Hot Reload.
 */
class EdgeRunner {
    constructor(edgePath, options = {}) {
        this.edgePath = path.resolve(edgePath);
        this.debug = options.debug || false;
        this.envPath = options.envPath;
        this.bakePath = options.bakePath;
        this.outputPath = options.outputPath;

        this.modules = {};
        this.envVars = {};
        this.bakeVars = {};

        // AWS Reserved variables that Lambda@Edge allows
        this.whitelist = [
            'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_LAMBDA_FUNCTION_NAME',
            'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
            'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME',
            'NODE_OPTIONS', 'TZ', 'LANG', 'PATH'
        ];

        this._loadFidelityFiles();
        this._load();
        this._watch();
    }

    _loadFidelityFiles() {
        if (this.envPath && fs.existsSync(this.envPath)) {
            const raw = dotenv.parse(fs.readFileSync(this.envPath));
            for (const [key, value] of Object.entries(raw)) {
                if (this.whitelist.includes(key)) {
                    this.envVars[key] = value;
                } else {
                    // 🛡️ Throw instead of exit so callers/tests can handle it
                    throw new Error(`[CloudFrontize] Restricted Variable: "${key}" is not a reserved AWS variable. Use --bake for custom variables.`);
                }
            }
        }
        if (this.bakePath && fs.existsSync(this.bakePath)) {
            this.bakeVars = dotenv.parse(fs.readFileSync(this.bakePath));
        }
    }

    _load() {
        this.modules = {};
        try {
            const stat = fs.statSync(this.edgePath);
            if (stat.isDirectory()) {
                fs.readdirSync(this.edgePath)
                    .filter(f => f.endsWith('.js'))
                    .forEach(f => this._loadFile(path.join(this.edgePath, f)));
            } else {
                this._loadFile(this.edgePath);
            }
        } catch (err) {
            console.error(`❌ [CloudFrontize] Load failed: ${err.message}`);
        }
    }

    _loadFile(filePath) {
        try {
            let code = fs.readFileSync(filePath, 'utf8');

            // ⚡ Variable Baking
            for (const [key, value] of Object.entries(this.bakeVars)) {
                code = code.replace(new RegExp(`__${key}__`, 'g'), value);
            }

            if (this.outputPath) {
                const outDir = path.dirname(this.outputPath);
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                fs.writeFileSync(this.outputPath, code);
            }

            // 🛡️ The Hardened Sandbox Bridge
            const mockModule = { exports: {} };
            const context = vm.createContext({
                module: mockModule,
                exports: mockModule.exports,
                Buffer,
                process: {
                    env: { ...this.envVars },
                    nextTick: process.nextTick,
                    version: process.version
                },
                console,
                setTimeout, clearTimeout, setInterval, clearInterval,
                setImmediate, clearImmediate,
                URL, URLSearchParams, TextEncoder, TextDecoder,
                crypto: require('crypto'),
                util: require('util'),
                stream: require('stream'),
                require: (id) => {
                    const forbidden = ['fs', 'child_process', 'cluster'];
                    if (forbidden.includes(id)) {
                        throw new Error(`PermissionDenied: Module "${id}" is not available in Lambda@Edge.`);
                    }
                    return id.startsWith('.')
                        ? require(path.resolve(path.dirname(filePath), id))
                        : require(id);
                },
                __dirname: path.dirname(filePath),
                __filename: filePath
            });

            new vm.Script(code).runInContext(context);
            const mod = mockModule.exports;

            // Strict Strategy: Must have hookType and handler function
            if (!mod.hookType || typeof mod.handler !== 'function') return;

            const valid = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];
            if (!valid.includes(mod.hookType)) return;

            if (this.modules[mod.hookType]) {
                console.error(`Error: Multiple handlers for '${mod.hookType}'. AWS allows only one.`);
                process.exit(1);
            }

            this.modules[mod.hookType] = { handler: mod.handler, file: filePath };
        } catch (err) {
            console.error(`❌ [CloudFrontize] Error in ${path.basename(filePath)}: ${err.message}`);
        }
    }

    _invoke(handler, eventRecord) {
        return new Promise((resolve) => {
            // Reference passing allows handlers to mutate record (Standard AWS behavior)
            const event = { Records: [{ cf: eventRecord }] };
            const context = {
                functionName: this.envVars.AWS_LAMBDA_FUNCTION_NAME || 'cloudfrontize-local',
                awsRequestId: `req-${Date.now()}`,
                getRemainingTimeInMillis: () => 3000
            };

            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                // If handler returns nothing but mutated the record, resolve with record
                resolve(result || eventRecord.request || eventRecord.response);
            };

            try {
                const result = handler(event, context, (err, res) => finish(err ? null : res));

                if (result && typeof result.then === 'function') {
                    result.then(finish).catch(() => finish(null));
                } else if (result !== undefined) {
                    finish(result);
                }
            } catch (err) {
                console.error(`❌ [CloudFrontize] Execution error: ${err.message}`);
                finish(null);
            }
        });
    }

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

    _validateBlacklistedHeaders(headers, hookType) {
        if (!headers) return;
        const blacklisted = ['host', 'via', 'x-cache', 'x-forwarded-for'];
        for (const key of Object.keys(headers)) {
            const lowerKey = key.toLowerCase();
            if (blacklisted.includes(lowerKey) || lowerKey.startsWith('x-edge-') || lowerKey.startsWith('x-amz-')) {
                console.warn(`\x1b[33m⚠️  [CloudFrontize] WARNING: Modified blacklisted header "${key}" in ${hookType}.\x1b[0m`);
            }
        }
    }

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
                statusDescription: 'OK',
                headers: cfHeaders
            }
        };
    }

    async runRequestHook(req) {
        const hooks = ['viewer-request', 'origin-request'];
        let record = this._buildRequestRecord(req);
        let finalType = null;

        for (const type of hooks) {
            const mod = this.modules[type];
            if (!mod) continue;

            const result = await this._invoke(mod.handler, record);
            if (!result) return null;

            if (result.status) return { shortCircuit: true, response: result, type };

            this._validateBlacklistedHeaders(result.headers, type);
            record.request = result;
            finalType = type;
        }

        const buildUrl = record.request.querystring ? `${record.request.uri}?${record.request.querystring}` : record.request.uri;
        return { url: buildUrl, headers: record.request.headers, type: finalType };
    }

    async runResponseHook(req, responseData) {
        const hooks = ['origin-response', 'viewer-response'];
        let record = this._buildResponseRecord(req, responseData);

        for (const type of hooks) {
            const mod = this.modules[type];
            if (!mod) continue;

            const result = await this._invoke(mod.handler, record);
            if (result) {
                this._validateBlacklistedHeaders(result.headers, type);
                record.response = result;
            }
        }

        const flat = {};
        for (const [key, values] of Object.entries(record.response.headers || {})) {
            if (Array.isArray(values) && values.length > 0) flat[key] = values[0].value;
        }
        return flat;
    }

    _watch() {
        const targets = [this.edgePath, this.envPath, this.bakePath].filter(Boolean);
        targets.forEach(t => {
            if (fs.existsSync(t)) {
                fs.watch(t, { persistent: false }, () => {
                    if (this.debug) console.log(`🔄 [CloudFrontize] Resource changed, reloading...`);
                    this._loadFidelityFiles();
                    this._load();
                });
            }
        });
    }

    close() {
        if (this.watcher) this.watcher.close();
    }
}

module.exports = { EdgeRunner };
