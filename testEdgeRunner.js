const { EdgeRunner } = require('./src/edgeRunner.js');

(async () => {
    try {
        console.log("=== 1. Testing Async Handler (Promise Support) ===");
        const r1 = new EdgeRunner('./samples/edgecases/asyncHandler.js');
        const res1 = await r1.runRequestHook({ headers: {}, url: '/original.html' });
        console.log("Result (expect URL rewritten to /async-success.html):", res1.url);

        console.log("\n=== 2. Testing Context Logger (Mocked Context) ===");
        const r2 = new EdgeRunner('./samples/edgecases/contextLogger.js');
        const res2 = await r2.runRequestHook({ headers: {}, url: '/' });
        console.log("Result object returned cleanly:", !!res2);

        console.log("\n=== 3. Testing Query String Rewriter ===");
        const r3 = new EdgeRunner('./samples/edgecases/queryStringRewriter.js');
        const res3 = await r3.runRequestHook({ headers: {}, url: '/page?utm_source=twitter&other=keep' });
        console.log("Result (expect ?other=keep):", res3.url);

        console.log("\n=== 4. Testing Blacklisted Headers (Expect Warning) ===");
        const r4 = new EdgeRunner('./samples/edgecases/blacklistedHeaderMutator.js');
        const res4 = await r4.runResponseHook({ headers: {}, url: '/' }, { status: 200, headers: {} });
        console.log("Headers attached to response output:", res4);

        console.log("\n=== 5. Testing Multi-hook App ===");
        const r5 = new EdgeRunner('./samples/advanced/multi-hook-app/');
        const res5req = await r5.runRequestHook({ headers: {}, url: '/test-uri' });
        const res5res = await r5.runResponseHook({ headers: {}, url: '/test-uri' }, { status: 200, headers: {} });
        console.log("Req hook returned:", !!res5req);
        console.log("Res hook returned Cache-Control:", res5res['cache-control'] || 'MISSING');
    } catch (err) {
        console.error("Test execution failed:", err);
    }
})();
