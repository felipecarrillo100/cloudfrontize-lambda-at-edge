# 🎓 CloudFrontize Academy: Lambda@Edge Masterclass

Welcome to the CloudFrontize Academy! This structured, hands-on tutorial is designed to take you from a **Lambda@Edge Newbie** to a **Production Pro** using the CloudFrontize emulator.

## 🗺️ The Path to Mastery

The tutorial is organized into four thematic modules. Each module contains real-world scenarios, architectural explanations, and hands-on exercises.

### [Module 1: Foundations (Newbie)](./module-1-foundations/README.md)
*Mastering the basics of headers and redirects.*
- **1.1 The Security Guard**: Injecting security headers.
- **1.2 The Librarian**: Normalizing query strings for caching.
- **1.3 The Concierge**: Simple device-based redirection.

### [Module 2: Origin Intelligence (Intermediate)](./module-2-origin/README.md)
*Dynamic routing and state management.*
- **2.1 The Scientist**: Cookie-based A/B testing.
- **2.2 The Diplomat**: Geo-routing (L10n).
- **2.3 The Cloaker**: Cleaning up sensitive origin headers.

### [Module 3: Edge Computing (Advanced)](./module-3-edge/README.md)
*Intercepting requests and generating responses.*
- **3.1 The Bouncer**: Edge-side Basic Authentication.
- **3.2 The Architect**: Dynamic maintenance page generation.
- **3.3 The Inspector**: Request body validation.

### [Module 4: Production Workflows (Pro)](./module-4-production/README.md)
*Baking code for the real world.*
- **4.1 The Baker**: Using `.env` variables and code baking.

### 📂 The `www` Directory
Most examples use the `www` folder as the static directory. This is the **"Paws" Dog Adoption** sample project provided with the CloudFrontize repository. 

> [!TIP]
> If you are running these tutorials from a local installation, we highly recommend **cloning the [CloudFrontize GitHub Repository](https://github.com/felipecarrillo100/cloudfrontize)** to get access to all samples, includes the `www` folder used in these exercises.

---

## 🚀 How to Complete an Exercise

1. Navigate to an exercise folder (e.g., `tutorial/module-1-foundations/exercise-1`).
2. Read the `scenario.md` to understand the goal.
3. Edit the `index.js` (look for `TODO` comments).
4. Start the emulator pointing to the static folder and hook file:
   ```bash
   cloudfrontize www --edge ./tutorial/module-1-foundations/exercise-1/index.js
   ```
5. Open `http://localhost:3000` and see your logic in action!

> [!TIP]
> Stuck? Check the [solutions/](./solutions/) directory for reference implementations of every exercise.
