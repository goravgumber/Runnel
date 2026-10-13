# Runnel — Testing & Quality Assurance Guide

Runnel is engineered for mission-critical reliability. Our test strategy emphasizes **hermetic execution**, **defense-in-depth security verification**, and **automated lifecycle recovery testing**.

---

## 1. Test Architecture Overview

Runnel's automated test suite is built natively on Node.js (`node --test` and `node:assert/strict`) without relying on heavy external test frameworks.

- **Zero-Dependency Hermetic Execution**: Unit and integration tests automatically spin up an isolated in-memory MongoDB server via `mongodb-memory-server`. No local or external database installation is required to run the full test suite.
- **Continuous Integration**: The consolidated GitHub Actions workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) executes these tests on every pull request and push to `main` and `develop` against containerized MongoDB 8.0 and Redis 7.4 services, and validates production Docker Compose configs and image builds.

---

## 2. Test Execution Commands

### Running All Backend Tests
```bash
cd backend
npm test
```
*Current baseline: **125 passed, 0 failed across 25 suites**.*

### Running Specific Test Suites
```bash
# Webhook client security & SSRF boundary tests (46 tests)
node --test tests/unit/webhookSecurity.test.js

# Stuck-execution recovery reconciler tests (10 tests)
node --test tests/unit/stuckExecutionRecovery.test.js

# Idempotent database migrations and index optimization (3 tests)
node --test tests/unit/migrationIndexOptimization.test.js

# Authentication and session lifecycle
node --test tests/auth.test.js

# Execution submission and validation
node --test tests/executions/submit.test.js

# Execution retry mechanics and concurrency limits
node --test tests/executions/retry.test.js

# Execution cancellation mechanics
node --test tests/executions/cancel.test.js

# Release gate end-to-end verifications
node --test tests/release-gate-verification.js
```

### Frontend Checks
```bash
cd frontend

# ESLint check
npm run lint

# Production build verification
npm run build
```

---

## 3. Verified Test Matrix

### A. Webhook Client Security & SSRF Boundary (46 Tests)
- **URL Validation & Canonicalization**: Strict HTTP/HTTPS validation, rejects malformed URLs, protocol smuggling (`ftp:`, `file:`, `javascript:`), and embedded basic authentication credentials (`http://user:pass@host`).
- **Comprehensive IP Range Validation (`ipaddr.js`)**: Evaluates every resolved IP address against RFC-reserved blocks:
  - Loopback (`127.0.0.0/8`, `::1`)
  - Private networks (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`; RFC 4193 `fc00::/7`)
  - Link-local (RFC 3927 `169.254.0.0/16`, RFC 4291 `fe80::/10`)
  - Multicast (`224.0.0.0/4`, `ff00::/8`)
  - Broadcast (`255.255.255.255`)
  - Carrier-grade NAT (`100.64.0.0/10`)
  - IPv4-mapped IPv6 ranges (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`)
  - Permits genuine public Internet IPs (`8.8.8.8`, `1.1.1.1`, `93.184.216.34`, `2606:4700:4700::1111`).
- **Cloud Metadata Defense**: Blocks AWS, Azure, and GCP metadata endpoints (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`).
- **DNS-Pinning & Rebinding Defense**: Pre-resolves DNS records, verifies all IPs, and binds custom socket connections to the pinned IP, eliminating Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding vulnerabilities.
- **Manual Redirect Security**: Inspects HTTP 3xx responses manually up to a maximum of 3 hops; re-validates each redirect destination against destination policies.
- **Header Sanitization**: Strips caller-supplied `Host`, `Cookie`, and `X-Forwarded-*` headers; redacts sensitive credentials (`Authorization`, `Cookie`, `Secret`, API keys) from persisted attempt outputs.
- **Bounded Resource Consumption**: Enforces connect timeouts (5s), request timeouts (10s), and truncates responses exceeding 1 MB to prevent memory exhaustion.

### B. Reliable Stuck-Execution Recovery (10 Tests)
- **Abandoned Execution Recovery**: Automatically identifies jobs left in `running` status after worker disruption and safely re-enqueues them with reason `WORKER_INTERRUPTED`.
- **Active Job Preservation**: Inspects BullMQ queue state and preserves actively processing jobs without false-positive failures.
- **Delayed Retry Preservation**: Respects BullMQ exponential backoff delays and leaves scheduled retry jobs intact.
- **Distributed Mutex**: Coordinates multi-replica reconcilers via Redis distributed locks to prevent double-recovery race conditions.
- **Retry Budget Enforcement**: Transitions abandoned executions to `failed` once their maximum attempt quota is exhausted.
- **Database Outage Resilience**: Aborts gracefully during transient MongoDB disconnection without corrupting job states.

### C. Database Migration & Index Optimization (3 Tests)
- Validates that migration `002_optimize_execution_indexes.js` creates compound index `idx_execution_user_created` (`{ userId: 1, createdAt: -1 }`).
- Confirms safe removal of redundant standalone `executionId_1` index from `ExecutionAttempt`.
- Validates migration rerun idempotency across multiple sequential invocations.
- Verifies index support for inbox queries and attempt timeline lookups.

### D. Authentication, Execution Lifecycle & Concurrency
- **Password Hashing**: Enforces `bcryptjs` with salt work factor 12.
- **Session Tokens**: JWT access token expiration and Redis-backed refresh token rotation with reuse detection.
- **Idempotency**: Per-user `idempotencyKey` payload hash matching (returns HTTP 200 on duplicate; rejects altered payload with HTTP 409).
- **Concurrent Quota**: Rejects requests exceeding 25 active concurrent tasks per user with HTTP 429 (`CONCURRENT_QUOTA_EXCEEDED`).
