const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Read version from package.json
const pkg = require('../package.json');

async function build() {
    const dist = path.join(__dirname, '../dist');

    // 1. Clean dist folder
    if (fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true });
    }

    console.log('🚀 Building with esbuild (Strict CommonJS)...');

    // 2. Execute bundle
    await esbuild.build({
        entryPoints: [path.join(__dirname, '../bin/cli.js')],
        bundle: true,
        platform: 'node',
        format: 'cjs',         // Hard-enforces CommonJS (no 'import' statements)
        target: 'node20',      // Optimizes for your specific Node version
        minify: true,
        outfile: path.join(dist, 'cli.js'),
        banner: {
            js: '#!/usr/bin/env node', // Native injection prevents encoding errors
        },
        external: ['fsevents', '@aws-sdk/*'], // Exclude binaries and AWS SDK (provided by host runtime)
        define: {
            __PKG_VERSION__: JSON.stringify(pkg.version)  // e.g. "1.1.0"
        }
    });

    // 3. Ensure executable permissions for CLI use
    fs.chmodSync(path.join(dist, 'cli.js'), 0o755);

    console.log('✅ Build successful: dist/cli.js is ready.');
}

build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
