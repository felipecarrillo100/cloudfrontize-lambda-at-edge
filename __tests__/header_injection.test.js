const request = require('supertest');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const fs = require('fs');
const path = require('path');

describe('Default Header Injection (--headers)', () => {
    const tmpDir = path.join(__dirname, 'tmp_header_test');
    const edgeDir = path.join(tmpDir, 'edge');
    const port = 3008;

    let server;
    let edgeRunner;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });

        // Create a lambda that echoes back a specific header
        fs.writeFileSync(path.join(edgeDir, 'echo.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                const country = req.headers['cloudfront-viewer-country'] ? req.headers['cloudfront-viewer-country'][0].value : 'NONE';
                
                // Return a custom response to verify the header value
                return {
                    status: '200',
                    statusDescription: 'OK',
                    headers: {
                        'x-echoed-country': [{ key: 'X-Echoed-Country', value: country }]
                    },
                    body: 'Country: ' + country
                };
            };
        `);
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        if (edgeRunner) edgeRunner.close();
    });

    test('Should inject default headers when missing', async () => {
        const defaultHeaders = {
            'CloudFront-Viewer-Country': 'BE',
            'X-Custom-Header': 'foo'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
        server = startServer({ 
            directory: tmpDir, 
            port, 
            edgeRunner, 
            noRequestLogging: true,
            defaultHeaders
        });

        const res = await request(server).get('/');
        expect(res.header['x-echoed-country']).toBe('BE');
        expect(res.text).toBe('Country: BE');
    });

    test('Should NOT overwrite existing headers', async () => {
        const defaultHeaders = {
            'CloudFront-Viewer-Country': 'BE'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
        server = startServer({ 
            directory: tmpDir, 
            port: port + 1, 
            edgeRunner, 
            noRequestLogging: true,
            defaultHeaders
        });

        // Send request with an existing country header
        const res = await request(server)
            .get('/')
            .set('CloudFront-Viewer-Country', 'MX');

        expect(res.header['x-echoed-country']).toBe('MX');
        expect(res.text).toBe('Country: MX');
    });

    test('Should handle case-insensitivity correctly', async () => {
        const defaultHeaders = {
            'cloudfront-viewer-country': 'FR'
        };

        edgeRunner = new EdgeRunner(edgeDir, { watch: false });
        server = startServer({ 
            directory: tmpDir, 
            port: port + 2, 
            edgeRunner, 
            noRequestLogging: true,
            defaultHeaders
        });

        const res = await request(server).get('/');
        expect(res.header['x-echoed-country']).toBe('FR');
    });
});
