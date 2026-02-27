# cloudfrontize-lambda-at-edge

> Simulate your Lambda@Edge functions locally on a CloudFront-like static server.

A CLI tool for local development and testing of AWS CloudFront deployments with **Lambda@Edge** support. Similar to [`serve`](https://www.npmjs.com/package/serve) but with an accurate simulation of CloudFront's compression behaviour and the ability to run and test your Lambda@Edge functions before deploying to production.

---

## Why?

CloudFront automatically compresses files **smaller than 10 MB** on-the-fly. For files **larger than 10 MB** (e.g. large bundled vendor assets), you need to serve a **pre-compressed** version via a Lambda@Edge function.

This tool lets you:
- Serve your static build locally with CloudFront-accurate behaviour.
- Load and run your own `Lambda@Edge` module for content negotiation.
- Test request rewriting logic before deploying to AWS.

---

## Install

```bash
npm install -g cloudfrontize-lambda-at-edge
```

Or run directly without installing:

```bash
npx cloudfrontize-lambda-at-edge ./dist
```

---

## Usage

```bash
cloudfrontize [directory] [options]
```

### Arguments

| Argument      | Description                          | Default |
|---------------|--------------------------------------|---------|
| `[directory]` | Directory to serve                   | `.`     |

### Options

| Flag                    | Description                                           | Default |
|-------------------------|-------------------------------------------------------|---------|
| `-p, --port <number>`   | Port to listen on                                     | `3000`  |
| `-l, --listen <uri>`    | Listen URI (overrides `--port`)                       | `3000`  |
| `-s, --single`          | SPA mode — rewrite all 404s to `index.html`           | off     |
| `-C, --cors`            | Enable `Access-Control-Allow-Origin: *`               | off     |
| `-d, --debug`           | Show content negotiation logs                         | off     |
| `-u, --no-compression`  | Disable automatic on-the-fly compression              | off     |
| `--no-etag`             | Disable ETag headers                                  | off     |
| `-L, --no-request-logging` | Mute startup logs                                 | off     |

### Examples

```bash
# Serve current directory on port 3000
cloudfrontize .

# Serve a specific build folder on port 5174 with debug logs
cloudfrontize ./dist -l 5174 -d

# SPA mode with CORS enabled
cloudfrontize ./dist -s -C
```

---

## Lambda@Edge Integration

Place your Lambda@Edge module at:

```
src/edge/contentNegotiation.js
```

Your module must export a standard Lambda@Edge handler:

```js
'use strict';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;

    // Example: rewrite JS/CSS requests to pre-compressed versions
    if (uri.match(/\.(js|css)$/)) {
        const ae = headers['accept-encoding'];
        const acceptEncoding = (ae && ae.length > 0) ? ae[0].value : '';

        if (acceptEncoding.includes('br')) {
            request.uri += '.br';
        } else if (acceptEncoding.includes('gzip')) {
            request.uri += '.gz';
        }
    }

    callback(null, request);
};
```

> **Tip:** Pre-compress your large assets at build time (e.g. `vendor-*.js`) and place the `.br` / `.gz` files alongside the originals. CloudFrontize will serve the pre-compressed version when available.

---

## How It Works

```
Browser Request
      │
      ▼
[Lambda@Edge Simulation]  ←──── src/edge/contentNegotiation.js
  Tries to rewrite URI to .br or .gz
      │
      ▼
[Existence Check]  (src/index.js)
  ├── Pre-compressed file EXISTS  → serve it, set Content-Encoding header ✅
  └── Pre-compressed file MISSING → fall back to original (no 404) ✅
      │
      ▼
[Compression Middleware]
  ├── File < 10 MB → compress on-the-fly (simulates CloudFront auto-compress) ✅
  └── File > 10 MB → pass through uncompressed ✅
```

---

## Pre-compressing Assets

Use a build script to generate `.br` and `.gz` versions of your large assets:

```bash
# Brotli
brotli --best ./dist/assets/vendor-*.js

# Gzip
gzip -k ./dist/assets/vendor-*.js
```

Place the generated `.br` / `.gz` files in the same directory as the originals.

---

## License

MIT © Felipe Carrillo
