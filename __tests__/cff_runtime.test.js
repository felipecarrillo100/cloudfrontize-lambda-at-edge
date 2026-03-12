'use strict';

const { CFFRunner } = require('../src/CFFRunner');
const fs = require('fs');
const path = require('path');

describe('CFF Runtime Fidelity: Sandbox & Limits', () => {
    const rootDir = path.resolve(__dirname, '..');
    const baseDir = path.join(rootDir, 'tmp_test', 'cff_fidelity');

    beforeAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
        fs.mkdirSync(baseDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
    });

    test('🛡️ CFF Sandbox: Should NOT have access to require', async () => {
        const testDir = path.join(baseDir, 'sandbox');
        fs.mkdirSync(testDir, { recursive: true });
        
        fs.writeFileSync(path.join(testDir, 'viewer-request-jail.js'), `
            function handler(event) {
                var status = "shield_held";
                try { require('fs'); status = "escaped"; } catch(e) {}
                event.request.headers['x-jail'] = { value: status };
                return event.request;
            }
        `);

        const runner = new CFFRunner(testDir);
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: {} }, null, 'viewer-request');
        const result = await runner.runChain('viewer-request', event);

        expect(result.request.headers['x-jail'].value).toBe('shield_held');
    });

    test('⚡ CFF CPU Limit: Should warn when exceeding 1ms', async () => {
        const testDir = path.join(baseDir, 'cpu');
        fs.mkdirSync(testDir, { recursive: true });
        
        // Loop for ~2ms
        fs.writeFileSync(path.join(testDir, 'viewer-request-slow.js'), `
            function handler(event) {
                var start = Date.now();
                while(Date.now() - start < 10) {} 
                return event.request;
            }
        `);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const runner = new CFFRunner(testDir);
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: {} }, null, 'viewer-request');
        await runner.runChain('viewer-request', event);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('exceeded 1ms CPU limit'));
        consoleSpy.mockRestore();
    });

    test('📂 CFF Lexicographical Chaining: Should execute in order', async () => {
        const testDir = path.join(baseDir, 'ordering');
        fs.mkdirSync(testDir, { recursive: true });
        
        fs.writeFileSync(path.join(testDir, 'viewer-request-01.js'), `
            function handler(event) {
                event.request.headers['x-order'] = { value: (event.request.headers['x-order'] ? event.request.headers['x-order'].value : '') + '1' };
                return event.request;
            }
        `);
        fs.writeFileSync(path.join(testDir, 'viewer-request-02.js'), `
            function handler(event) {
                event.request.headers['x-order'] = { value: (event.request.headers['x-order'] ? event.request.headers['x-order'].value : '') + '2' };
                return event.request;
            }
        `);

        const runner = new CFFRunner(testDir, { debug: true });
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: {} }, null, 'viewer-request');
        const result = await runner.runChain('viewer-request', event);

        expect(result.request.headers['x-order'].value).toBe('12');
    });

    test('🔄 CFF Event Mapping: Bidirectional validation', () => {
        const runner = new CFFRunner();
        const req = {
            method: 'POST',
            url: '/test?foo=bar',
            headers: { 'host': 'example.com', 'user-agent': 'test' },
            socket: { remoteAddress: '1.2.3.4' }
        };
        const resData = {
            status: 201,
            headers: { 'x-resp': 'hello' }
        };

        const event = runner.toCFFEvent(req, null, 'viewer-response', resData);

        expect(event.request.method).toBe('POST');
        expect(event.request.uri).toBe('/test');
        expect(event.request.querystring.foo.value).toBe('bar');
        expect(event.request.headers['user-agent'].value).toBe('test');
        expect(event.viewer.ip).toBe('1.2.3.4');
        expect(event.response.statusCode).toBe(201);
        expect(event.response.headers['x-resp'].value).toBe('hello');

        const mappedRes = runner.fromCFFEvent(event.response);

        expect(mappedRes.status).toBe(201);
        expect(mappedRes.headers['x-resp'][0].value).toBe('hello');
    });

    test('🔥 CFF Variable Baking: Should inject __VAR__ values and output files', async () => {
        const testDir = path.join(baseDir, 'baking');
        const outputDir = path.join(testDir, '_output');
        const bakeFile = path.join(testDir, 'vars.env');
        
        fs.mkdirSync(testDir, { recursive: true });
        
        fs.writeFileSync(bakeFile, 'API_KEY=xyz123\nDEBUG=true');
        fs.writeFileSync(path.join(testDir, 'viewer-request-bake.js'), `
            function handler(event) {
                var request = event.request;
                request.headers['x-api-key'] = { value: "__API_KEY__" };
                request.headers['x-debug'] = { value: "__DEBUG__" };
                return request;
            }
        `);

        const runner = new CFFRunner(testDir, {
            bakePath: bakeFile,
            outputPath: outputDir
        });

        // Test the runtime injection
        const event = runner.toCFFEvent({ method: 'GET', url: '/', headers: {} }, null, 'viewer-request');
        const result = await runner.runChain('viewer-request', event);

        expect(result.request.headers['x-api-key'].value).toBe('xyz123');
        expect(result.request.headers['x-debug'].value).toBe('true');

        // Test the file output
        const bakedFile = path.join(outputDir, 'viewer-request-bake.js');
        expect(fs.existsSync(bakedFile)).toBe(true);
        const bakedCode = fs.readFileSync(bakedFile, 'utf8');
        expect(bakedCode).toContain('"xyz123"');
        expect(bakedCode).toContain('"true"');
        expect(bakedCode).not.toContain('__API_KEY__');
    });
});
