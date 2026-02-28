'use strict';

const { Command } = require('commander');
const { startServer } = require('../src/index.js');
const { EdgeRunner } = require('../src/edgeRunner.js');
const path = require('path');
const fs = require('fs');

const program = new Command();

program
    .name('cloudfrontize')
    .description('Static server with CloudFront Fidelity: Environments & Variable Baking')
    .version('1.1.0')
    .argument('[directory]', 'directory to serve', '.')
    .option('-p, --port <number>', 'port to listen on', '3000')
    .option('-l, --listen <uri>', 'listen URI', '3000')
    .option('-s, --single', 'SPA mode: rewrite all not-found to index.html')
    .option('-C, --cors', 'enable CORS')
    .option('-d, --debug', 'show negotiation logs')
    .option('-u, --no-compression', 'disable auto-compression for small files')
    .option('--no-etag', 'disable ETag')
    .option('-L, --no-request-logging', 'mute logs')
    .option('-e, --edge <path>', 'path to a Lambda@Edge module or directory to simulate')
    .option('-E, --env <path>', 'path to environment file (Strict: Reserved AWS variables only)')
    .option('-b, --bake <path>', 'path to variables file for __VAR__ string replacement')
    .option('-o, --output <path>', 'output the baked .js file(s) for production deployment')
    .action((directory, options) => {
        const port = options.listen !== '3000' ? options.listen : options.port;

        let edgeRunner = null;

        // Ensure we have a path if edge-related flags are used
        if (options.edge || options.bake || options.output) {
            const edgePath = options.edge ? path.resolve(options.edge) : null;

            // Validate: Can't bake or output without a source file/directory
            if (!edgePath && (options.bake || options.output)) {
                console.error('🛑 Error: --bake and --output require a source --edge file or directory.');
                process.exit(1);
            }

            edgeRunner = new EdgeRunner(edgePath, {
                debug: options.debug,
                envPath: options.env ? path.resolve(options.env) : null,
                bakePath: options.bake ? path.resolve(options.bake) : null,
                outputPath: options.output ? path.resolve(options.output) : null
            });

            // If the user specified an output but didn't provide a directory to serve,
            // we assume they just wanted to run the build/bake step.
            const isJustBaking = options.output && process.argv.length <= 6 && !options.port;

            if (isJustBaking) {
                console.log(`✅ Production-ready file(s) generated at: ${options.output}`);
                process.exit(0);
            }
        }

        startServer({
            ...options,
            port: parseInt(port),
            directory: path.resolve(directory),
            edgeRunner
        });
    });

program.parse(process.argv);
