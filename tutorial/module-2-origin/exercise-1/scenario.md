# Exercise 2.1: The Scientist

## 🎭 The Scenario
You are running an A/B test. Users in the experiment group have a cookie `experiment=true`. You want them to see the content in the `/experimental/` folder, but they should keep browsing the same URLs (no external redirect).

## 🎯 Your Goal
Internally rewrite the `request.uri` if the experiment cookie is present.

## 📝 Starter Code Template
```javascript
'use strict';

exports.hookType = 'origin-request';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // TODO: Check for experiment cookie and rewrite URI
    // if (headers.cookie) { ... }

    return request;
};
```

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-1/index.js`.
2. Inspect `request.headers.cookie`.
3. If `experiment=true` is found, prefix the URI with `/experimental`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-1/index.js
   ```
5. Simulate a request with the cookie: `curl -H "Cookie: experiment=true" http://localhost:3000/test.html`.
6. Verify the console output shows the rewritten path.

## 💡 Fidelity Tip
`origin-request` happens **after** the cache check if there is a miss. By rewriting the URI here, you are telling CloudFront to fetch a different object from the origin and cache it separately for that specific path!

## 🎓 Learning More
- **AWS Reference**: [A/B Testing with Lambda@Edge (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-a-b-testing)
- **Keywords**: `origin-request URI rewrite`, `Edge side A/B testing`, `CloudFront Cookie Persistence`.
