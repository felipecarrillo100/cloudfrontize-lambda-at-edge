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
5. Use a tool like Postman or `curl` (or a mobile emulator in your browser) to send a request with the header `CloudFront-Is-Mobile-Viewer: true`.

## 💡 Fidelity Tip
In AWS, to use device-detection headers, you must first enable them in your **CloudFront Origin Request Policy**. The emulator simulates these headers being present by default to make development easier.

## 🎓 Learning More
- **AWS Reference**: [Redirecting Mobile Users (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-redirecting-mobile-users)
- **Keywords**: `viewer-request redirect`, `CloudFront device detection headers`, `302 Found response`.
