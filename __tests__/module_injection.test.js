const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Context-Aware Module Injection', () => {
    let edgeRunner;
    const tempDir = path.join(__dirname, 'temp_hooks');

    beforeAll(() => {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const createHook = (name, content) => {
        const filePath = path.join(tempDir, name);
        fs.writeFileSync(filePath, content);
        return filePath;
    };

    test('Viewer Request: Allowed to require whitelisted built-ins (crypto)', async () => {
        const hookPath = createHook('viewer_crypto.js', `
            exports.hookType = 'viewer-request';
            const crypto = require('crypto');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        edgeRunner = new EdgeRunner(hookPath, { watch: false });
        // Loading should NOT throw
        expect(edgeRunner.modules['viewer-request']).toBeDefined();
    });

    test('Viewer Request: Forbidden to require fs', async () => {
        const hookPath = createHook('viewer_fs.js', `
            exports.hookType = 'viewer-request';
            const fs = require('fs');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        
        expect(() => {
            new EdgeRunner(hookPath, { watch: false });
        }).toThrow(/Forbidden: fs is not available/);
    });

    test('Origin Request: Allowed to require fs', async () => {
        const hookPath = createHook('origin_fs.js', `
            exports.hookType = 'origin-request';
            const fs = require('fs');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        edgeRunner = new EdgeRunner(hookPath, { watch: false });
        expect(edgeRunner.modules['origin-request']).toBeDefined();
    });

    test('Generic Forbidden: Cannot require child_process in any hook', async () => {
        const hookPath = createHook('global_forbidden.js', `
            exports.hookType = 'origin-request';
            const cp = require('child_process');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        
        expect(() => {
            new EdgeRunner(hookPath, { watch: false });
        }).toThrow(/Forbidden: child_process is restricted/);
    });

    test('CloudFront Fidelity: Detects hookType correctly even with extra spacing', async () => {
        const hookPath = createHook('hook_detection.js', `
            exports.hookType   =   "viewer-response"   ;
            exports.handler = async (event) => {
                return event.response;
            };
        `);
        edgeRunner = new EdgeRunner(hookPath, { watch: false });
        expect(edgeRunner.modules['viewer-response']).toBeDefined();
    });

    test('Origin Request: Allowed to require @aws-sdk/client-s3', async () => {
        const hookPath = createHook('origin_s3.js', `
            exports.hookType = 'origin-request';
            const { S3Client } = require('@aws-sdk/client-s3');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        edgeRunner = new EdgeRunner(hookPath, { watch: false });
        expect(edgeRunner.modules['origin-request']).toBeDefined();
    });

    test('Viewer Request: Allowed to require @aws-sdk/util-utf8', async () => {
        const hookPath = createHook('viewer_util.js', `
            exports.hookType = 'viewer-request';
            const util = require('@aws-sdk/util-utf8');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        edgeRunner = new EdgeRunner(hookPath, { watch: false });
        expect(edgeRunner.modules['viewer-request']).toBeDefined();
    });

    test('Viewer Request: Forbidden to require @aws-sdk/client-s3', async () => {
        const hookPath = createHook('viewer_s3_forbidden.js', `
            exports.hookType = 'viewer-request';
            const { S3Client } = require('@aws-sdk/client-s3');
            exports.handler = async (event) => {
                return event.request;
            };
        `);
        
        expect(() => {
            new EdgeRunner(hookPath, { watch: false });
        }).toThrow(/Forbidden: @aws-sdk\/client-s3 is not available/);
    });
});
