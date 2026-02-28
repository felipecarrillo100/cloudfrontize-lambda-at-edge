# cloudfrontize-lambda-at-edge
[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)

### 📣 Stop bowing to the deployment bar! 

**Rule the Edge** and become the Hero of the Cloud. **Escape the "Deploy-and-Pray" cycle.** We’ve all been there: you tweak one security header, hit "Deploy," and... **you wait.** For 15 agonizing minutes, you watch a spinning "In Progress" status as AWS propagates your code globally. If there’s a tiny typo? You won't know until you hit a **502 Bad Gateway** and go hunting through CloudWatch logs buried in a random region.

It’s a workflow that kills momentum and turns "quick fixes" into afternoon-long ordeals.

### 👑 Enter CloudFrontize

The ultimate developer productivity tool for AWS CloudFront and Lambda@Edge. It transforms your local static server into a **high-fidelity AWS Edge Location simulation.**

* **Kill the Lag:** Test in milliseconds, not minutes.
* **Catch the 502s Locally:** Validate headers and URI rewrites before they ever touch an AWS environment.
* **Stay in the Flow:** Stop wasting hours in the "Deploy → Wait → Check Logs → Fail" loop.

**Start shipping rock-solid Edge logic with total confidence.**

---

## ⚡ Why Developers & SysAdmins Need This

The CloudFront/Lambda@Edge development loop is notoriously painful. Propagation takes minutes, debugging requires digging through CloudWatch, and a single header typo can bring down your entire production distribution with a **502 Bad Gateway**.

**CloudFrontize** eliminates the wait and the risk:

* **Zero-Config Integration:** If you know how to use Vercel's [serve](https://www.google.com/search?q=%5Bhttps://www.npmjs.com/package/serve%5D(https://www.npmjs.com/package/serve)) package, you already know how to use `cloudfrontize`.
* **Real-Time Hot Reloading:** Tweak your URI rewrites or security headers and see the results instantly on browser refresh. No packaging, no uploading, no waiting for the "In Progress" spinner.
* **Debug directly to the console:** Stop hunting for logs in hidden CloudWatch streams across random regions. See your console.log outputs and execution errors live **in your terminal**. 
* **Production Fidelity:** Emulates in detail CloudFront-specific features & quirks, like the **10MB auto-compression limit**, header blacklisting, and URI normalization.
* **The "Safety Net":** Catch forbidden header mutations or invalid response structures locally before they ever reach your AWS account.


---

## 📦 Install & Go
Get up and running in seconds. No complex AWS IAM roles, no stack traces—just your code, running locally.

### Install it **Globally:**

```bash
npm install -g cloudfrontize-lambda-at-edge
```
Once installed, you can rule the Edge from any directory by simply typing `cloudfrontize`.

Point it at your static files  folder (`./www`, `./dist` or `./public`) and point to your Lambda@Edge `.js` file. CloudFrontize handles the rest.

```bash
cloudfrontize ./folder --edge ./lambda-at-age-logic.js
```

### Or **On-the-fly:**
Noting to install
```bash
npx cloudfrontize-lambda-at-edge ./folder --edge ./lambda-at-age-logic.js
```

---

## 🛠️ CLI Options & Configuration

`cloudfrontize` is designed to be a drop-in replacement for `serve`, but with "Edge Superpowers."

| Flag | Description                                                        | Default |
| --- |--------------------------------------------------------------------| --- |
| **`-e, --edge <path>`** | Path to a Lambda@Edge module(s) (a js file or a folder of modules) | `null` |
| **`-p, --port <number>`** | Port to listen on                                                  | `3000` |
| **`-l, --listen <uri>`** | Listen URI (overrides `--port`)                                    | `3000` |
| **`-s, --single`** | SPA mode — rewrite all 404s to `index.html`                        | `off` |
| **`-C, --cors`** | Enable `Access-Control-Allow-Origin: *`                            | `off` |
| **`-d, --debug`** | Show Lambda execution logs and URI rewrites                        | `off` |
| **`-u, --no-compression`** | Disable automatic on-the-fly compression                           | `off` |
| **`--no-etag`** | Disable ETag headers                                               | `off` |
| **`-L, --no-request-logging`** | Mute startup logs                                                  | `off` |

