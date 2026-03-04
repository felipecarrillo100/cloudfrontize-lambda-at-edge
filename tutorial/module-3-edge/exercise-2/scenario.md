# Exercise 3.2: The Architect

## 🎭 The Scenario
You are performing a massive database migration. You want to show a friendly "Maintenance" page to all users without having to stop your servers or change DNS.

## 🎯 Your Goal
Intercept every single request and return a 503 status code with a custom HTML body.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Return a custom 503 response
    /*
    return {
        status: '503',
        statusDescription: 'Service Unavailable',
        body: '...'
    };
    */
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-2/index.js`.
2. Return a custom response object.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-2/index.js
   ```
4. Visit any URL on `http://localhost:3000`.
5. You should see your custom HTML page.

## 💡 Fidelity Tip
When you return a response from `viewer-request`, the request **never** reaches your origin. This is perfect for maintenance modes or custom error pages that need to be globally consistent.

## 🎓 Learning More
- **AWS Reference**: [Generating a Static Response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-generated-response-static)
- **Keywords**: `viewer-request static response`, `Edge Maintenance Page`, `Custom HTML from Lambda@Edge`.
