const { EdgeRunner } = require('../src/edgeRunner');

// Suppress console outputs during test runs so the Jest reporter stays clean
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterAll(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
    console.error.mockRestore();
});

describe('EdgeRunner 100% Emulation Fidelity', () => {

    test('1. Resolves async handlers natively (Promise support)', async () => {
        const runner = new EdgeRunner('./samples/edgecases/asyncHandler.js');
        const res = await runner.runRequestHook({ headers: {}, url: '/original.html' });

        expect(res).toBeDefined();
        // The async handler rewrote the URI after a 500ms delay
        expect(res.url).toBe('/async-success.html');
    });

    test('2. Injects mocked AWS context object to prevent crashes', async () => {
        const runner = new EdgeRunner('./samples/edgecases/contextLogger.js');
        const res = await runner.runRequestHook({ headers: {}, url: '/' });

        // If the context wasn't passed, the handler throws an error and returns null
        expect(res).toBeDefined();
        expect(res).not.toBeNull();
    });

    test('3. Natively extracts and splits query strings', async () => {
        const runner = new EdgeRunner('./samples/edgecases/queryStringRewriter.js');
        const res = await runner.runRequestHook({ headers: {}, url: '/page?utm_source=twitter&other=keep' });

        expect(res).toBeDefined();
        // The edge function should have stripped utm_source but kept other
        expect(res.url).toBe('/page?other=keep');
    });

    test('4. Emits warnings when mutating AWS blacklisted headers', async () => {
        const runner = new EdgeRunner('./samples/edgecases/blacklistedHeaderMutator.js');

        await runner.runResponseHook({ headers: {}, url: '/' }, { status: 200, headers: {} });

        // The host and via headers triggered the yellow warning
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('host'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('via'));
    });

    test('5. Multi-hook directories execute sequentially without collision', async () => {
        const runner = new EdgeRunner('./samples/advanced/multi-hook-app/');

        // viewer-request test
        const reqRes = await runner.runRequestHook({ headers: {}, url: '/test' });
        expect(reqRes.type).toBe('viewer-request');

        // origin-response test
        const resHookRes = await runner.runResponseHook({ headers: {}, url: '/test' }, { status: 200, headers: {} });
        expect(resHookRes['cache-control']).toBe('public, max-age=86400');
    });

});
