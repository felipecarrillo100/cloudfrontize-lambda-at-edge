# Exercise 4.1: The Baker

## 🎭 The Scenario
Official Lambda@Edge functions do not support environment variables. However, you need to point your logic to different API endpoints depending on where it’s deployed. 

## 🎯 Your Goal
Use CloudFrontize to "bake" a configuration variable into your code, creating a deployment-ready `.js` file.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    // TODO: Use the BAKED variable
    // const api = typeof API_ENDPOINT !== 'undefined' ? ...

    return event.Records[0].cf.request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-4-production/exercise-1/index.js`.
2. Look at how it handles the missing `API_ENDPOINT`.
3. Create a `.env.baked.variables` file in that directory:
   ```env
   API_ENDPOINT=https://api.production.com
   ```
4. Run the emulator pointing to the original hook:
   ```bash
   cloudfrontize www --edge ./tutorial/module-4-production/exercise-1/index.js --bake ./tutorial/module-4-production/exercise-1/.env.baked.variables --output ./dist/prod_lambda.js
   ```
5. Open the generated `dist/prod_lambda.js` file.
6. Observe how `API_ENDPOINT` has been injected as a top-level constant!

## 💡 Fidelity Tip
This pattern allows you to keep your source code clean while adhering to the AWS "No Env Vars" restriction. By baking values into a build artifact, you maintain security and flexibility.

## 🎓 Learning More
- **Concept Deep Dive**: [Why Environment Variables don't exist in Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge-env-vars.html)
- **Keywords**: `Lambda@Edge variables`, `Code Pre-processing`, `Edge Deployment Workflows`.
