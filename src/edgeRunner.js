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
        this.watchers = []; // Track watchers for clean closure

        // AWS Reserved variables that Lambda@Edge allows
        this.whitelist = [
            'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_LAMBDA_FUNCTION_NAME',
            'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
            'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME',
            'NODE_OPTIONS', 'TZ', 'LANG', 'PATH'
        ];

        this._loadFidelityFiles();
        this._load();

        // 🛡️ Carefully added toggle: Only watch if not explicitly disabled (for tests)
        if (options.watch !== false) {
            this._watch();
        }
    }

    _loadFidelityFiles() {
        if (this.envPath && fs.existsSync(this.envPath)) {
            const raw = dotenv.parse(fs.readFileSync(this.envPath));
            for (const [key, value] of Object.entries(raw)) {
                if (this.whitelist.includes(key)) {
                    this.envVars[key] = value;
                } else {
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
            // 🛡️ Guard: Ensure path exists before attempting any operations
            if (!fs.existsSync(this.edgePath)) {
                if (this.debug) console.log(`⚠️ [CloudFrontize] Path not found: ${this.edgePath}`);
                return;
            }

            const stat = fs.statSync(this.edgePath);

            if (stat.isDirectory()) {
                // Get all JS files in the directory
                const files = fs.readdirSync(this.edgePath).filter(f => f.endsWith('.js'));

                // 🚀 Using for...of for serial execution (essential for Windows FS stability)
                for (const file of files) {
                    const fullPath = path.join(this.edgePath, file);
                    try {
                        this._loadFile(fullPath);
                    } catch (e) {
                        // Bubble up the error immediately to stop execution on invalid handler setup
                        console.error(`\x1b[31m❌ [CloudFrontize] Failed to load module: ${file}\x1b[0m`);
                        throw e;
                    }
                }
            } else if (this.edgePath.endsWith('.js')) {
                // Direct file path provided
                this._loadFile(this.edgePath);
            }

            // 🔍 Trace: Crucial for debugging "Received: undefined" in tests
            if (this.debug) {
                const loadedCount = Object.keys(this.modules).length;
                console.log(`✅ [CloudFrontize] Load Complete. Registered Hooks (${loadedCount}): ${Object.keys(this.modules).join(', ') || 'None'}`);
            }

        } catch (err) {
            // Log the high-level failure and re-throw so Jest/Runner can handle the exit
            console.error(`❌ [CloudFrontize] Initialization failed: ${err.message}`);
            throw err;
        }
    }

    _loadFile(filePath) {
        try {
            let code = fs.readFileSync(filePath, 'utf8');

            // ⚡ Variable Baking
            for (const [key, value] of Object.entries(this.bakeVars)) {
                code = code.replace(new RegExp(`__${key}__`, 'g'), value);
            }

            // 💾 Physical Output (if path is defined)
            if (this.outputPath) {
                const outDir = path.dirname(this.outputPath);
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                fs.writeFileSync(this.outputPath, code);
            }

            // 🛡️ The Hardened Sandbox Bridge
            const mockModule = { exports: {} };

            // Define the base context
            const sandbox = {
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
                    const forbidden = ['fs', 'child_process', 'cluster', 'os'];
                    if (forbidden.includes(id)) {
                        throw new Error(`PermissionDenied: Module "${id}" is not available in Lambda@Edge.`);
                    }
                    // Handle local vs npm requirements
                    return id.startsWith('.')
                        ? require(path.resolve(path.dirname(filePath), id))
                        : require(id);
                },
                __dirname: path.dirname(filePath),
                __filename: filePath
            };

            // 🧩 CRITICAL FIX: Bind 'global' to the sandbox itself
            sandbox.global = sandbox;

            const context = vm.createContext(sandbox);
            new vm.Script(code).runInContext(context);

            // Extract the handler (support both module.exports and exports)
            const mod = mockModule.exports.handler ? mockModule.exports : sandbox.exports;

            // 📋 Validation Logic
            if (!mod.hookType || typeof mod.handler !== 'function') {
                if (this.debug) console.warn(`⚠️ [CloudFrontize] Skipping ${path.basename(filePath)}: Missing hookType or handler.`);
                return;
            }

            const valid = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response'];
            if (!valid.includes(mod.hookType)) {
                if (this.debug) console.warn(`⚠️ [CloudFrontize] Invalid hookType "${mod.hookType}" in ${path.basename(filePath)}`);
                return;
            }

            if (this.modules[mod.hookType]) {
                throw new Error(`Multiple handlers for '${mod.hookType}'. AWS allows only one.`);
            }

            // Register the module
            this.modules[mod.hookType] = {
                handler: mod.handler,
                file: filePath
            };

        } catch (err) {
            console.error(`\x1b[31m❌ [CloudFrontize] Error in ${path.basename(filePath)}: ${err.message}\x1b[0m`);
            throw err;
        }
    }

    _invoke(handler, eventRecord) {
        return new Promise((resolve) => {
            // Deep copy not needed here as mutation is intended in Lambda@Edge
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

                // 🛡️ THE FIX: If handler returns nothing (undefined),
                // we MUST return the mutated eventRecord.request or response.
                const finalResult = result || eventRecord.request || eventRecord.response;
                resolve(finalResult);
            };

            try {
                // Handle both Async and Callback styles
                const result = handler(event, context, (err, res) => finish(err ? null : res));

                if (result && typeof result.then === 'function') {
                    result.then(finish).catch((err) => {
                        console.error(`❌ [CloudFrontize] Async Handler Reject: ${err.message}`);
                        finish(null);
                    });
                } else if (result !== undefined) {
                    finish(result);
                } else {
                    // If the function finished but didn't return a promise or value,
                    // it might be using the callback or just mutating the object.
                    // We give it a tiny bit of grace for the callback to fire.
                    setTimeout(() => finish(null), 10);
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

    _validateBlacklistedHeaders(originalHeaders, finalHeaders, hookType) {
        if (!finalHeaders) return;

        // The full, unreduced list of restricted headers
        const blacklisted = ['host', 'via', 'x-cache', 'x-forwarded-for'];

        for (const key of Object.keys(finalHeaders)) {
            const lowerKey = key.toLowerCase();

            // Check if it's a restricted key
            const isRestricted = blacklisted.includes(lowerKey) ||
                lowerKey.startsWith('x-edge-') ||
                lowerKey.startsWith('x-amz-');

            if (isRestricted) {
                // Get values for comparison
                const originalVal = originalHeaders[lowerKey]?.[0]?.value;
                const finalVal = finalHeaders[key]?.[0]?.value;

                // 🛡️ Only warn if the header was actually MODIFIED or ADDED
                // If it's the same as it was before the Lambda ran, it's safe!
                if (finalVal !== originalVal) {
                    console.warn(`\x1b[33m⚠️  [CloudFrontize] WARNING: Modified blacklisted header "${key}" in ${hookType}.\x1b[0m`);
                }
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
                // Save watcher reference to allow clean shutdown
                const w = fs.watch(t, { persistent: false }, () => {
                    if (this.debug) console.log(`🔄 [CloudFrontize] Resource changed, reloading...`);
                    try {
                        this._loadFidelityFiles();
                        this._load();
                    } catch (e) {
                        // Silent reload fail (error logged in _load)
                    }
                });
                this.watchers.push(w);
            }
        });
    }

    close() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }
}

module.exports = { EdgeRunner };
