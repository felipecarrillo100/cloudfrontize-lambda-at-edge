const request = require('supertest');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const fs = require('fs');
const path = require('path');

describe('--mode flag and Directory Indexing Fidelity', () => {
    const port = Math.floor(Math.random() * (40000 - 30000 + 1) + 30000); // Random port for safety
    const rootDir = path.resolve(__dirname, '..');
    const baseDir = path.join(rootDir, 'tmp_test', 'fidelity_rest');
    const edgeDir = path.join(baseDir, 'edge');

    let server;
    let edgeRunner;

    beforeAll(() => {
        // Setup a fake filesystem for these tests
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(baseDir, { recursive: true });

        // Create root index
        fs.writeFileSync(path.join(baseDir, 'index.html'), '<h1>Root File</h1>');
        fs.writeFileSync(path.join(baseDir, 'random.html'), '<h1>Random File</h1>');

        // Create a subfolder with an index
        fs.mkdirSync(path.join(baseDir, 'subfolder'));
        fs.writeFileSync(path.join(baseDir, 'subfolder', 'index.html'), '<h1>Subfolder Index</h1>');
        fs.writeFileSync(path.join(baseDir, 'subfolder', 'something.html'), '<h1>Something in Subfolder</h1>');

        // Setup Lambda@Edge hook that redirects a specific folder to index.html
        fs.mkdirSync(edgeDir, { recursive: true });
        fs.writeFileSync(path.join(edgeDir, 'rewrite.js'), `
            exports.hookType = 'origin-request';
            exports.handler = (event, context, callback) => {
                const request = event.Records[0].cf.request;
                if (request.uri === '/subfolder/') {
                    request.uri = '/subfolder/index.html';
                }
                callback(null, request);
            };
        `);
    });

    afterAll(() => {
        try {
            if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (e) {
            console.warn(`Cleanup failed (mostly Windows locked file): ${e.message}`);
        }
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        if (edgeRunner) edgeRunner.close();
        server = null;
        edgeRunner = null;
    });

    describe('Mode: website (Default Magic Behavior)', () => {
        beforeEach(() => {
            server = startServer({ directory: baseDir, port, mode: 'website', noRequestLogging: true });
        });

        test('Root (/) should serve index.html', async () => {
            const res = await request(server).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Root File');
        });

        test('Subfolder (/subfolder/) should magically serve index.html', async () => {
            const res = await request(server).get('/subfolder/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Subfolder Index');
        });

        test('Subfolder without trailing slash (/subfolder) should magically resolve (serve-handler behavior)', async () => {
            const res = await request(server).get('/subfolder');
            // serve-handler actually redirects this to /subfolder/ or serves it directly depending on exact version/config, but it works
            expect([200, 301, 302]).toContain(res.status);
        });

        test('/random should magically resolve to /random.html', async () => {
            const res = await request(server).get('/random');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Random File');
        });
    });

    describe('Mode: rest (Strict CloudFront Fidelity)', () => {
        test('Root (/) should STILL serve index.html safely', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noRequestLogging: true });
            const res = await request(server).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('Root File');
        });

        test('Subfolder (/subfolder/) should be rejected with 403 Forbidden', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noRequestLogging: true });
            const res = await request(server).get('/subfolder/');
            expect(res.status).toBe(403);
            expect(res.text).toContain('Directory indexing is disabled');
        });

        test('Subfolder without trailing slash (/subfolder) should be rejected with 403 Forbidden', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noRequestLogging: true });
            const res = await request(server).get('/subfolder');
            expect(res.status).toBe(403);
            expect(res.text).toContain('Directory indexing is disabled');
        });

        test('/random should NOT magically resolve to /random.html (cleanUrls disabled)', async () => {
            server = startServer({ directory: baseDir, port, mode: 'rest', noRequestLogging: true });
            const res = await request(server).get('/random');
            expect(res.status).toBe(404); // 404 because random (no extension) doesn't exist
        });

        test('Lambda@Edge Rewrite: /subfolder/ rewritten to /subfolder/index.html should succeed', async () => {
            edgeRunner = new EdgeRunner(edgeDir, { watch: false });
            server = startServer({ directory: baseDir, port, mode: 'rest', noRequestLogging: true, edgeRunner });

            // The origin-request hook intercepts /subfolder/ and transforms it to /subfolder/index.html
            const res = await request(server).get('/subfolder/');

            // Should now bypass the fidelity check (because the rewritten path is a FILE, not a directory)
            expect(res.status).toBe(200);
            expect(res.text).toContain('Subfolder Index');
        });
    });
});
