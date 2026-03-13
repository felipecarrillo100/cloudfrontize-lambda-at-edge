# Exercise 1.2: The Librarian

## 🎭 The Scenario
Your CloudFront cache hit ratio is terrible. You realized that `?id=123&ref=google` and `?ref=google&id=123` are being treated as two different objects by the cache, even though they return the same content.

## 🎯 Your Goal
Rewrite the incoming request's query string so that parameters are always sorted alphabetically.

## � Starter Code Template
```javascript
'use strict';

exports.hookType = 'viewer-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const querystring = request.querystring;

    if (!querystring) return request;

    // TODO: Normalize the querystring
    // const params = new URLSearchParams(querystring);
    // ...

    return request;
};
```
*HINT: `URLSearchParams` Already has a alphabetical sort method which simplifies the task.*

## �🛠️ Instructions
1. Open `tutorial/module-1-foundations/exercise-2/index.js`.
2. Use `URLSearchParams` to sort the keys and update `request.querystring`.
3. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-2/index.js --debug
   ```
*NOTE: `--debug` flag allows you to observe the URI rewrites in real-time to verify your logic.*

4. Test with `http://localhost:3000/?z=last&a=first`.
5. Check the emulator console to see the normalized URL.

## 💡 Fidelity Tip
Lambda@Edge `viewer-request` functions run **before** the CloudFront cache check. By normalizing here, you ensure that different permutations of the same query string hit the same cache entry!

## 🎓 Learning More
- **AWS Reference**: [Query String Normalization (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-query-string-normalization)
- **Keywords**: `Cache Hit Ratio`, `Deterministic Query Strings`, `viewer-request URL rewriting`.
