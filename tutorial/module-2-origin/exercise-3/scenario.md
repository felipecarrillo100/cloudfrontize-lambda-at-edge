# Exercise 2.3: The Cloaker

## 🎭 The Scenario
Your origin is running a very old version of PHP and Apache. Hackers can see this in the `Server: Apache/x.y.z` header and might try targeted exploits.

## 🎯 Your Goal
Strip the `Server` and `X-Powered-By` headers before they are cached by CloudFront or seen by the user.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'origin-response';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // TODO: Clean up headers
    // delete headers['some-header'];

    return response;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-3/index.js`.
2. Delete the offending headers.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-3/index.js
   ```
4. Since this is an `origin-response`, the emulator will provide a mock origin response for you.
5. Inspect the response in your browser/curl and ensure the headers are gone.

## 💡 Fidelity Tip
`origin-response` is the best place for this because it cleans the headers **before** they enter the CloudFront cache. If you used `viewer-response`, CloudFront would still be caching the "dirty" headers!

## 🎓 Learning More
- **AWS Reference**: [Modifying Response Headers in origin-response (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-modifying-response-headers-origin-response)
- **Keywords**: `origin-response`, `Response Header Stripping`, `Edge Security Hardening`.
