'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Production Patterns: Test of Fire', () => {
    let runner;
    const baseHooksDir = path.join(__dirname, 'production_patterns_hooks');

    beforeAll(() => {
        if (fs.existsSync(baseHooksDir)) fs.rmSync(baseHooksDir, { recursive: true, force: true });
    });

    afterAll(() => {
        if (fs.existsSync(baseHooksDir)) {
            try {
                fs.rmSync(baseHooksDir, { recursive: true, force: true });
            } catch (e) {
                // Ignore cleanup errors on Windows
            }
        }
    });

    const setupTest = (name) => {
        const dir = path.join(baseHooksDir, name.replace(/\s+/g, '_'));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    };

    /**
     * PATTERN 1: Cookie-based A/B Testing
     */
    test('1. A/B Testing: Cookie-based URI Rewriting', async () => {
        const testDir = setupTest('ab_test');
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const headers = request.headers;

                if (headers.cookie) {
                    for (let i = 0; i < headers.cookie.length; i++) {
                        if (headers.cookie[i].value.indexOf('experiment=true') >= 0) {
                            request.uri = '/experimental' + request.uri;
                            break;
                        }
                    }
                }
                return request;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'index.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });

        const resExp = await runner.runRequestHook({
            headers: { cookie: [{ key: 'Cookie', value: 'session=123; experiment=true' }] },
            url: '/index.html'
        });
        expect(resExp.uri).toBe('/experimental/index.html');

        const resControl = await runner.runRequestHook({
            headers: { cookie: [{ key: 'Cookie', value: 'session=123' }] },
            url: '/index.html'
        });
        expect(resControl.uri).toBe('/index.html');
    });

    /**
     * PATTERN 2: Basic Authentication (Edge Gatekeeper)
     */
    test('2. Security: Basic Authentication Gatekeeper', async () => {
        const testDir = setupTest('auth');
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const headers = request.headers;
                const authString = 'Basic ' + Buffer.from('admin:password').toString('base64');

                if (!headers.authorization || headers.authorization[0].value !== authString) {
                    return {
                        status: '401',
                        statusDescription: 'Unauthorized',
                        headers: {
                            'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
                        },
                        body: 'Unauthorized Access'
                    };
                }
                return request;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'index.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });

        const resUnauth = await runner.runRequestHook({ headers: {}, url: '/protected' });
        expect(resUnauth.status).toBe('401');

        const authHeader = 'Basic ' + Buffer.from('admin:password').toString('base64');
        const resAuth = await runner.runRequestHook({
            headers: { authorization: [{ key: 'Authorization', value: authHeader }] },
            url: '/protected'
        });
        expect(resAuth.status).toBeUndefined();
        expect(resAuth.uri).toBe('/protected');
    });

    /**
     * PATTERN 3: Dynamic HTML Generation (Maintenance Page)
     */
    test('3. Dynamic Content: Maintenance Page Generator', async () => {
        const testDir = setupTest('maintenance');
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                return {
                    status: '503',
                    statusDescription: 'Service Unavailable',
                    headers: {
                        'content-type': [{ key: 'Content-Type', value: 'text/html' }],
                        'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }]
                    },
                    body: '<html><body><h1>Under Maintenance</h1></body></html>'
                };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'index.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });

        const result = await runner.runRequestHook({ headers: {}, url: '/any-page' });
        expect(result.status).toBe('503');
        expect(result['content-type']).toBe('text/html');
        expect(result.body).toContain('Under Maintenance');
    });

    /**
     * PATTERN 4: Response Header Cleanup & Security Injection
     */
    test('4. Compliance: Origin Header Cleanup', async () => {
        const testDir = setupTest('cleanup');
        const code = `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                const headers = response.headers;
                delete headers['server'];
                delete headers['x-powered-by'];
                headers['strict-transport-security'] = [{ 
                    key: 'Strict-Transport-Security', 
                    value: 'max-age=31536000; includeSubDomains; preload' 
                }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'index.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });

        const originResponse = {
            status: '200',
            headers: {
                'server': [{ key: 'Server', value: 'Apache/2.4.1' }],
                'x-powered-by': [{ key: 'X-Powered-By', value: 'PHP/7.4' }]
            }
        };

        const result = await runner.runResponseHook({ headers: {}, url: '/' }, originResponse);
        expect(result.server).toBeUndefined();
        expect(result['x-powered-by']).toBeUndefined();
        expect(result['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
    });
});
