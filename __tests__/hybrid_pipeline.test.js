'use strict';

const request = require('supertest');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { CFFRunner } = require('../src/CFFRunner');
const fs = require('fs');
const path = require('path');

describe('Hybrid Pipeline: CFF + Lambda@Edge', () => {
    const rootDir = path.resolve(__dirname, '..');
    const baseDir = path.join(rootDir, 'tmp_test', 'hybrid_pipeline');
    const wwwDir = path.join(baseDir, 'www');
    const edgeDir = path.join(baseDir, 'edge');
    const cffDir = path.join(baseDir, 'cff');
    let server;

    beforeAll(async () => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(wwwDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });
        fs.mkdirSync(cffDir, { recursive: true });

        fs.writeFileSync(path.join(wwwDir, 'index.html'), '<html><body>Hello</body></html>');

        // Lambda@Edge Hooks
        fs.writeFileSync(path.join(edgeDir, 'request.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.headers['x-pipeline'] = [{key: 'x-pipeline', value: (req.headers['x-pipeline'] ? req.headers['x-pipeline'][0].value : '') + ' -> L@E-REQ'}];
                return req;
            };
        `);
        fs.writeFileSync(path.join(edgeDir, 'response.js'), `
            exports.hookType = 'viewer-response';
            exports.handler = async (event) => {
                const res = event.Records[0].cf.response;
                res.headers['x-pipeline'] = [{key: 'x-pipeline', value: (res.headers['x-pipeline'] ? res.headers['x-pipeline'][0].value : '') + ' -> L@E-RES'}];
                return event.Records[0].cf;
            };
        `);

        // CFF Hooks
        fs.writeFileSync(path.join(cffDir, 'viewer-request-main.js'), `
            function handler(event) {
                var req = event.request;
                req.headers['x-pipeline'] = { value: (req.headers['x-pipeline'] ? req.headers['x-pipeline'].value : '') + 'CFF-REQ' };
                return req;
            }
        `);
        fs.writeFileSync(path.join(cffDir, 'viewer-response-main.js'), `
            function handler(event) {
                var res = event.response;
                res.headers['x-pipeline'] = { value: (res.headers['x-pipeline'] ? res.headers['x-pipeline'].value : '') + ' -> CFF-RES' };
                return res;
            }
        `);

        server = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: new EdgeRunner(edgeDir, { watch: false }),
            cffRunner: new CFFRunner(cffDir),
            noRequestLogging: true
        });
    });

    afterAll(async () => {
        if (server) await server.closeGracefully();
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
    });

    test('🔗 Should execute hooks in the correct AWS sequence', async () => {
        const res = await request(server).get('/');
        
        expect(res.status).toBe(200);
        // Sequence: CFF-REQ -> L@E-REQ -> (Static) -> L@E-RES -> CFF-RES
        expect(res.headers['x-pipeline']).toBe('CFF-REQ -> L@E-REQ -> L@E-RES -> CFF-RES');
    });

    test('🛑 CFF Short-circuit: Should skip L@E if CFF returns response', async () => {
        fs.writeFileSync(path.join(cffDir, 'viewer-request-redirect.js'), `
            function handler(event) {
                if (event.request.uri === '/redirect') {
                    return {
                        statusCode: 302,
                        statusDescription: 'Found',
                        headers: {
                            'location': { value: '/target' },
                            'x-cff-short': { value: 'true' }
                        }
                    };
                }
                return event.request;
            }
        `);
        
        // Restart server or just update runner if it watched (but we disabled watch for edge, CFF doesn't have watch yet)
        // Actually, just creating a new server for this test case is cleaner
        const cffRunnerShort = new CFFRunner(cffDir);
        const serverShort = startServer({
            port: 0,
            directory: wwwDir,
            edgeRunner: new EdgeRunner(edgeDir, { watch: false }),
            cffRunner: cffRunnerShort,
            noRequestLogging: true
        });

        const res = await request(serverShort).get('/redirect');
        expect(res.status).toBe(302);
        expect(res.headers['location']).toBe('/target');
        expect(res.headers['x-cff-short']).toBe('true');
        // L@E should NOT have run
        const pipeline = res.headers['x-pipeline'] || '';
        expect(pipeline).not.toContain('L@E');

        await serverShort.closeGracefully();
    });
});
