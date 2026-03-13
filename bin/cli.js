'use strict';

const { Command } = require('commander');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const { CFFRunner } = require('../src/CFFRunner.js');
const path = require('path');

const program = new Command();
const version = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

program
    .name('cloudfrontize')
    .description('Static server with CloudFront Fidelity: Environments & Variable Baking')
    .version(version)
    .argument('[directory]', 'directory to serve')
    .option('-p, --port <number>', 'port to listen on', '3000')
    .option('-l, --listen <uri>', 'listen URI', '3000')
    .option('-s, --single', 'SPA mode: rewrite all not-found to index.html')
    .option('-C, --cors', 'enable CORS')
    .option('-d, --debug', 'show negotiation logs')
    .option('-u, --no-compression', 'disable auto-compression for small files')
    .option('--no-etag', 'disable ETag')
    .option('--headers <path>', 'path to JSON file with default request headers')
    .option('-L, --no-request-logging', 'mute logs')
    .option('--log <path>', 'path to log file for Lambda@Edge console output (overwrites)')
    .option('-e, --edge <path>', 'path to a Lambda@Edge module or directory to simulate')
    .option('--cff <path>', 'path to a CloudFront Functions module or directory to simulate')
    .option('-E, --env <path>', 'path to environment file (Strict: Reserved AWS variables only)')
    .option('-b, --bake <path>', 'path to variables file for __VAR__ string replacement')
    .option('-o, --output <path>', 'output the baked .js file(s) for production deployment')
    .option('--strict', 'enforce strict CloudFront limits (40KB body, forbidden headers)')
    .option('-m, --mode <mode>', 'routing behavior: website (S3 Website Hosting) or rest (S3 REST/OAC, default)', 'rest')
    .action((directory, options) => {
        // Validation: Directory is mandatory unless we are just baking
        if (!directory && !options.output) {
            console.error('🛑 Error: A directory to serve must be provided (e.g., cloudfrontize ./www).');
            console.error('   Or use --output to bake Lambda@Edge or CFF files without starting the server.');
            process.exit(1);
        }

        const port = options.listen !== '3000' ? options.listen : options.port;
        const isJustBaking = options.output && !directory;

        let edgeRunner = null;
        let cffRunner = null;

        // Ensure we have a path if edge-related flags are used
        if (options.edge || options.bake || options.output || options.cff) {
            const edgePath = options.edge ? path.resolve(options.edge) : null;
            const cffPath = options.cff ? path.resolve(options.cff) : null;

            // Validate: Can't bake or output without a source file/directory (L@E or CFF)
            if (!edgePath && !cffPath && (options.bake || options.output)) {
                console.error('🛑 Error: --bake and --output require a source --edge or --cff file or directory.');
                process.exit(1);
            }

            if (edgePath) {
                edgeRunner = new EdgeRunner(edgePath, {
                    debug: options.debug,
                    logPath: options.log ? path.resolve(options.log) : null,
                    envPath: options.env ? path.resolve(options.env) : null,
                    bakePath: options.bake ? path.resolve(options.bake) : null,
                    outputPath: options.output ? path.resolve(options.output) : null
                });
            }

            if (cffPath) {
                // For CFF, always append a 'cff' subfolder to the output path
                const cffRawOutput = options.output ? path.resolve(options.output) : null;
                const cffTargetOutput = cffRawOutput ? path.join(cffRawOutput, 'cff') : null;

                cffRunner = new CFFRunner(cffPath, {
                    debug: options.debug,
                    strict: options.strict,
                    bakePath: options.bake ? path.resolve(options.bake) : null,
                    outputPath: cffTargetOutput
                });
            }

            if (isJustBaking) {
                console.log(`✅ Production-ready file(s) generated at: ${options.output}`);
                console.log(`ℹ️  Baking complete. No directory provided, so the server will not start.`);
                process.exit(0);
            }
        }

        // 1. Resolve the path to the headers file
        const headersPath = options.headers ? path.resolve(options.headers) : null;

        startServer({
            ...options,
            port: parseInt(port),
            directory: path.resolve(directory),
            headersPath, // Pass the path to follow the established loading pattern
            edgeRunner,
            cffRunner
        });
    });

program.parse(process.argv);
