# Module 3: Edge Computing

In this module, you'll learn how to "short-circuit" the request-response cycle. Instead of just modifying data, you'll be generating it directly from the Edge.

## Exercises

### 3.1 The Bouncer (Viewer Request)
**Problem**: You want to protect a specific folder (`/admin/`) with a password, but your origin doesn't support auth.
**Goal**: Implement a Basic Auth gatekeeper in `viewer-request` that returns a `401 Unauthorized` response.
[Go to Exercise 🛠️](./exercise-1/scenario.md)

### 3.2 The Architect (Viewer Request)
**Problem**: Your site is going down for maintenance.
**Goal**: Intercept all requests and return a custom, styled HTML maintenance page directly from the edge.
[Go to Exercise 🛠️](./exercise-2/scenario.md)

### 3.3 The Inspector (Viewer Request)
**Problem**: Malicious bots are sending huge bodies to your API.
**Goal**: Inspect the `body` of the request and reject it if it contains certain blacklisted keywords.
[Go to Exercise 🛠️](./exercise-3/scenario.md)

---
[⬅️ Back to Syllabus](../README.md)
