const ncc = require('@vercel/ncc');
const fs = require('fs');
const path = require('path');

async function build() {
    const dist = path.join(__dirname, '../dist');

    // 1. Clean dist folder (Cross-platform native Node)
    if (fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true });
    }

    console.log('🚀 Compiling with ncc...');

    // 2. Run ncc
    const { code, assets } = await ncc(path.join(__dirname, '../bin/cli.js'), {
        minify: true,
        externals: ['serve-handler']
    });

    // 3. Write output to dist/cli.js directly
    if (!fs.existsSync(dist)) fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'cli.js'), code, { mode: 0o755 });

    console.log('✅ Build complete: dist/cli.js');
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
