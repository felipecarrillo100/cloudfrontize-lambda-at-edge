const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

/**
 * EDGE RUNNER EMULATION FIDELITY
 * Verifies that the local runner correctly mocks the AWS environment.
 */

describe('EdgeRunner 100% Emulation Fidelity', () => {
    let runners = [];

    // 🛡️ Suppress console outputs during test runs so the Jest reporter stays clean
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterAll(() => {
        // Cleanly restores all mocks to their original state
        jest.restoreAllMocks();
    });

    afterEach(() => {
        for (const r of runners) {
            if (r && typeof r.close === 'function') r.close();
        }
        runners = [];
    });

    test('1. Resolves async handlers natively (Promise support)', async () => {
        const runner = new EdgeRunner('./samples/edgecases/asyncHandler.js');
        runners.push(runner);
        const res = await runner.runRequestHook({ headers: {}, url: '/original.html' });

        expect(res).toBeDefined();
        expect(res.url).toBe('/async-success.html');
    });

    test('2. Injects mocked AWS context object to prevent crashes', async () => {
        const runner = new EdgeRunner('./samples/edgecases/contextLogger.js');
        runners.push(runner);
        const res = await runner.runRequestHook({ headers: {}, url: '/' });

        expect(res).toBeDefined();
        expect(res).not.toBeNull();
    });

    test('3. Natively extracts and splits query strings', async () => {
        const runner = new EdgeRunner('./samples/edgecases/queryStringRewriter.js');
        runners.push(runner);
        const res = await runner.runRequestHook({ headers: {}, url: '/page?utm_source=twitter&other=keep' });

        expect(res).toBeDefined();
        expect(res.url).toBe('/page?other=keep');
    });

    test('4. Emits warnings when mutating AWS blacklisted headers', async () => {
        // Test Host (Request-only forbidden)
        const reqRunner = new EdgeRunner('./samples/edgecases/queryStringRewriter.js'); // Use any request-compatible handler
        runners.push(reqRunner);
        // Manually inject a mutation that triggers a warning if possible, 
        // but better yet, use a dedicated mutator sample.

        const resRunner = new EdgeRunner('./samples/edgecases/blacklistedHeaderMutator.js');
        runners.push(resRunner);

        await resRunner.runResponseHook({ headers: {}, url: '/' }, { status: 200, headers: {} });

        // ✅ Spies track the call even though the output is hidden from the terminal
        // Note: host is now request-only, via is common.
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('via'));

        // Add a request-specific check
        const mutatorCode = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                request.headers['host'] = [{ key: 'Host', value: 'forbidden.com' }];
                return request;
            };
        `;
        const tempPath = path.join(__dirname, '..', 'tmp_test', 'runner_host_test.js');
        if (!fs.existsSync(path.dirname(tempPath))) fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        fs.writeFileSync(tempPath, mutatorCode);

        const hostRunner = new EdgeRunner(tempPath);
        runners.push(hostRunner);
        await hostRunner.runRequestHook({ headers: {}, url: '/' });
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('host'));

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });

    test('5. Multi-hook directories execute sequentially without collision', async () => {
        const runner = new EdgeRunner('./samples/advanced/multi-hook-app/');
        runners.push(runner);

        const reqRes = await runner.runRequestHook({ headers: {}, url: '/test' });
        expect(reqRes.type).toBe('viewer-request');

        const resHookRes = await runner.runResponseHook({ headers: {}, url: '/test' }, { status: 200, headers: {} });
        expect(resHookRes['cache-control']).toBe('public, max-age=86400');
    });
});
