'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const { startServer } = require('../src/index');
const path = require('path');
const fs = require('fs');

describe('RequestBody & Strict Mode Fidelity', () => {
    let runner;
    let server;
    const testDir = path.resolve(__dirname, '..', 'tmp_test', 'request_body');
    const port = 9097;

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

    test('Should access request body in handler (base64)', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                const bodyData = Buffer.from(request.body.data, 'base64').toString();
                return {
                    status: '200',
                    body: 'Captured: ' + bodyData
                };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'body.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true });

        const res = await fetch(`http://localhost:${port}/`, {
            method: 'POST',
            body: JSON.stringify({ hello: 'world' }),
            headers: { 'Content-Type': 'application/json' }
        });

        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toContain('{"hello":"world"}');
    });

    test('Should fail (502) on forbidden header mutation in --strict mode', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                request.headers['host'] = [{ key: 'Host', value: 'evil.com' }];
                return request;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'forbidden.js'), code);
        runner = new EdgeRunner(testDir, { watch: false, strict: true });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const res = await fetch(`http://localhost:${port}/`, {
            method: 'POST',
            body: 'test'
        });

        const body = await res.text();
        expect(res.status).toBe(502);
        expect(body).toContain('Forbidden Header Mutation');
    });

    test('Should fail (502) when body > 40KB in --strict mode', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => event.Records[0].cf.request;
        `;
        fs.writeFileSync(path.join(testDir, 'limit.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true, strict: true });

        const massiveBody = 'a'.repeat(41 * 1024);
        const res = await fetch(`http://localhost:${port}/`, {
            method: 'POST',
            body: massiveBody
        });

        const body = await res.text();
        expect(res.status).toBe(502);
        expect(body).toContain('Body too large for viewer-request');
    });

    test('Should only warn (allow) when body > 40KB in non-strict mode', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                return { status: '200', body: 'OK' };
            };
        `;
        fs.writeFileSync(path.join(testDir, 'warn.js'), code);
        runner = new EdgeRunner(testDir, { watch: false });
        server = startServer({ port, directory: testDir, edgeRunner: runner, noRequestLogging: true, strict: false });

        const massiveBody = 'a'.repeat(41 * 1024);
        const res = await fetch(`http://localhost:${port}/`, {
            method: 'POST',
            body: massiveBody
        });

        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toBe('OK');
    });
});
