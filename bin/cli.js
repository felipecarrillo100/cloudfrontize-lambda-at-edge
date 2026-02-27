#!/usr/bin/env node
const { Command } = require('commander');
const { startServer } = require('../src/index.js'); // Standard require
const path = require('path');

const program = new Command();

program
    .name('cloudfrontize')
    .description('Static server with CloudFront Content-Negotiation simulation')
    .version('1.0.0')
    .argument('[directory]', 'directory to serve', '.')
    .option('-p, --port <number>', 'port to listen on', '3000')
    .option('-l, --listen <uri>', 'listen URI', '3000')
    .option('-s, --single', 'SPA mode: rewrite all not-found to index.html')
    .option('-C, --cors', 'enable CORS')
    .option('-d, --debug', 'show negotiation logs')
    .option('-u, --no-compression', 'disable auto-compression for small files')
    .option('--no-etag', 'disable ETag')
    .option('-L, --no-request-logging', 'mute logs')
    .action((directory, options) => {
        const port = options.listen !== '3000' ? options.listen : options.port;
        startServer({
            ...options,
            port: parseInt(port),
            directory: path.resolve(directory)
        });
    });

program.parse(process.argv);
