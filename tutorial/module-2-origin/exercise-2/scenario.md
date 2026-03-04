# Exercise 2.2: The Diplomat

## 🎭 The Scenario
Your marketing team wants a "localized" experience. Instead of one global `index.html`, they want users to automatically see content for their country (e.g., `/GB/index.html` for UK users).

## 🎯 Your Goal
Prepend the country code from the `CloudFront-Viewer-Country` header to the URI.

## 🛠️ Instructions
1. Open `tutorial/module-2-origin/exercise-2/index.js`.
2. Grab the value from `headers['cloudfront-viewer-country']`.
3. Update `request.uri`.
4. Run the emulator:
   ```bash
   cloudfrontize www --edge ./tutorial/module-2-origin/exercise-2/index.js
   ```
5. Test with a custom header: `curl -H "CloudFront-Viewer-Country: DE" http://localhost:3000/home`.
6. Verify the requested path becomes `/DE/home`.

## 💡 Fidelity Tip
When using Geo-headers, remember to include them in the **CloudFront Cache Key** (via Cache Policy), otherwise, the first user's country-specific content might be served to everyone!

## 🎓 Learning More
- **AWS Reference**: [Localized Content (AWS Docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html#lambda-examples-localized-content)
- **Keywords**: `CloudFront-Viewer-Country`, `origin-request localization`, `Multi-region content strategies`.
