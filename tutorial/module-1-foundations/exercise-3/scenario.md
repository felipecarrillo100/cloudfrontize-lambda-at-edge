# Exercise 1.3: The Concierge

## 🎭 The Scenario
You have a legacy frontend that looks terrible on phones. You've built a shiny new mobile site at `m.example.com`. You want to redirect mobile users before they even hit your origin.

## 🎯 Your Goal
Return a `302 Found` response for any mobile users, pointing them to the mobile domain while preserving their path.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Detect mobile and redirect
    // const isMobile = headers['cloudfront-is-mobile-viewer'] && ...
    // Redirect them to your mobile website, i.e 'https://m.example.com/'
    // Pass curernt path (request.uri) and query paramters (request.querystring)

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-3/index.js`.
2. Check for the `cloudfront-is-mobile-viewer` header.
3. If true, return a response object with `status: '302'`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-3/index.js
   ```
5. Use a tool like Postman or `curl` to send a request with the header `CloudFront-Is-Mobile-Viewer: true`.
```shell
curl -v -H "CloudFront-Is-Mobile-Viewer: true" http://localhost:3000/
```
> **Success Criteria:** Your terminal should show `HTTP/1.1 302 Found` and the `location` header you defined.



---

### 💡 Pro Tip: Persistent Header Simulation

If you want to test in a browser without browser extensions, you can tell the `cloudfrontize` emulator to **always** inject specific headers by creating a `headers.json` file with the `--headers` option:

Create `header.json`
```json
{ 
  "CloudFront-Is-Mobile-Viewer": "true"
}
```
And start the emulator as:
```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-3/index.js --headers ./headers.json
```
Now, any standard browser refresh at http://localhost:3000 will behave as a mobile device and you will be redirected to the page you set `https://m.example.com/` 

## 💡 Fidelity Tip
In AWS, to use device-detection headers, you must first enable them in your **CloudFront Origin Request Policy**. The emulator simulates these headers being present by default to make development easier.

## 🎓 Learning More
- **AWS Reference**: [Redirecting Mobile Users (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-redirecting-mobile-users)
- **Keywords**: `viewer-request redirect`, `CloudFront device detection headers`, `302 Found response`.
