'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const { startServer } = require('../src/index');
const path = require('path');
const fs = require('fs');

describe('Response Truncation: 1MB Limit Fidelity', () => {
    let runner;
    let server;
    const testDir = path.resolve(__dirname, '..', 'tmp_test', 'response_truncation');
    const port = 9098;

    beforeEach(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(async () => {
        if (server && server.closeGracefully) {
            await server.closeGracefully();
        }
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('Should allow generated response < 1MB', async () => {
        const smallBody = 'a'.repeat(100);
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                return {
                    status: '200',
                    body: '${smallBody}'
                };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'small.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true });

        const res = await fetch(`http://localhost:${port}/`);
        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toBe(smallBody);
    });

    test('Should warn (allow) when generated response > 1MB in non-strict mode', async () => {
        const largeBody = 'a'.repeat(1.1 * 1024 * 1024);
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                return {
                    status: '200',
                    body: Buffer.alloc(1.1 * 1024 * 1024, 'a').toString()
                };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'large_warn.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true, strict: false });

        const res = await fetch(`http://localhost:${port}/`);
        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body.length).toBe(Math.floor(1.1 * 1024 * 1024));
    });

    test('Should fail (502) when generated response > 1MB in --strict mode', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                return {
                    status: '200',
                    body: Buffer.alloc(1.1 * 1024 * 1024, 'a').toString()
                };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'large_strict.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const res = await fetch(`http://localhost:${port}/`);
        const body = await res.text();
        expect(res.status).toBe(502);
        expect(body).toContain('Generated response too large');
    });
});
