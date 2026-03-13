'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');
const { CFF_LIMITS, CFF_RUNTIME } = require('./constants');

class CFFRunner {
    constructor(sourcePath, options = {}) {
        this.sourcePath = sourcePath ? path.resolve(sourcePath) : null;
        this.options = options;
        this.outputPath = options.outputPath;
        this.bakePath = options.bakePath;
        this.bakeVars = {};

        if (this.bakePath && fs.existsSync(this.bakePath)) {
            this.bakeVars = dotenv.parse(fs.readFileSync(this.bakePath));
        }

        this.functions = {
            'viewer-request': [],
            'viewer-response': []
        };

        if (this.sourcePath) {
            this.loadFunctions();
        }
    }

    loadFunctions() {
        if (!fs.existsSync(this.sourcePath)) {
            console.warn(`⚠️  [CFF] Path not found: ${this.sourcePath}`);
            return;
        }

        const stats = fs.statSync(this.sourcePath);
        if (stats.isFile()) {
            this.registerFile(this.sourcePath);
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(this.sourcePath).sort();
            files.forEach(file => {
                if (file.endsWith('.js')) {
                    this.registerFile(path.join(this.sourcePath, file));
                }
            });
        }
    }

    registerFile(filePath) {
        const filename = path.basename(filePath);
        let type = null;

        if (filename.startsWith('viewer-request')) type = 'viewer-request';
        else if (filename.startsWith('viewer-response')) type = 'viewer-response';

        if (!type) {
            console.warn(`⚠️  [CFF] Skipping file "${filename}": Must start with 'viewer-request' or 'viewer-response'.`);
            return;
        }

        let code = fs.readFileSync(filePath, 'utf8');
        code = code.replace(/__([A-Z0-9_.-]+)__/g, (m, key) => this.bakeVars[key] ?? m);

        if (this.outputPath) {
            fs.mkdirSync(this.outputPath, { recursive: true });
            const outFilePath = path.join(this.outputPath, filename);
            fs.writeFileSync(outFilePath, code);
        }

        if (code.length > CFF_LIMITS.MAX_CODE_SIZE_BYTES) {
            const msg = `[CFF] Code size (${(code.length / 1024).toFixed(1)}KB) exceeds 10KB limit.`;
            if (this.options.strict) {
                console.error(`🛑 ${msg}`);
                process.exit(1);
            }
            console.warn(`⚠️  ${msg}`);
        }

        this.functions[type].push({
            name: filename,
            code: code,
            path: filePath
        });
    }

    async runChain(type, initialEvent) {
        let currentEvent = initialEvent;

        for (const fn of this.functions[type]) {
            const result = this.executeSync(fn, currentEvent);
            if (result) {
                if (result.method || result.uri) {
                    currentEvent.request = result;
                } else if (result.statusCode) {
                    currentEvent.response = result;
                } else if (result.request || result.response) {
                    currentEvent = result;
                }

                // If a viewer-request hook generated a response, CloudFront stops and returns it immediately
                if (type === 'viewer-request' && currentEvent.response) {
                    break;
                }
            }
        }

        return currentEvent;
    }

    executeSync(fn, event) {
        const sandbox = {
            event: event,
            console: console // Allow console.log from CFF for debugging if needed
        };

        const context = vm.createContext(sandbox);
        
        // Wrap code to ensure we can call the handler
        const scriptCode = `
            ${fn.code}
            if (typeof handler !== 'function') {
                throw new Error('CFF must define a "handler" function.');
            }
            handler(event);
        `;

        const script = new vm.Script(scriptCode, {
            filename: fn.name,
            timeout: CFF_LIMITS.MAX_TOTAL_TIME_MS
        });

        const start = process.hrtime.bigint();
        try {
            const result = script.runInContext(context, {
                timeout: CFF_LIMITS.MAX_TOTAL_TIME_MS,
                breakOnSigint: true
            });
            const end = process.hrtime.bigint();
            const cpuTimeMs = Number(end - start) / 1e6;

            if (cpuTimeMs > CFF_LIMITS.MAX_CPU_TIME_MS) {
                console.warn(`⚠️  [CFF] ${fn.name} exceeded 1ms CPU limit (Used: ${cpuTimeMs.toFixed(2)}ms). AWS may throttle this function.`);
            }

            return result;
        } catch (err) {
            console.error(`🛑 [CFF] Execution Error in ${fn.name}: ${err.message}`);
            return null;
        }
    }

