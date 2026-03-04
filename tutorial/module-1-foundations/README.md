# Module 1: Foundations

In this module, you'll learn the fundamental patterns of Lambda@Edge: manipulating headers and performing simple redirects. These are the most common tasks performed at the edge.

## Exercises

### 1.1 The Security Guard (Viewer Response)
**Problem**: Your origin server is old and doesn't support modern security headers.
**Goal**: Use a `viewer-response` hook to inject `Strict-Transport-Security` and `X-Content-Type-Options` into every response.
[Go to Exercise 🛠️](./exercise-1/scenario.md)

### 1.2 The Librarian (Viewer Request)
**Problem**: Users are sending query parameters in random order (e.g., `?b=2&a=1`), which causes cache misses for your CDN.
**Goal**: Normalize query strings by alphabetizing them before they reach the cache.
[Go to Exercise 🛠️](./exercise-2/scenario.md)

### 1.3 The Concierge (Viewer Request)
**Problem**: You have a mobile-optimized site at `/mobile/index.html`.
**Goal**: Detect mobile users using the `CloudFront-Is-Mobile-Viewer` header and redirect them seamlessly.
[Go to Exercise 🛠️](./exercise-3/scenario.md)

---
[⬅️ Back to Syllabus](../README.md)
