'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const { startServer } = require('../src/index');
const path = require('path');
const fs = require('fs');

describe('Origin-Response & Strict Header Fidelity', () => {
    let runner;
    let server;
    const baseTestDir = path.resolve(__dirname, '..', 'tmp_test', 'origin_response');
    let currentTestDir;
    const port = 9099;

    const robustRm = (dir) => {
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            } catch (e) {
                // Silently ignore cleanup errors in individual tests
            }
        }
    };

    beforeAll(() => {
        robustRm(baseTestDir);
    });

    afterEach(async () => {
        if (server && server.closeGracefully) {
            await server.closeGracefully();
            server = null;
        }
        // Small delay to allow Windows to release file handles
        await new Promise(r => setTimeout(r, 200));
    });

    afterAll(() => {
        robustRm(baseTestDir);
    });

    const setupTest = (name) => {
        currentTestDir = path.join(baseTestDir, name.replace(/\s+/g, '_'));
        robustRm(currentTestDir);
        fs.mkdirSync(currentTestDir, { recursive: true });
        fs.writeFileSync(path.join(currentTestDir, 'index.html'), '<html><body>Root</body></html>');
        return currentTestDir;
    };

    test('Should allow modifying safe headers in origin-response', async () => {
        const dir = setupTest('safe_headers');
        const code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                response.headers['x-custom-res'] = [{ key: 'X-Custom-Res', value: 'Hello' }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(dir, 'safe.js'), code);
        runner = new EdgeRunner(dir, { watch: false, strict: true });
        server = startServer({ port, directory: dir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const res = await fetch(`http://localhost:${port}/`);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-custom-res')).toBe('Hello');
    });

    test('Should fail (502) on forbidden header mutation in origin-response (--strict)', async () => {
        const dir = setupTest('forbidden_strict');
        const code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                response.headers['connection'] = [{ key: 'Connection', value: 'close' }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(dir, 'forbidden.js'), code);
        runner = new EdgeRunner(dir, { watch: false, strict: true });
        server = startServer({ port: port + 1, directory: dir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const res = await fetch(`http://localhost:${port + 1}/`);
        const body = await res.text();
        expect(res.status).toBe(502);
        expect(body).toContain('Forbidden Response Header Mutation');
    });

    test('Should warn but allow forbidden header mutation in default mode', async () => {
        const dir = setupTest('warn_mode');
        const code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                response.headers['connection'] = [{ key: 'Connection', value: 'close' }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(dir, 'warn.js'), code);
        runner = new EdgeRunner(dir, { watch: false });
        server = startServer({ port: port + 2, directory: dir, edgeRunner: runner, noRequestLogging: true, strict: false });

        const res = await fetch(`http://localhost:${port + 2}/`);
        expect(res.status).toBe(200);
    });

    test('Should still enforce Host in Request hooks but allow in Response hooks', async () => {
        const dir = setupTest('host_res');
        const code = `
            exports.hookType = 'origin-response';
            exports.handler = async (event) => {
                const response = event.Records[0].cf.response;
                response.headers['host'] = [{ key: 'Host', value: 'ignored-in-res' }];
                return response;
            };
        `;
        fs.writeFileSync(path.join(dir, 'host_res.js'), code);
        runner = new EdgeRunner(dir, { watch: false, strict: true });
        server = startServer({ port: port + 3, directory: dir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const res = await fetch(`http://localhost:${port + 3}/`);
        expect(res.status).toBe(200);
    });
});
