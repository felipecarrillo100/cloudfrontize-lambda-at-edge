const { EdgeRunner } = require('../src/edgeRunner');

/**
 * AWS SAMPLES FIDELITY TEST SUITE
 * This suite implements and tests the logic found in the official
 * AWS CloudFront Lambda@Edge documentation examples.
 */
describe('EdgeRunner: AWS Documentation Sample Tests', () => {
    let runners = [];

    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    afterEach(() => {
        runners.forEach(r => r.close());
        runners = [];
    });

    /**
     * AWS EXAMPLE: Query String Normalization
     * Purpose: Alphabetize and lowercase query strings to increase cache hit ratio.
     * Docs: Alphabetize key-value pairs by parameter name.
     */
    test('AWS Sample: Query String Normalization (Alphabetizing)', async () => {
        // Mocking the normalization logic directly for the test runner
        const runner = new EdgeRunner('./samples/aws/query-normalization.js');
        runners.push(runner);

        // Input: Jumbled and uppercase params
        const url = '/index.html?Z=Last&A=First&m=Middle';
        const res = await runner.runRequestHook({ headers: {}, url });

        // Expected: /index.html?a=first&m=middle&z=last
        expect(res.url).toBe('/index.html?a=first&m=middle&z=last');
    });

    /**
     * AWS EXAMPLE: Security Header Injection (Origin Response)
     * Purpose: Add HSTS and X-Frame-Options to all responses.
     */
    test('AWS Sample: Security Header Injection', async () => {
        const runner = new EdgeRunner('./samples/aws/security-headers.js');
        runners.push(runner);

        const request = { headers: {}, url: '/' };
        const response = { status: '200', statusDescription: 'OK', headers: {} };

        const res = await runner.runResponseHook(request, response);

        // 🛡️ Safe Access: If res.headers is undefined, check res itself
        const actualResponse = res.cf && res.cf.response ? res.cf.response : res;
        const headers = actualResponse.headers || {};

        expect(headers['strict-transport-security']).toBeDefined();
        expect(headers['strict-transport-security'][0].value).toContain('max-age=63072000');
    });

    /**
     * AWS EXAMPLE: Redirect based on Device Type
     * Purpose: Send mobile users to a different path.
     */
    test('AWS Sample: Content-Based Redirection (Mobile)', async () => {
        const runner = new EdgeRunner('./samples/aws/mobile-redirect.js');
        runners.push(runner);

        const mobileHeaders = {
            'cloudfront-is-mobile-viewer': [{ key: 'CloudFront-Is-Mobile-Viewer', value: 'true' }]
        };

        const res = await runner.runRequestHook({ headers: mobileHeaders, url: '/home' });

        // 🕵️ Troubleshooting: If res.status is undefined, we dig deeper
        // Some runners wrap the result in { response: ... }
        const finalObj = res.response || res;

        expect(finalObj).toBeDefined();
        expect(finalObj.status).toBe('302');
        expect(finalObj.headers.location[0].value).toBe('https://m.example.com/home');
    });
});
