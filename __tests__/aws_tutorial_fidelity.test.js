'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('AWS Tutorial Compliance: EdgeRunner Fidelity', () => {
    let runner;
    const testHooksDir = path.join(__dirname, 'aws_fidelity_hooks');

    beforeAll(() => {
        if (!fs.existsSync(testHooksDir)) fs.mkdirSync(testHooksDir);
    });

    afterAll(() => {
        if (fs.existsSync(testHooksDir)) {
            fs.readdirSync(testHooksDir).forEach(f => fs.unlinkSync(path.join(testHooksDir, f)));
            fs.rmdirSync(testHooksDir);
        }
    });

    test('1. Viewer-Request: Redirect (Short-circuiting)', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                if (request.uri === '/old-page') {
                    return {
                        status: '301',
                        statusDescription: 'Moved Permanently',
                        headers: {
                            location: [{ key: 'Location', value: '/new-page' }]
                        }
                    };
                }
                return request;
            };
        `;
        fs.writeFileSync(path.join(testHooksDir, 'redirect.js'), code);
        runner = new EdgeRunner(testHooksDir, { watch: false });

        const result = await runner.runRequestHook({ url: '/old-page' });
        expect(result.status).toBe('301');
        expect(result.location).toBe('/new-page');
    });

    test('2. Origin-Request: URI Rewrite (Internal)', async () => {
        const code = `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                // Rewrite /api/v1/user to /internal/v1/user
                request.uri = request.uri.replace('/api/', '/internal/');
                return request;
            };
        `;
        fs.writeFileSync(path.join(testHooksDir, 'rewrite.js'), code);
        runner = new EdgeRunner(testHooksDir, { watch: false });

        const result = await runner.runRequestHook({ url: '/api/v1/user' });
        expect(result.uri).toBe('/internal/v1/user');
    });

    test('3. Viewer-Response: Header Injection (Security)', async () => {
        const code = `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                response.headers['x-frame-options'] = [{ key: 'X-Frame-Options', value: 'DENY' }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(testHooksDir, 'headers.js'), code);
        runner = new EdgeRunner(testHooksDir, { watch: false });

        const result = await runner.runResponseHook({ url: '/' }, { status: 200, headers: {} });
        expect(result['x-frame-options']).toBe('DENY');
    });

    test('4. Multi-Hook Chain: Sequential Mutation', async () => {
        // Viewer Request adds a header
        fs.writeFileSync(path.join(testHooksDir, 'v-req.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.headers['x-trace-id'] = [{ key: 'X-Trace-ID', value: '123' }];
                return req;
            };
        `);
        // Origin Request uses that header to change URI
        fs.writeFileSync(path.join(testHooksDir, 'o-req.js'), `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                if (req.headers['x-trace-id']) {
                    req.uri = '/traced' + req.uri;
                }
                return req;
            };
        `);

        runner = new EdgeRunner(testHooksDir, { watch: false });
        const result = await runner.runRequestHook({ url: '/test' });

        expect(result.uri).toBe('/traced/test');
        expect(result['x-trace-id']).toBe('123');
    });
});
