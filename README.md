# cloudfrontize-lambda-at-edge

> Simulate your Lambda@Edge functions locally on a CloudFront-like static server.

A CLI tool for local development and testing of AWS CloudFront deployments with **full Lambda@Edge** support. Similar to [`serve`](https://www.npmjs.com/package/serve) but with an accurate simulation of CloudFront's compression behaviour and the ability to dynamically hot-reload and test your Lambda@Edge functions before deploying to production.

---

## Why?

The CloudFront/Lambda@Edge development loop is notoriously slow. You write code, package it, deploy it, and wait minutes for it to propagate just to test a simple header injection or URI rewrite.

With **CloudFrontize**, you can:
- Serve your static build locally with CloudFront-accurate behaviour (including the 10MB auto-compression limit).
- Dynamically load your Lambda@Edge modules at runtime (supports single files or entire directories!).
- **Hot-reload** your Lambda functions when you save code changes — zero restart required.
- Test all **4 CloudFront trigger points**: `viewer-request`, `origin-request`, `origin-response`, and `viewer-response`.

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

### Options

| Flag                    | Description                                           | Default |
|-------------------------|-------------------------------------------------------|---------|
| `-e, --edge <path>`     | Path to a Lambda@Edge module (or folder of modules)  | null    |
| `-p, --port <number>`   | Port to listen on                                     | `3000`  |
| `-l, --listen <uri>`    | Listen URI (overrides `--port`)                       | `3000`  |
| `-s, --single`          | SPA mode — rewrite all 404s to `index.html`           | off     |
| `-C, --cors`            | Enable `Access-Control-Allow-Origin: *`               | off     |
| `-d, --debug`           | Show Lambda execution logs and rewrites               | off     |
| `-u, --no-compression`  | Disable automatic on-the-fly compression              | off     |
| `--no-etag`             | Disable ETag headers                                  | off     |
| `-L, --no-request-logging` | Mute startup logs                                 | off     |

### Examples

```bash
# Serve static files as a standard CloudFront distribution
cloudfrontize ./dist

# Test an origin-request Lambda to rewrite large files to pre-compressed versions
cloudfrontize ./dist --edge ./src/lambdas/rewriter.js -d

# Test multiple Lambda functions across different lifecycle stages at once!
cloudfrontize ./dist --edge ./src/edge-functions/
```

---

## Lambda@Edge Integration

Your module(s) must export:
1. A standard Lambda@Edge `handler` function.
2. An optional `hookType` string declaring when it should fire.

> **💡 Directory Support & Multi-Hook Testing**
> You can pass a **directory** to the `--edge` flag (e.g. `--edge ./src/edge-lambdas/`). CloudFrontize will scan the directory and automatically inject every valid Lambda into the lifecycle!
> - It silently ignores files without the required `hookType` and `handler` exports (like helpers/utils).
> - It will fail-fast if it detects multiple files trying to bind to the *same* `hookType` (AWS CloudFront only supports one per trigger).

### Exported Hook Types
- `'viewer-request'`: Intercept before cache. Often used for redirects or auth.
- `'origin-request'` *(default)*: Intercept before forwarding to the origin. Often used for URI rewrites.
- `'origin-response'`: Intercept after origin responds. Often used to inject Cache-Control headers.
- `'viewer-response'`: Intercept before sending to the viewer. Often used to inject security headers.

### Examples

#### 1. Origin Request (Bypass 10MB Limit via Pre-compressed Assets)

```js
exports.hookType = 'origin-request';
exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const ae = request.headers['accept-encoding']?.[0]?.value || '';

    // If JS/CSS, try to serve a pre-compressed `.br` version
    if (request.uri.match(/\.(js|css)$/)) {
        if (ae.includes('br')) request.uri += '.br';
        else if (ae.includes('gzip')) request.uri += '.gz';
    }
    callback(null, request);
};
```
*(CloudFrontize will automatically fall back to the original file if the `.br`/`.gz` files don't exist locally!)*

#### 2. Viewer Response (Security Headers)

```js
exports.hookType = 'viewer-response';
exports.handler = (event, context, callback) => {
    const response = event.Records[0].cf.response;
    response.headers['strict-transport-security'] = [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }];
    response.headers['x-frame-options'] = [{ key: 'X-Frame-Options', value: 'DENY' }];
    callback(null, response);
};
```

*(See `src/edge/examples/` in the repository for full examples of all 4 hook types).*

---

## Hot Reload Environment

CloudFrontize watches your loaded `--edge` module. When you save changes to your Lambda file, it instantly reloads the module memory. You can tweak your Lambda logic and just refresh the browser — no server restarts required!

## License

MIT © Felipe Carrillo
