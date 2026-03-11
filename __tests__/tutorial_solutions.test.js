'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Tutorial Solutions: Automated Verification', () => {
    let runners = [];
    const solutionsDir = path.resolve(__dirname, '../tutorial/solutions');

    afterEach(() => {
        runners.forEach(r => r.runner.close());
    });

    const getRunner = (file, options) => {
        // We need to create a temp directory for the EdgeRunner because it expects a directory of hooks
        const tempDir = path.join(__dirname, `temp_sol_${path.basename(file, '.js')}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const hookContent = fs.readFileSync(path.join(solutionsDir, file), 'utf8');
        fs.writeFileSync(path.join(tempDir, 'index.js'), hookContent);

        const o = options ? options : {};
        const runner = new EdgeRunner(tempDir, { watch: false, ...o });
        runners.push({
            runner,
            cleanup: () => {
                try {
                    fs.unlinkSync(path.join(tempDir, 'index.js'));
                    fs.rmdirSync(tempDir);
                } catch (e) { }
            }
        });
        return runner;
    };

    afterAll(() => {
        runners.forEach(r => {
            r.runner.close();
            if (r.cleanup) r.cleanup();
        });
        runners = [];
    });

    test('1.1-security-guard: Should inject security headers', async () => {
        const runner = getRunner('1.1-security-guard.js');
        const res = await runner.runResponseHook({ url: '/' }, { status: '200', headers: {} });
        expect(res['strict-transport-security']).toContain('max-age=63072000');
        expect(res['x-content-type-options']).toBe('nosniff');
    });

    test('1.2-librarian: Should normalize query strings', async () => {
        const runner = getRunner('1.2-librarian.js');
        const res = await runner.runRequestHook({ url: '/index.html?z=1&a=2' });
        expect(res.querystring).toBe('a=2&z=1');
    });

    test('1.3-concierge: Should redirect mobile users', async () => {
        const runner = getRunner('1.3-concierge.js');
        const mobileHeaders = { 'cloudfront-is-mobile-viewer': [{ key: 'X', value: 'true' }] };
        const res = await runner.runRequestHook({ url: '/home', headers: mobileHeaders });
        expect(res.status).toBe('302');
        expect(res.location).toBe('https://m.example.com/home');
    });

    test('2.1-scientist: Should rewrite for experiment cookie', async () => {
        const runner = getRunner('2.1-scientist.js');
        const headers = { cookie: [{ key: 'Cookie', value: 'experiment=true' }] };
        const res = await runner.runRequestHook({ url: '/index.html', headers });
        expect(res.uri).toBe('/experimental/index.html');
    });

    test('2.2-diplomat: Should prepend country code', async () => {
        const runner = getRunner('2.2-diplomat.js');
        const headers = { 'cloudfront-viewer-country': [{ key: 'X', value: 'DE' }] };
        const res = await runner.runRequestHook({ url: '/page', headers });
        expect(res.uri).toBe('/DE/page');
    });

    test('2.3-cloaker: Should strip origin server headers', async () => {
        const runner = getRunner('2.3-cloaker.js');
        const originResponse = {
            status: '200',
            headers: {
                'server': [{ value: 'Apache' }],
                'x-powered-by': [{ value: 'PHP' }]
            }
        };
        const res = await runner.runResponseHook({ url: '/' }, originResponse);
        expect(res.server).toBeUndefined();
        expect(res['x-powered-by']).toBeUndefined();
    });

    test('3.1-bouncer: Should gate with Basic Auth', async () => {
        const runner = getRunner('3.1-bouncer.js');

        // Fail
        const resFail = await runner.runRequestHook({ url: '/admin' });
        expect(resFail.status).toBe('401');

        // Pass
        const authHeader = 'Basic ' + Buffer.from('admin:password').toString('base64');
        const resPass = await runner.runRequestHook({
            url: '/admin',
            headers: { authorization: [{ value: authHeader }] }
        });
        expect(resPass.status).toBeUndefined();
        expect(resPass.uri).toBe('/admin');
    });

    test('3.2-architect: Should generate maintenance page', async () => {
        const runner = getRunner('3.2-architect.js');
        const res = await runner.runRequestHook({ url: '/any' });
        expect(res.status).toBe('503');
        expect(res.body).toContain('Site Under Maintenance');
    });

    test('3.3-inspector: Should block SQL-INJECTION in body', async () => {
        const runner = getRunner('3.3-inspector.js');
        const bodyBuffer = Buffer.from('DROP TABLE SQL-INJECTION');
        // runRequestHook(req, bodyBuffer)
        const res = await runner.runRequestHook({ url: '/api', method: 'POST' }, bodyBuffer);
        expect(res.status).toBe('403');
    });

    test('4.1-baker: Should connect to API endpoint', async () => {
        // Exercise 4.1 expects a global variable. We can't easily test the "bake" part
        // without a separate process, but we can verify the code is valid.
        const bakeFile = path.resolve(__dirname, '../tutorial/solutions/4.1-baked.variables');
        const runner = getRunner('4.1-baker.js', {bakePath: bakeFile});
        const res = await runner.runRequestHook({url: '/'});
        const endpoint = res.headers["x-baked-end-point"][0];
        const value = endpoint.value;
        expect(value).toBe("http://localhost:9090");
    });
});
