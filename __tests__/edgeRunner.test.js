const { EdgeRunner } = require('../src/edgeRunner');

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
        const runner = new EdgeRunner('./samples/edgecases/blacklistedHeaderMutator.js');
        runners.push(runner);

        await runner.runResponseHook({ headers: {}, url: '/' }, { status: 200, headers: {} });

        // ✅ Spies track the call even though the output is hidden from the terminal
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('host'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('via'));
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
