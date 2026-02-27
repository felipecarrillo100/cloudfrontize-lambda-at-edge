const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');

// We use native `zlib` to compress the files programmatically! No extra npm package needed!

const TMP_DIR = path.join(__dirname, 'tmp_e2e_public');
let server;

// Helper to make programmatic HTTP requests
function fetchURL(url, headers = {}) {
    headers['Connection'] = 'close'; // Prevent keep-alive from holding the server open!
    return new Promise((resolve, reject) => {
        http.get(url, { headers }, (res) => {
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
    // 1. Create temporary directory
    if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR);
    }

    // 2. Generate a 1MB "small" JSON file (under 10MB limit)
    const smallJson = { data: 'A'.repeat(1 * 1024 * 1024) };
    fs.writeFileSync(path.join(TMP_DIR, 'small.json'), JSON.stringify(smallJson));

    // 3. Generate an 11MB "large" JSON file (Over 10MB limit)
    const largeJsonParts = [];
    for (let i = 0; i < 11; i++) {
        largeJsonParts.push('B'.repeat(1024 * 1024));
    }
    const largeJson = { data: largeJsonParts.join('') };
    const largeContent = JSON.stringify(largeJson);
    fs.writeFileSync(path.join(TMP_DIR, 'large.js'), `const x = ${largeContent};`);
    fs.writeFileSync(path.join(TMP_DIR, 'large-missing.js'), `const x = ${largeContent};`);

    // 4. Compress it using native node zlib!
    const brData = zlib.brotliCompressSync(Buffer.from(`const x = ${largeContent};`));
    const gzData = zlib.gzipSync(Buffer.from(`const x = ${largeContent};`));

    // Save the pre-compressed targets to disk next to large.js
    fs.writeFileSync(path.join(TMP_DIR, 'large.js.br'), brData);
    fs.writeFileSync(path.join(TMP_DIR, 'large.js.gz'), gzData);

    // 5. Start the server on port 9091 using your existing servePrecompressed sample!
    const edgeRunner = new EdgeRunner(path.resolve(__dirname, '../samples/basic/servePrecompressed.js'));
    server = startServer({
        directory: TMP_DIR,
        port: 9091,
        edgeRunner: edgeRunner,
        noRequestLogging: true
    });
});

afterAll(() => {
    // 1. Teardown server
    if (server) {
        server.close();
    }
    // 2. Teardown temporary files
    if (fs.existsSync(TMP_DIR)) {
        fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
});

describe('End-to-End EdgeRunner + CloudFrontize Integration', () => {

    test('1. File < 10MB on-the-fly compression to gzip', async () => {
        const res = await fetchURL('http://localhost:9091/small.json', { 'accept-encoding': 'gzip' });
        expect(res.status).toBe(200);
        // The middleware automatically compresses it!
        expect(res.headers['content-encoding']).toBe('gzip');
    });

    test('2. Missing .br triggers silent fallback to original file', async () => {
        // large-missing.js does NOT have a .br counterpart
        const res = await fetchURL('http://localhost:9091/large-missing.js', { 'accept-encoding': 'br' });
        expect(res.status).toBe(200);

        // The EdgeRunner mutated the URI to large-missing.js.br, but index.js verified it was missing
        // and safely fell back to the original 11MB file uncompressed.
        expect(res.headers['content-encoding']).toBeUndefined();
        expect(res.body.length).toBeGreaterThan(10 * 1024 * 1024);
    });

    test('3. Successful Lambda rewrite to Pre-Compressed .br asset (>10MB limit)', async () => {
        // large.js DOES have a .br counterpart we created
        const res = await fetchURL('http://localhost:9091/large.js', { 'accept-encoding': 'br' });
        expect(res.status).toBe(200);

        // EdgeRunner shifted it to .br, index.js found it, and served it successfully!
        expect(res.headers['content-encoding']).toBe('br');
        // The body should be significantly smaller than 11MB now!
        expect(res.body.length).toBeLessThan(1024 * 1024);
    });

    test('4. Successful Lambda rewrite to Pre-Compressed .gz asset (>10MB limit) if br absent from accept', async () => {
        // Provided gzip instead of br in the Accept-Encoding header
        const res = await fetchURL('http://localhost:9091/large.js', { 'accept-encoding': 'gzip' });
        expect(res.status).toBe(200);

        // The sample Lambda checks for br first, then gzip. It should rewrite to .gz
        expect(res.headers['content-encoding']).toBe('gzip');
    });
});
