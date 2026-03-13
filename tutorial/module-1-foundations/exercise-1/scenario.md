# Exercise 1.1: The Security Guard

## 🎭 The Scenario
Your company’s security audit just failed. Your backend servers are managed by another team and they refuse to add HSTS headers. You need to enforce security at the Edge.

## 🎯 Your Goal
Inject the following security headers into every response leaving CloudFront:
1. `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
2. `X-Content-Type-Options`: `nosniff`

You can setup the headers programmatically inside a `viewer-response` Lambda@Edge function.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Implement your magic here!
    // headers['header-name'] = [{ key: 'Header-Name', value: 'value' }];

    return response;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-1/index.js`.
2. Implement the missing headers in the `TODO` sections.
3. Run the emulator (serving the `www` sample folder and attaching your hook):
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-1/index.js
   ```
   *Note: `www` is the argument telling the emulator which folder to serve as your website.*


4. Open `http://localhost:3000` in your browser.
5. Inspect the Network Tab (F12) and verify the headers are present in the response.

## 💡 Fidelity Tip
In AWS, `viewer-response` cannot modify certain headers like `Content-Length` or `Server`. Our emulator will warn you if you try to touch "forbidden" headers!

## 🎓 Learning More
- **AWS Reference**: [Adding Response Headers (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-adding-response-headers)
- **Keywords**: `viewer-response`, `HSTS`, `Content-Security-Policy`, `Lambda@Edge Header Restrictions`.
