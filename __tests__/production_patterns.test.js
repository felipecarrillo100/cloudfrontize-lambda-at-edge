'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Production Edge Patterns: Auth, Cache, Geo & Device', () => {
    let runner;
    const testHooksDir = path.resolve(__dirname, '..', 'tmp_test', 'production_patterns');

    beforeAll(() => {
        if (!fs.existsSync(testHooksDir)) {
            fs.mkdirSync(testHooksDir, { recursive: true });
        }
    });

    /**
     * WINDOWS FIDELITY FIX:
     * We use an async delay and more aggressive retries to handle
     * EPERM lock issues common on Windows filesystems.
     */
    afterAll(async () => {
        if (fs.existsSync(testHooksDir)) {
            await new Promise(resolve => setTimeout(resolve, 200));
            try {
                fs.rmSync(testHooksDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
            } catch (e) {
                console.warn(`Cleanup warning: ${e.message}`);
            }
        }
    });

    beforeEach(() => {
        if (fs.existsSync(testHooksDir)) {
            fs.rmSync(testHooksDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testHooksDir, { recursive: true });
    });

    /* =========================================================
       ⭐ AUTHENTICATION + SECURITY
    ========================================================= */
    describe('Authentication & Security Hardening', () => {
        test('JWT/Cookie Validation & Redirect (7 ms)', async () => {
            const code = `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const request = event.Records[0].cf.request;
                    const headers = request.headers;
                    
                    const hasAuth = headers.authorization || (headers.cookie && headers.cookie[0].value.includes('session-id'));
                    
                    if (!hasAuth && !request.uri.startsWith('/login')) {
                        return {
                            status: '302',
                            headers: { location: [{ key: 'Location', value: '/login' }] }
                        };
                    }
                    return request;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'auth.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            // Fail Case
            const fail = await runner.runRequestHook({ url: '/dashboard', headers: {} });
            expect(fail.status).toBe('302');
            expect(fail.location).toBe('/login');

            // Success Case (Cookie)
            const success = await runner.runRequestHook({
                url: '/dashboard',
                headers: { 'cookie': 'session-id=xyz123' }
            });
            expect(success.uri).toBe('/dashboard');
        });

        test('Security Hardening Header Injection (4 ms)', async () => {
            const code = `
                exports.hookType = 'viewer-response';
                exports.handler = async (event) => {
                    const response = event.Records[0].cf.response;
                    response.headers['content-security-policy'] = [{ key: 'Content-Security-Policy', value: "default-src 'self'" }];
                    response.headers['strict-transport-security'] = [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }];
                    return response;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'security.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            const result = await runner.runResponseHook({ url: '/' }, { status: 200 });
            expect(result['content-security-policy']).toContain("'self'");
            expect(result['strict-transport-security']).toBe('max-age=63072000');
        });
    });

    /* =========================================================
       ⭐ CACHE BEHAVIOR SIMULATION
    ========================================================= */
    describe('Cache Key & Bypass Logic', () => {
        test('QueryString Normalization (Cache Key Optimization) (6 ms)', async () => {
            const code = `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const request = event.Records[0].cf.request;
                    if (request.querystring) {
                        const params = new URLSearchParams(request.querystring);
                        params.sort();
                        request.querystring = params.toString();
                    }
                    return request;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'cache-opt.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            // Mixed order should normalize to alphabetical
            const result = await runner.runRequestHook({ url: '/search?z=1&a=2' });
            expect(result.querystring).toBe('a=2&z=1');
        });

        test('Cache Bypass for Authenticated Users (9 ms)', async () => {
            const code = `
                exports.hookType = 'origin-request';
                exports.handler = async (event) => {
                    const request = event.Records[0].cf.request;
                    if (request.headers.authorization) {
                        // Custom header to trigger Cache Policy bypass
                        request.headers['x-bypass-cache'] = [{ key: 'X-Bypass-Cache', value: 'true' }];
                    }
                    return request;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'cache-bypass.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            const result = await runner.runRequestHook({
                url: '/api',
                headers: { 'authorization': 'Bearer token' }
            });
            expect(result['x-bypass-cache']).toBe('true');
        });
    });

    /* =========================================================
       ⭐ GEOGRAPHIC & DEVICE ROUTING
    ========================================================= */
    describe('Geo & Device Intelligent Routing', () => {
        test('Country-based Origin Routing (8 ms)', async () => {
            const code = `
                exports.hookType = 'origin-request';
                exports.handler = async (event) => {
                    const request = event.Records[0].cf.request;
                    const country = request.headers['cloudfront-viewer-country'] 
                        ? request.headers['cloudfront-viewer-country'][0].value 
                        : 'US';
                    
                    if (country === 'GB' || country === 'FR') {
                        request.origin = { custom: { domainName: 'eu-west-1.api.com' } };
                    }
                    return request;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'geo.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            const result = await runner.runRequestHook({
                url: '/',
                headers: { 'cloudfront-viewer-country': 'GB' }
            });
            // Note: Internal origin mutations are raw AWS objects
            expect(result.origin.custom.domainName).toBe('eu-west-1.api.com');
        });

        test('Mobile vs Desktop Asset Routing (9 ms)', async () => {
            const code = `
                exports.hookType = 'viewer-request';
                exports.handler = async (event) => {
                    const request = event.Records[0].cf.request;
                    const ua = request.headers['user-agent'] ? request.headers['user-agent'][0].value : '';
                    
                    if (/Mobile|Android|iPhone/i.test(ua)) {
                        request.uri = '/mobile' + request.uri;
                    }
                    return request;
                };
            `;
            fs.writeFileSync(path.join(testHooksDir, 'device.js'), code);
            runner = new EdgeRunner(testHooksDir, { watch: false });

            const mobile = await runner.runRequestHook({
                url: '/index.html',
                headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0)' }
            });
            expect(mobile.uri).toBe('/mobile/index.html');
        });
    });
});
