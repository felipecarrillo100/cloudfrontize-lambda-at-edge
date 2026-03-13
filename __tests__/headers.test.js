'use strict';

const { EdgeRunner } = require('../src/edgeRunner');

// ---------------------------------------------------------------------------
// Mock request factory that mirrors a real Node HTTP IncomingMessage, including
// rawHeaders (which preserves original casing and allows repeated keys).
// ---------------------------------------------------------------------------
function mockReq(overrides = {}) {
    const headers = overrides.headers || {};
    // Build rawHeaders from the headers if not provided separately
    const rawHeaders = overrides.rawHeaders || Object.entries(headers).flatMap(([k, v]) => [k, v]);

    return {
        method: 'GET',
        url: '/',
        socket: { remoteAddress: '127.0.0.1' },
        headers,
        rawHeaders,
        ...overrides
    };
}

describe('Header Compliance: Case Preservation & Multi-Value Arrays', () => {

    // -----------------------------------------------------------------------
    // 1. Case Preservation
    // -----------------------------------------------------------------------
    describe('Case Preservation', () => {
        test('📋 Should preserve original header casing in key property', () => {
            const runner = new EdgeRunner(null, { watch: false });

            const req = mockReq({
                headers: { 'x-custom-header': 'hello' },
                rawHeaders: ['X-Custom-Header', 'hello']
            });

            const parsed = runner._parseIncomingHeaders(req);

            expect(parsed['x-custom-header']).toBeDefined();
            // Object key must be lowercase
            expect(Object.keys(parsed).includes('x-custom-header')).toBe(true);
            // Inner key must preserve original casing
            expect(parsed['x-custom-header'][0].key).toBe('X-Custom-Header');
            expect(parsed['x-custom-header'][0].value).toBe('hello');
        });

        test('📋 Should lowercase the outer object key regardless of input casing', () => {
            const runner = new EdgeRunner(null, { watch: false });

            const req = mockReq({
                headers: { 'content-type': 'application/json' },
                rawHeaders: ['Content-Type', 'application/json']
            });

            const parsed = runner._parseIncomingHeaders(req);

            expect(parsed['content-type']).toBeDefined();
            expect(Object.keys(parsed).includes('Content-Type')).toBe(false);
            expect(parsed['content-type'][0].key).toBe('Content-Type');
        });

        test('📋 Mixed-case header name: preserves exact wire casing in key', () => {
            const runner = new EdgeRunner(null, { watch: false });

            const req = mockReq({
                headers: { 'x-amz-cf-id': 'cfid-123' },
                rawHeaders: ['X-Amz-Cf-Id', 'cfid-123']
            });

            const parsed = runner._parseIncomingHeaders(req);

            expect(parsed['x-amz-cf-id'][0].key).toBe('X-Amz-Cf-Id');
        });
    });

    // -----------------------------------------------------------------------
    // 2. Multi-Value Header Arrays
    // -----------------------------------------------------------------------
    describe('Multi-Value Headers', () => {
        test('🔁 Should produce an array with multiple entries for repeated headers', () => {
            const runner = new EdgeRunner(null, { watch: false });

            const req = mockReq({
                headers: {
                    'set-cookie': 'a=1; b=2' // Node.js joins repeated headers with comma for most, and array for set-cookie
                },
                rawHeaders: [
                    'Set-Cookie', 'session=abc; Path=/',
                    'Set-Cookie', 'tracking=xyz; Path=/'
                ]
            });

            const parsed = runner._parseIncomingHeaders(req);

            expect(parsed['set-cookie']).toHaveLength(2);
            expect(parsed['set-cookie'][0].key).toBe('Set-Cookie');
            expect(parsed['set-cookie'][0].value).toBe('session=abc; Path=/');
            expect(parsed['set-cookie'][1].key).toBe('Set-Cookie');
            expect(parsed['set-cookie'][1].value).toBe('tracking=xyz; Path=/');
        });

        test('🔁 _normalizeHeadersInternal: correctly maps existing AWS header array to output', () => {
            const runner = new EdgeRunner(null, { watch: false });

            // This is what a Lambda function might set in its return value
            const lambdaReturnHeaders = {
                'set-cookie': [
                    { key: 'Set-Cookie', value: 'a=1; Path=/' },
                    { key: 'Set-Cookie', value: 'b=2; Path=/' }
                ]
            };

            const normalized = runner._normalizeHeadersInternal(lambdaReturnHeaders);

            expect(normalized['set-cookie']).toHaveLength(2);
            expect(normalized['set-cookie'][0].key).toBe('Set-Cookie');
            expect(normalized['set-cookie'][0].value).toBe('a=1; Path=/');
            expect(normalized['set-cookie'][1].key).toBe('Set-Cookie');
            expect(normalized['set-cookie'][1].value).toBe('b=2; Path=/');
        });

        test('🔁 _normalizeHeadersInternal: handles single-value string entries', () => {
            const runner = new EdgeRunner(null, { watch: false });

            const input = {
                'content-type': 'application/json'
            };

            const normalized = runner._normalizeHeadersInternal(input);

            expect(normalized['content-type']).toHaveLength(1);
            expect(normalized['content-type'][0].value).toBe('application/json');
        });

        test('🔁 _normalizeHeadersInternal: handles native string arrays (multi-value strings)', () => {
            const runner = new EdgeRunner(null, { watch: false });

            // Some code paths might pass an array of plain strings
            const input = {
                'cache-control': ['no-cache', 'no-store']
            };

            const normalized = runner._normalizeHeadersInternal(input);

            expect(normalized['cache-control']).toHaveLength(2);
            expect(normalized['cache-control'][0].value).toBe('no-cache');
            expect(normalized['cache-control'][1].value).toBe('no-store');
        });
    });

    // -----------------------------------------------------------------------
    // 3. Fallback for test mock objects without rawHeaders
    // -----------------------------------------------------------------------
    describe('Fallback Compatibility (no rawHeaders)', () => {
        test('🛡️ Should gracefully fallback when req.rawHeaders is absent', () => {
            const runner = new EdgeRunner(null, { watch: false });

            // Mock requests in existing tests don't have rawHeaders
            const req = {
                method: 'GET',
                url: '/',
                headers: { 'x-test': 'value' }
                // rawHeaders deliberately absent
            };

            const parsed = runner._parseIncomingHeaders(req);

            expect(parsed['x-test']).toHaveLength(1);
            expect(parsed['x-test'][0].value).toBe('value');
        });
    });
});
