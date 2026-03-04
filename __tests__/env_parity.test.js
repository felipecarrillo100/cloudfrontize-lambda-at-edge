'use strict';

const { EdgeRunner } = require('../src/edgeRunner');
const path = require('path');
const fs = require('fs');

describe('Env Var Parity: AWS Mock Environment', () => {
    const testDir = path.resolve(__dirname, '..', 'tmp_test', 'env_parity');

    beforeEach(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('Should provide default AWS environment variables', async () => {
        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.headers['x-aws-region'] = [{ key: 'X-AWS-Region', value: process.env.AWS_REGION }];
                req.headers['x-aws-env'] = [{ key: 'X-AWS-Env', value: process.env.AWS_EXECUTION_ENV }];
                return req;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'env.js'), code);
        const runner = new EdgeRunner(testDir, { watch: false });

        const result = await runner.runRequestHook({ url: '/' });
        expect(result['x-aws-region']).toBe('us-east-1');
        expect(result['x-aws-env']).toBe('AWS_Lambda_nodejs20.x');
    });

    test('Should allow overriding defaults via .env file', async () => {
        const envContent = 'AWS_REGION=eu-central-1\nAWS_ACCESS_KEY_ID=AKIA_MOCK';
        const envPath = path.join(testDir, '.env');
        fs.writeFileSync(envPath, envContent);

        const code = `
            exports.hookType = 'viewer-request';
            exports.handler = async (event) => {
                const req = event.Records[0].cf.request;
                req.headers['x-aws-region'] = [{ key: 'X-AWS-Region', value: process.env.AWS_REGION }];
                req.headers['x-aws-key'] = [{ key: 'X-AWS-Key', value: process.env.AWS_ACCESS_KEY_ID }];
                return req;
            };
        `;
        fs.writeFileSync(path.join(testDir, 'override.js'), code);

        const runner = new EdgeRunner(testDir, { envPath, watch: false });

        const result = await runner.runRequestHook({ url: '/' });
        expect(result['x-aws-region']).toBe('eu-central-1');
        expect(result['x-aws-key']).toBe('AKIA_MOCK');
    });

    test('Should still BLOCK non-whitelisted variables in .env', () => {
        const envPath = path.join(testDir, '.env_illegal');
        fs.writeFileSync(envPath, 'FORBIDDEN_VAR=danger');

        expect(() => {
            new EdgeRunner(testDir, { envPath, watch: false });
        }).toThrow(/Restricted Variable: "FORBIDDEN_VAR"/);
    });
});
