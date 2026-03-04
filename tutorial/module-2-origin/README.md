# Module 2: Origin Intelligence

In this module, you'll learn how to make "smart" routing decisions before reaching the origin and how to sanitize responses coming *from* the origin.

## Exercises

### 2.1 The Scientist (Origin Request)
**Problem**: You want to test a new homepage layout (`/v2/index.html`) but only for 10% of users.
**Goal**: Use a `cookie` check in an `origin-request` hook to rewrite the URI internally.
[Go to Exercise 🛠️](./exercise-1/scenario.md)

### 2.2 The Diplomat (Origin Request)
**Problem**: Different countries have different legal requirements for your site.
**Goal**: Use the `CloudFront-Viewer-Country` header to append a country code to the URI (e.g., `/index.html` -> `/US/index.html`).
[Go to Exercise 🛠️](./exercise-2/scenario.md)

### 2.3 The Cloaker (Origin Response)
**Problem**: Your origin server leaks its identity in the `Server` and `X-Powered-By` headers, which is a security risk.
**Goal**: Strip these "revealing" headers in the `origin-response` hook.
[Go to Exercise 🛠️](./exercise-3/scenario.md)

---
[⬅️ Back to Syllabus](../README.md)
