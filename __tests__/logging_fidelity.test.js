const request = require('supertest');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const fs = require('fs');
const path = require('path');

describe('Logging Fidelity (AWS-style Formatting)', () => {
    const tmpDir = path.join(__dirname, 'tmp_logging_test');
    const logFile = path.join(tmpDir, 'lambda.log');
    const edgeDir = path.join(tmpDir, 'edge');
    const port = 3007;

    let server;
    let edgeRunner;

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.mkdirSync(edgeDir, { recursive: true });

        // Create a lambda that logs
        fs.writeFileSync(path.join(edgeDir, 'logger.js'), `
            exports.hookType = 'viewer-request';
            exports.handler = (event, context, callback) => {
                console.log('Hello from Lambda');
                console.error('An error occurred');
                callback(null, event.Records[0].cf.request);
            };
        `);
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        if (server) await server.closeGracefully();
        if (edgeRunner) edgeRunner.close();
    });

    test('Should format logs and write to file with correct metadata', async () => {
        edgeRunner = new EdgeRunner(edgeDir, { logPath: logFile, watch: false });
        server = startServer({ directory: tmpDir, port, edgeRunner, noRequestLogging: true });

        await request(server).get('/');

        expect(fs.existsSync(logFile)).toBe(true);
        const content = fs.readFileSync(logFile, 'utf8');

        // Verify format: ISO-TIMESTAMP  [REQ-ID] [HOOK-TYPE]  MESSAGE
        // Example: 2026-03-12T02:20:01.115Z  [REQ-ID] [viewer-request]  Hello from Lambda
        const lines = content.trim().split('\n');
        expect(lines).toHaveLength(2);

        lines.forEach(line => {
            // Timestamp (ISO-8601)
            expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
            // Request ID (8-char hex)
            expect(line).toMatch(/\[[0-9a-f]{8}\]/);
            // Hook Type
            expect(line).toMatch(/\[viewer-request\]/);
        });

        expect(content).toContain('Hello from Lambda');
        expect(content).toContain('An error occurred');
    });

    test('Should overwrite log file on startup', async () => {
        fs.writeFileSync(logFile, 'old logs');
        
        edgeRunner = new EdgeRunner(edgeDir, { logPath: logFile, watch: false });
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toBe('');
    });

    test('Should print to console if debug is enabled', async () => {
        const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
        const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});

        edgeRunner = new EdgeRunner(edgeDir, { debug: true, watch: false });
        server = startServer({ directory: tmpDir, port: port + 1, edgeRunner, noRequestLogging: true });

        await request(server).get('/');

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[viewer-request]  Hello from Lambda'));
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[viewer-request]  An error occurred'));

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });
});
