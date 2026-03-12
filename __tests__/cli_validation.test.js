const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const cliPath = path.resolve(__dirname, '../bin/cli.js');

describe('CLI Argument Validation', () => {
    const tmpDir = path.join(__dirname, 'tmp_cli_test');
    const edgeFile = path.join(tmpDir, 'edge.js');
    const outputFile = path.join(tmpDir, 'output.js');

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir);
        fs.writeFileSync(edgeFile, "exports.hookType = 'viewer-request'; exports.handler = (e, c, cb) => cb(null, e.Records[0].cf.request);");
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should exit with error when no directory or --output is provided', (done) => {
        exec(`node ${cliPath}`, (error, stdout, stderr) => {
            expect(error).not.toBeNull();
            expect(error.code).toBe(1);
            expect(stderr).toContain('Error: A directory to serve must be provided');
            done();
        });
    });

    test('Should perform baking and exit when --output is provided without directory', (done) => {
        exec(`node ${cliPath} --output ${outputFile} --edge ${edgeFile}`, (error, stdout, stderr) => {
            expect(error).toBeNull();
            expect(stdout).toContain('Production-ready file(s) generated');
            expect(stdout).toContain('Baking complete. No directory provided, so the server will not start.');
            expect(fs.existsSync(outputFile)).toBe(true);
            done();
        });
    });

    test('Should fail if --bake/--output used without --edge source', (done) => {
        exec(`node ${cliPath} . --output ${outputFile}`, (error, stdout, stderr) => {
            expect(error).not.toBeNull();
            expect(error.code).toBe(1);
            expect(stderr).toContain('Error: --bake and --output require a source --edge or --cff file');
            done();
        });
    });
});
