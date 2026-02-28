'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const { startServer } = require('../src/index');
const path = require('path');
const fs = require('fs');

/**
 * @jest-environment node
 */
describe('EdgeRunner: Final Fidelity & Scale Stress Tests', () => {
    let runner;
    let server;
    const mockDir = path.join(__dirname, '..','test_fidelity_tmp');
    const port = 9095;

    beforeAll(() => {
        // Clean start: Remove if exists from a previous crashed run
        if (fs.existsSync(mockDir)) {
            fs.rmSync(mockDir, { recursive: true, force: true });
        }
        fs.mkdirSync(mockDir, { recursive: true });

        // Create a 10.1MB file to test the middleware bypass logic
        const largeFile = Buffer.alloc(10.1 * 1024 * 1024, 'a');
        fs.writeFileSync(path.join(mockDir, 'massive.txt'), largeFile);
    });

    afterAll(async () => {
        // 1. Close server first to release Windows file locks
        if (server) {
            await server.closeGracefully();
        }

        // 2. Small delay to let the OS release file handles (Crucial for Windows)
        await new Promise(resolve => setTimeout(resolve, 100));

        // 3. Recursive delete with retries
        if (fs.existsSync(mockDir)) {
            try {
                fs.rmSync(mockDir, {
                    recursive: true,
                    force: true,
                    maxRetries: 5,
                    retryDelay: 100
                });
            } catch (e) {
                console.warn(`Cleanup warning: ${e.message}`);
            }
        }
    });

    test('1. 10MB Bypass: Large files must NOT be compressed (Fidelity Fix)', async () => {
        runner = new EdgeRunner(mockDir, { watch: false });
        server = startServer({
            port,
            directory: mockDir,
            edgeRunner: runner,
            noRequestLogging: true
        });

        // Use global fetch (Node 20 native)
        const res = await fetch(`http://localhost:${port}/massive.txt`, {
            headers: { 'accept-encoding': 'gzip' }
        });

        // CloudFront fidelity: No compression for files > 10MB
        expect(res.headers.get('content-encoding')).toBeNull();

        const length = parseInt(res.headers.get('content-length'));
        expect(length).toBeGreaterThan(10 * 1024 * 1024);
    });

    test('2. Template Pull Logic: Handles complex keys and literal $ values', async () => {
        const bakeFile = path.join(mockDir, '.bake');
        // Test key with dash and value with multiple $ signs (regex killers)
        fs.writeFileSync(bakeFile, 'APP-VERSION=1.0.0\nSECRET_KEY=$$complex$1');

        const lambdaFile = path.join(mockDir, 'bake_test.js');
        fs.writeFileSync(lambdaFile, `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.uri = '/__APP-VERSION__';
                req.headers['x-secret'] = [{ key: 'X-Secret', value: '__SECRET_KEY__' }];
                return req;
            };
        `);

        runner = new EdgeRunner(lambdaFile, {
            bakePath: bakeFile,
            watch: false
        });

        const result = await runner.runRequestHook({ url: '/', headers: {} });

        expect(result.uri).toBe('/1.0.0');
        expect(result['x-secret']).toBe('$$complex$1');
    });

    test('3. Multi-Hook Chaining: Propagates URI changes through the stack', async () => {
        const chainDir = path.join(mockDir, 'chain');
        if (!fs.existsSync(chainDir)) fs.mkdirSync(chainDir);

        fs.writeFileSync(path.join(chainDir, 'viewer.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const r = event.Records[0].cf.request;
                r.uri = '/v1' + r.uri;
                return r;
            };
        `);

        fs.writeFileSync(path.join(chainDir, 'origin.js'), `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const r = event.Records[0].cf.request;
                r.uri = r.uri + '.json';
                return r;
            };
        `);

        runner = new EdgeRunner(chainDir, { watch: false });
        const result = await runner.runRequestHook({ url: '/data', headers: {} });

        // Verify the viewer change was passed into the origin hook
        expect(result.uri).toBe('/v1/data.json');
    });
});
