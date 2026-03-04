# Exercise 3.1: The Bouncer

## 🎭 The Scenario
Your `/admin/` dashboard is currently public. You need to add a quick layer of security using Basic Auth, but you don't want to modify your backend code.

## 🎯 Your Goal
Return a `401 Unauthorized` response directly from the Edge if the `Authorization` header is missing or incorrect.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Implement Basic Auth check
    // const auth = headers.authorization ? ...

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-1/index.js`.
2. Implement the `Authorization` check.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-1/index.js
   ```
4. Visit `http://localhost:3000/admin/`.
5. Your browser should show a login prompt. Use `admin` / `password`.
6. Verify you only see the "Unauthorized" message if you cancel the login.

## 💡 Fidelity Tip
Lambda@Edge functions have strict limits on response generation. For example, the `body` cannot exceed 1MB. Our emulator enforces these limits in `--strict` mode to prepare you for production!

## 🎓 Learning More
- **AWS Reference**: [Lambda@Edge General Use Cases (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-general-use-cases)
- **Keywords**: `viewer-request authentication`, `401 Unauthorized Edge`, `Lambda@Edge short-circuiting`.
