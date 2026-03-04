# Exercise 3.3: The Inspector

## 🎭 The Scenario
Your API is being targeted by a specific bot that always sends "SQL-INJECTION" in the POST body. You want to block these requests at the edge to save origin resources.

## 🎯 Your Goal
Inspect the request body and return a `403 Forbidden` if malicious content is detected.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;

    // TODO: Inspect body
    // if (request.body && request.body.data) { ... }

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-3-edge/exercise-3/index.js`.
2. Decode the `request.body.data` from base64.
3. Check for SQL keywords.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-3-edge/exercise-3/index.js
   ```
5. Send a POST request with the malicious string:
   ```bash
   curl -X POST -d "param=SQL-INJECTION" http://localhost:3000/api
   ```

## 💡 Fidelity Tip
In AWS, to access the request body, you must check the **Include Body** option in the Lambda association. In the emulator, bodies are included automatically if they are small enough (< 40KB)!

## 🎓 Learning More
- **AWS Reference**: [Accessing the Request Body (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-accessing-request-body)
- **Keywords**: `viewer-request body access`, `Request Body Fidelity`, `Edge Payload Inspection`.
