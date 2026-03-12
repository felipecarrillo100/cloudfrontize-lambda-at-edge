const { EdgeRunner } = require('../src/edgeRunner');
const { AWS_LIMITS } = require('../src/constants');
const fs = require('fs');
const path = require('path');

describe('Execution Timeout Fidelity', () => {
    const tmpDir = path.join(__dirname, 'tmp_timeout_test');
    const port = 3008;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Viewer Hook: Should timeout after 5s in strict mode', async () => {
        const testDir = path.join(tmpDir, 'strict_timeout');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event, context) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return event.Records[0].cf.request;
            };
        `);

        const runner = new EdgeRunner(testDir, { strict: true, watch: false });
        const result = await runner.runRequestHook({ url: '/' });
        expect(result).toBeNull();
        runner.close();
    }, 15000);

    test('Origin Hook: Should NOT timeout at 6s (Limit is 30s)', async () => {
        const testDir = path.join(tmpDir, 'origin_ok');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return event.Records[0].cf.request;
            };
        `);

        const runner = new EdgeRunner(testDir, { strict: true, watch: false });
        const result = await runner.runRequestHook({ url: '/' });
        
        expect(result).not.toBeNull();
        expect(result.uri).toBe('/');
        runner.close();
    }, 15000);

    test('Default Mode: Should log warning but allow completion after timeout', async () => {
        const testDir = path.join(tmpDir, 'viewer_warn');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                await new Promise(resolve => setTimeout(resolve, 5500));
                const req = event.Records[0].cf.request;
                req.uri = '/finished';
                return req;
            };
        `);

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const runner = new EdgeRunner(testDir, { strict: false, watch: false });
        
        const result = await runner.runRequestHook({ url: '/' });
        
        expect(result.uri).toBe('/finished');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Fidelity Warning: Handler took'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeding the AWS 5s limit'));
        
        warnSpy.mockRestore();
        runner.close();
    }, 15000);

    test('Context: getRemainingTimeInMillis() should decrease', async () => {
        const testDir = path.join(tmpDir, 'remaining_time');
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'handler.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = async (event, context) => {
                const t1 = context.getRemainingTimeInMillis();
                await new Promise(resolve => setTimeout(resolve, 1000));
                const t2 = context.getRemainingTimeInMillis();
                return { 
                    status: '200',
                    headers: { 'x-times': [{ key: 'x-times', value: t1 + ',' + t2 }] },
                    body: 'ok'
                };
            };
        `);

        const runner = new EdgeRunner(testDir, { watch: false });
        const result = await runner.runRequestHook({ url: '/' });
        
        const [t1, t2] = result.headers['x-times'][0].value.split(',').map(Number);
        expect(t1).toBeGreaterThan(4500);
        expect(t1).toBeLessThanOrEqual(5000);
        expect(t2).toBeLessThan(t1 - 900);
        runner.close();
    }, 15000);
});
