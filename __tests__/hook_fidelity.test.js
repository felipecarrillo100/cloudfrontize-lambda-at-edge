const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Edge Hook Fidelity (Single-Hook Enforcement)', () => {
    const tmpDir = path.resolve(__dirname, 'tmp_hook_fidelity');
    const fileA = path.join(tmpDir, 'a_viewer.js');
    const fileB = path.join(tmpDir, 'b_viewer.js');

    beforeAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });

        // Both files target 'viewer-request'
        const codeA = "exports.hookType = 'viewer-request'; exports.handler = (e, c, cb) => cb(null, e.Records[0].cf.request);";
        const codeB = "exports.hookType = 'viewer-request'; exports.handler = (e, c, cb) => cb(null, { status: '200', body: 'B' });";

        fs.writeFileSync(fileA, codeA);
        fs.writeFileSync(fileB, codeB);
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Should only load the first file for a specific hook type and warn on collision', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        
        // EdgeRunner uses lexicographical order for directory reading
        const runner = new EdgeRunner(tmpDir, { watch: false });

        // Verify only one module is loaded for viewer-request
        expect(runner.modules['viewer-request']).toHaveLength(1);
        expect(runner.modules['viewer-request'][0].file).toContain('a_viewer.js');

        // Verify warning was logged
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Multiple files found for "viewer-request"'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Keeping "a_viewer.js"'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ignoring "b_viewer.js"'));

        warnSpy.mockRestore();
    });
});
