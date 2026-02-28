# Contributing to cloudfrontize-lambda-at-edge
[![Sponsor](https://img.shields.io/badge/Sponsor-❤️-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/felipecarrillo100)

First off, thank you for considering contributing to **CloudFrontize**! It’s people like you who make the Edge development experience less painful for everyone.

Whether you are fixing a bug, improving the CloudFront simulation fidelity, or adding a new "Paws & Pixels" style sample, we welcome your help.

---

## 🛠️ Local Development Setup

To get started with the codebase:

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
```bash
git clone https://github.com/your-username/cloudfrontize-lambda-at-edge.git
cd cloudfrontize-lambda-at-edge

```


3. **Install dependencies**:
```bash
npm install

```


4. **Link the CLI** for local testing:
```bash
npm link

```


Now you can run `cloudfrontize` globally, and it will use your local modified code.

---

## 🧪 Testing Your Changes

We aim for high fidelity with AWS behavior. If you add a feature (like a new header restriction), please include a test case.

* **Run existing tests**: `npm test`
* **Manual Verification**: Use the `./samples` directory to verify that your changes don't break the Lambda@Edge execution flow.

---

## 🐕 Adding New Samples

The best way to help other developers is by providing "Ready-to-Run" samples. If you have a clever Lambda@Edge trick (e.g., A/B testing, Image resizing logic, or Security headers), please add it!

1. Create a new folder in `/samples`.
2. Include a `README.md` explaining the "Why" and the "How."
3. Ensure your script includes the mandatory `exports.hookType`.

---

## 📝 Pull Request Guidelines

* **Branching**: Create a feature branch (e.g., `feat/add-brotli-support` or `fix/header-case-sensitivity`).
* **Commits**: Use descriptive commit messages.
* **Documentation**: If you add a new CLI flag, please update the main `README.md` and the `Options` table.
* **Be Kind**: We are a community of developers helping each other avoid 502 errors!

---

## 🐛 Found a Bug?

If the simulation doesn't match actual AWS CloudFront behavior:

1. Open an **Issue**.
2. Provide a small snippet of the Lambda code that is behaving differently.
3. Describe the expected AWS behavior vs. what CloudFrontize did.

---

## License

By contributing, you agree that your contributions will be licensed under its **MIT License**.

**Happy Hacking at the Edge!**

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" name="buy-me-a-coffee" alt="Buy Me A Coffee" width="180">](https://buymeacoffee.com/felipecarrillo100)
