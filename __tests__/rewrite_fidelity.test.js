const request = require('supertest');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const fs = require('fs');
const path = require('path');

describe('Rewrite Fidelity (Strict Mode vs Default)', () => {
    const tmpDir = path.join(__dirname, 'tmp_rewrite_fidelity');
    const edgeDir = path.join(tmpDir, 'edge');
    const port = 3006;

    let server;
    let edgeRunner;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });

        // Original file exists
        fs.writeFileSync(path.join(tmpDir, 'test.js'), 'console.log("original")');
        
        // Rewritten file DOES NOT exist initially
        // We will mock an edge function that rewrites /test.js -> /test.js.br
        fs.writeFileSync(path.join(edgeDir, 'rewrite.js'), `
            exports.hookType = 'origin-request';
            exports.handler = (event, context, callback) => {
                const request = event.Records[0].cf.request;
                if (request.uri === '/test.js') {
                    request.uri = '/test.js.br';
                }
                callback(null, request);
            };
        `);

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
    });

    test('Default Mode: Should warn and fallback to original file if rewritten target is missing', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        server = startServer({ directory: tmpDir, port, edgeRunner, noRequestLogging: true });
        
        const res = await request(server).get('/test.js').set('Accept-Encoding', 'br');
        
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Lambda rewritten URI to "/test.js.br" but file was not found'));
        spy.mockRestore();
    });

    test('Strict Mode: Should return 404 if rewritten target is missing', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        server = startServer({ directory: tmpDir, port, edgeRunner, strict: true, noRequestLogging: true });
        
        const res = await request(server).get('/test.js').set('Accept-Encoding', 'br');
        
        // serve-handler should 404 because /test.js.br doesn't exist and we didn't fallback
        expect(res.status).toBe(404);
        spy.mockRestore();
    });

    test('Should succeed if rewritten target exists', async () => {
        const zlib = require('zlib');
        const content = 'brotli compressed content';
        const compressed = zlib.brotliCompressSync(Buffer.from(content));
        
        fs.writeFileSync(path.join(tmpDir, 'test.js.br'), compressed);
        
        server = startServer({ directory: tmpDir, port, edgeRunner, noRequestLogging: true });
        
        const res = await request(server)
            .get('/test.js')
            .set('Accept-Encoding', 'br');
        
        expect(res.status).toBe(200);
        expect(res.header['content-encoding']).toBe('br');
        expect(res.text).toBe(content);
    });
});
