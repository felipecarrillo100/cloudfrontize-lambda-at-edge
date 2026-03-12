const { EdgeRunner } = require('../src/edgeRunner');
const fs = require('fs');
const path = require('path');

describe('End-to-End: Variable Baking & Env Whitelisting', () => {
    const testDir = path.join(__dirname, 'temp_samples_e2e');
    const tempEnv = path.join(__dirname, '.temp_e2e.env');
    const tempBake = path.join(__dirname, '.temp_e2e.bake');
    const tempOut = path.join(__dirname, 'dist_e2e/baked-handler.js');

    beforeAll(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

        const bakeHandler = `
            exports.hookType = 'origin-request';
            exports.handler = async (event) => {
                const request = event.Records[0].cf.request;
                request.headers['x-baked-api-key'] = [{ key: 'X-Baked-Api-Key', value: "__API_KEY__" }];
                return request;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'bakeTest.js'), bakeHandler);
    });

    afterAll(() => {
        // Clean up test files and directory
        [tempEnv, tempBake].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
        if (fs.existsSync(tempOut)) {
            fs.rmSync(tempOut, { recursive: true, force: true });
        }
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        const outDir = path.dirname(tempOut);
        if (fs.existsSync(outDir)) {
            fs.rmSync(outDir, { recursive: true, force: true });
        }
    });

    test('🛡️ Should BLOCK non-reserved AWS variables in .env', () => {
        fs.writeFileSync(tempEnv, `DATABASE_URL=postgres://localhost`);
        expect(() => {
            new EdgeRunner(testDir, { envPath: tempEnv, watch: false });
        }).toThrow(/Restricted Variable/);
    });

    test('🔥 Should successfully BAKE variables and ALLOW whitelisted ENV', async () => {
        fs.writeFileSync(tempBake, `API_KEY=secret-999`);

        const runner = new EdgeRunner(testDir, {
            bakePath: tempBake,
            watch: false // ⚡ Disable watcher to prevent EPERM errors
        });

        const result = await runner.runRequestHook({ method: 'GET', url: '/', headers: {} });

        // Check if the result exists and has headers
        expect(result).toBeDefined();
        expect(result.headers['x-baked-api-key']).toBeDefined();
        expect(result.headers['x-baked-api-key'][0].value).toBe('secret-999');
    });

    test('💾 Should write the baked code to the specified --output path', () => {
        fs.writeFileSync(tempBake, `API_KEY=prod-live-key`);

        const runner = new EdgeRunner(testDir, {
            bakePath: tempBake,
            outputPath: tempOut,
            watch: false
        });

        const actualOutPath = path.join(tempOut, 'bakeTest.js');
        expect(fs.existsSync(actualOutPath)).toBe(true);
        const content = fs.readFileSync(actualOutPath, 'utf8');
        expect(content).toContain('value: "prod-live-key"');
    });
});