---

## 🚀 Lambda@Edge Integration

Since there is no AWS CloudFront Console to configure your triggers locally, **it is mandatory to include `exports.hookType` in your JavaScript file.** If this line is missing, CloudFrontize will not know when to fire your function and will ignore the file.

### Exported Hook Types
* `'origin-request'`: Intercept **before** forwarding to the origin. Often used for URI rewrites.
* `'viewer-request'`: Intercept **before** cache. Often used for redirects or authentication.
* `'origin-response'`: Intercept **after** the origin responds. Often used to inject `Cache-Control` headers.
* `'viewer-response'`: Intercept **before** sending to the viewer. Often used to inject security headers.

---

## 🐕 Featured Example
### The "Paws & Pixels" Secure Gallery

We’ve bundled a complete, interactive sample to show you the power of **CloudFrontize**. It protects a premium dog photography gallery using a `viewer-request` authentication gate.

### Launch the Secure Demo
Clone the GitHub repo 
```shell
git clone https://github.com/felipecarrillo100/cloudfrontize-lambda-at-edge.git
```
Then run 
```bash
cloudfrontize ./www -e ./samples/medium/lambda-edge-authorization.js -d -C
```
* The `www` folder contains the sample files (html, js, css, etc.)
* The `lambda-edge-authorization.js` contains the lambda@edge logic
* The `-d` option enables debug messages while `-C` enables CORS
* Default port is 3000, you can now open your browser at http://localhost:3000/

### The Sample Logic (`lambda-edge-authorization.js`)

```javascript
'use strict';

/**
 * Lambda@Edge Example: Basic Authentication (viewer-request)
 */

// MANDATORY: Tells CloudFrontize which trigger point to simulate
exports.hookType = 'viewer-request';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // Credentials for demo purposes
    const user = "admin";
    const password = "pass";

    const authString = "Basic " + Buffer.from(user + ":" + password).toString("base64");

    if (
        typeof headers.authorization === "undefined" ||
        headers.authorization[0].value !== authString
    ) {
        const response = {
            status: "401",
            statusDescription: "Unauthorized",
            body: "Unauthorized",
            headers: {
                "www-authenticate": [{
                    key: "WWW-Authenticate",
                    value: 'Basic realm="Protected Area"'
                }],
            },
        };

        callback(null, response);
        return;
    }

    callback(null, request);
};
```

---

### 🛡️ Engineered for Fidelity 

Don't just simulate the Edge—**master it.** CloudFrontize is built to mirror the high-stakes environment of a live AWS PoP (Point of Presence).

* **⚡ Native Async/Await Support:** Whether your middleware is a simple redirect or a complex, asynchronous database lookup, CloudFrontize handles `async` handlers and Promises with the same grace as the live Lambda@Edge runtime.
* **🧩 Multi-Hook Testing:** Pass a directory to `--edge` and CloudFrontize will automatically mount every valid Lambda it finds. Orchestrate your **Viewer Request**, **Origin Request**, and **Response** hooks in one unified local environment.
* **🚫 Strict Header Validation:** Identify "Read-only" or "Forbidden" headers in real-time. We flag the illegal mutations that trigger 502 errors *before* you even think about deploying.
* **🎭 Mocked Context & Events:** We provide a high-fidelity `event` and `context` object, ensuring your logging, metrics, and custom error-handling tools work exactly as they would in production.

---

## License

MIT © Felipe Carrillo


---
# Donations & Sponsoring
[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" name="buy-me-a-coffee" alt="Buy Me A Coffee" width="180">](https://buymeacoffee.com/felipecarrillo100)

Creating and maintaining open-source libraries is a passion of mine. If you find this `cloudfrontize` useful and it saves you time, please consider supporting its development. Your contributions help keep the project active and motivated!

Every bit of support—whether it's sponsoring on GitHub, a coffee, a star, or a shout-out, is deeply appreciated. Thank you for being part of the community!


