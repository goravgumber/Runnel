# Contributing to Runnel

Thank you for your interest in contributing to **Runnel — Recovery Inbox for Asynchronous Work**.

Runnel is designed to give engineering teams high-confidence observability, safe retry lifecycles, and resilient recovery for background work. To maintain production stability, please follow these guidelines.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and professional environment for everyone. Please be respectful, constructive, and collaborative in all issues and pull requests.

---

## 2. Development Setup

### Prerequisites
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** and **Docker Compose** (or local instances of MongoDB 6.0 and Redis 7.0)

### Local Development Quickstart
1. Clone the repository:
   ```bash
   git clone https://github.com/goravgumber/Runnel.git
   cd Runnel
   ```
2. Copy environment templates:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```
3. Start backing services via Docker:
   ```bash
   docker compose up -d mongodb redis
   ```
4. Install backend dependencies and start API server:
   ```bash
   cd backend
   npm ci
   npm run dev
   ```
5. In another terminal, install frontend dependencies and start Vite dev server:
   ```bash
   cd frontend
   npm ci
   npm run dev
   ```
6. Access the application at `http://localhost:5173`. For full setup details, see [docs/development.md](docs/development.md).

---

## 3. Testing & Verification

Every pull request must pass the automated test suites, linting rules, and build validation before merging.

### Running Backend Tests
The backend test suite runs natively with Node.js test runner (`node --test`) and does not require an external testing framework:
```bash
cd backend
npm test
```
To run specific test suites:
- Authentication & Sessions: `npm run test:auth`
- Execution & Recovery Engine: `npm run test:executions`
- Release Gate Verification: `npm run test:gate`

### Running Frontend Checks
```bash
cd frontend
npm run lint
npm run build
```

### Validating Container Configurations
```bash
JWT_SECRET="test_secret_key_minimum_32_characters" docker compose config --quiet
JWT_SECRET="test_secret_key_minimum_32_characters" FRONTEND_URL="https://example.com" docker compose -f docker-compose.prod.yml config --quiet
```

---

## 4. Architectural Rules & Standards

When writing code for Runnel, adhere strictly to these principles:

1. **Zero Mock Data in Production:** All dashboard metrics, execution statuses, attempt counts, and timeline items must be backed by live database records and WebSocket events.
2. **Design System Consistency:** Follow the Stitch design system tokens:
   - Ivory Canvas: `#FBF9F3`
   - Dark Moss / Forest Green: `#1B4332`
   - Amber Attention: `#B6731B`
   - Crimson / Terracotta Alert: `#B63B32`
   - Charcoal Neutral: `#1C1917`
3. **Idempotency & Isolation:** Every execution modification must respect user boundaries (`userId`) and state pre-conditions. Never allow cross-user access or non-atomic state mutations.
4. **Outbound Request Hardening:** Any changes to the webhook dispatcher or worker handlers must strictly respect SSRF destination policies (`validateDestination`), DNS pinning, redirect limits, and response byte bounding.
5. **No Synthetic Production Handlers:** Demo handlers (`echo`, `fail`) are strictly for local testing and must remain disabled in production (`ENABLE_DEMO_HANDLERS=false`).

---

## 5. Branching Strategy & Pull Request Process

Runnel utilizes an adapted Git-Flow model with a stable release branch (`main`), shared integration branch (`develop`), and short-lived supporting branches (`feature/*`, `fix/*`, `hotfix/*`, `release/*`).

For the comprehensive guide, branching diagrams, release steps, and branch protection recommendations, see **[docs/contributing.md](docs/contributing.md)**.

### Quick Workflow Summary:
1. **Branch from `develop`:**
   ```bash
   git switch develop
   git pull origin develop
   git switch -c feature/your-feature-name
   ```
2. **Implement & Test:** Make focused changes with structured commit messages (`feat:`, `fix:`, etc.).
3. **Verify Locally:** Ensure all checks pass:
   ```bash
   cd backend && npm run check && npm test
   cd ../frontend && npm run lint && npm run build
   ```
4. **Publish & Open PR:**
   ```bash
   git push -u origin feature/your-feature-name
   ```
   Submit a Pull Request with base branch set to **`develop`** (never directly to `main`).
5. **Review & Merge:** Once peer-reviewed and CI passes, your branch is merged into `develop`. Release candidates are later verified and merged into `main` with a semantic version tag (e.g., `v1.0.0`).