    // Bidirectional Mappers
    toCFFEvent(req, bodyBuffer, hookType, resData = null) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        
        const event = {
            version: '1.0',
            context: {
                eventType: hookType,
                requestId: req.requestID || 'local',
                distributionDomainName: 'localhost',
                distributionId: 'EDGETEST'
            },
            viewer: {
                ip: (req.socket && req.socket.remoteAddress) || '127.0.0.1'
            },
            request: {
                method: req.method,
                uri: url.pathname,
                headers: {},
                querystring: {},
                cookies: {}
            }
        };

        if (resData) {
            event.response = {
                statusCode: resData.status || 200,
                statusDescription: resData.statusDescription || 'OK',
                headers: {},
                cookies: {}
            };

            // Response Headers mapping
            for (const [key, value] of Object.entries(resData.headers || {})) {
                // value might be string or array of strings
                const val = Array.isArray(value) ? value[0] : value;
                event.response.headers[key.toLowerCase()] = { value: String(val) };
            }
        }

        // Headers mapping (CFF uses flat { value } per header-name key, multi-value uses multiValue array)
        if (req.rawHeaders) {
            // Parse rawHeaders to preserve casing and collect all values per header
            const rawMap = {}; // lowerKey -> [{ key: originalCase, value }]
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const originalKey = req.rawHeaders[i];
                const lowerKey = originalKey.toLowerCase();
                if (!rawMap[lowerKey]) rawMap[lowerKey] = [];
                rawMap[lowerKey].push({ key: originalKey, value: String(req.rawHeaders[i + 1]) });
            }
            for (const [lowerKey, entries] of Object.entries(rawMap)) {
                if (entries.length === 1) {
                    event.request.headers[lowerKey] = { value: entries[0].value };
                } else {
                    event.request.headers[lowerKey] = {
                        value: entries[0].value,
                        multiValue: entries.map(e => ({ value: e.value }))
                    };
                }
            }
        } else {
            // Fallback for mock requests in tests
            for (const [key, value] of Object.entries(req.headers || {})) {
                event.request.headers[key.toLowerCase()] = { value: String(value) };
            }
        }

        // Querystring mapping
        url.searchParams.forEach((value, key) => {
            event.request.querystring[key] = { value: value };
        });

        // Cookies mapping (Simple stub)
        if (req.headers.cookie) {
            req.headers.cookie.split(';').forEach(c => {
                const [k, v] = c.trim().split('=');
                if (k) event.request.cookies[k] = { value: v || '' };
            });
        }

        return event;
    }

    fromCFFEvent(cffResponse) {
        if (!cffResponse) return null;

        let target = cffResponse;
        // If it's a full event object, we need to extract the request or response part
        if (cffResponse.request && !cffResponse.method && !cffResponse.statusCode) {
            // Priority 1: If it's a viewer-request hook that generated a response, return the response
            if (cffResponse.response && cffResponse.context && cffResponse.context.eventType === 'viewer-request') {
                target = cffResponse.response;
            } 
            // Priority 2: If it's a viewer-response hook, return the response
            else if (cffResponse.response && cffResponse.context && cffResponse.context.eventType === 'viewer-response') {
                target = cffResponse.response;
            }
            // Priority 3: Otherwise return the request
            else {
                target = cffResponse.request;
            }
        }

        // If it's a request object (now or after extraction), translate back
        if (target.method || target.uri) {
            let url = target.uri;
            if (target.querystring) {
                const qs = Object.entries(target.querystring)
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.value)}`)
                    .join('&');
                if (qs) url += '?' + qs;
            }
            const headers = {};
            if (target.headers) {
                for (const [k, v] of Object.entries(target.headers)) {
                    headers[k] = [{ key: k, value: v.value }];
                }
            }
            return {
                url: url,
                headers: headers,
                _isResponse: false
            };
        }

        // If it's a response object (now or after extraction)
        if (target.statusCode) {
            const headers = {};
            if (target.headers) {
                for (const [k, v] of Object.entries(target.headers)) {
                    headers[k.toLowerCase()] = [{ key: k, value: v.value }];
                }
            }
            return {
                status: target.statusCode,
                statusDescription: target.statusDescription || 'OK',
                headers: headers,
                body: target.body ? target.body.data : '',
                _isResponse: true
            };
        }

        return null;
    }
}

module.exports = { CFFRunner };
