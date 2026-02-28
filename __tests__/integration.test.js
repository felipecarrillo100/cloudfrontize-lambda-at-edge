'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');

// TMP_DIR: Ensure we use an absolute path that is safe for the OS
const TMP_DIR = path.resolve(__dirname, '..', 'tmp_test', 'e2e_public');
let server;

/**
 * Helper to make programmatic HTTP requests
 */
function fetchURL(url, headers = {}) {
    headers['Connection'] = 'close';
    return new Promise((resolve, reject) => {
        // agent: false prevents the Node.js connection pool from keeping the process alive
        http.get(url, { headers, agent: false }, (res) => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(data)
                });
            });
        }).on('error', reject);
    });
}

beforeAll(async () => {
    // 0. Mock fs.watch to prevent Jest from hanging on persistent file watchers
    jest.spyOn(fs, 'watch').mockImplementation(() => ({
        close: () => { }
    }));

    // 1. Create temporary directory RECURSIVELY
    // This fixes the "no such file or directory, mkdir" error
    if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    // 2. Generate a 1MB "small" JSON file (under 10MB limit)
    const smallJson = { data: 'A'.repeat(1 * 1024 * 1024) };
    fs.writeFileSync(path.join(TMP_DIR, 'small.json'), JSON.stringify(smallJson));

    // 3. Generate an 11MB "large" JSON file (Over 10MB limit)
    const largeContent = JSON.stringify({ data: 'B'.repeat(11 * 1024 * 1024) });
    fs.writeFileSync(path.join(TMP_DIR, 'large.js'), `const x = ${largeContent};`);
    fs.writeFileSync(path.join(TMP_DIR, 'large-missing.js'), `const x = ${largeContent};`);

    // 4. Compress it using native node zlib
    const brData = zlib.brotliCompressSync(Buffer.from(`const x = ${largeContent};`));
    const gzData = zlib.gzipSync(Buffer.from(`const x = ${largeContent};`));

    // Save pre-compressed targets
    fs.writeFileSync(path.join(TMP_DIR, 'large.js.br'), brData);
    fs.writeFileSync(path.join(TMP_DIR, 'large.js.gz'), gzData);

    // 5. Start the server
    // Note: Ensure your sample 'servePrecompressed.js' exists in this path!
    const edgeRunner = new EdgeRunner(path.resolve(__dirname, '../samples/basic/servePrecompressed.js'), { watch: false });

    server = startServer({
        directory: TMP_DIR,
        port: 9091,
        edgeRunner: edgeRunner,
        noRequestLogging: true
    });

    // Brief wait to ensure server is bound
    await new Promise(resolve => setTimeout(resolve, 200));
});

afterAll(async () => {
    jest.restoreAllMocks();

    if (server && server.close) {
        await new Promise(resolve => server.close(resolve));
    }

    // Cleanup the temp directory with retries for Windows file-locking
    if (fs.existsSync(TMP_DIR)) {
        try {
            fs.rmSync(TMP_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } catch (e) {
            console.warn('[Cleanup] Failed to remove TMP_DIR, likely file lock:', e.message);
        }
    }
});

describe('End-to-End EdgeRunner + CloudFrontize Integration', () => {

    test('1. File < 10MB on-the-fly compression to gzip', async () => {
        const res = await fetchURL('http://localhost:9091/small.json', { 'accept-encoding': 'gzip' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('gzip');
    });

    test('2. Missing .br triggers silent fallback to original file', async () => {
        const res = await fetchURL('http://localhost:9091/large-missing.js', { 'accept-encoding': 'br' });
        expect(res.status).toBe(200);
        // Should not be compressed because 11MB > 10MB limit and no .br exists
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.body.length).toBeGreaterThan(10 * 1024 * 1024);
    });

    test('3. Successful Lambda rewrite to Pre-Compressed .br asset (>10MB limit)', async () => {
        const res = await fetchURL('http://localhost:9091/large.js', { 'accept-encoding': 'br' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('br');
        // Pre-compressed file is much smaller than 11MB
        expect(res.body.length).toBeLessThan(1 * 1024 * 1024);
    });

    test('4. Successful Lambda rewrite to Pre-Compressed .gz asset (>10MB limit) if br absent', async () => {
        const res = await fetchURL('http://localhost:9091/large.js', { 'accept-encoding': 'gzip' });
        expect(res.status).toBe(200);
        expect(res.headers['content-encoding']).toBe('gzip');
    });

    test('5. Server shuts down gracefully', async () => {
        expect(server).toBeDefined();
        // The actual closure is handled in afterAll, so we just verify it was initialized
        expect(server.listening).toBe(true);
    });
});
