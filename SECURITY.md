# Security Policy

Runnel takes the security and integrity of asynchronous workload execution seriously. This document outlines our vulnerability disclosure process and describes the built-in security architecture protecting Runnel deployments.

---

## Supported Versions

Only the latest release and the current `main` branch receive active security patches.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x (Release Candidate) | :white_check_mark: |
| < 1.0.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability in Runnel, please report it privately. **Do not disclose vulnerabilities publicly in GitHub issues or discussions.**

### Contact Process
1. Email your report to **security@runnel.dev** (or open a private GitHub Security Advisory).
2. Include:
   - Description of the vulnerability.
   - Minimal reproducible proof of concept (PoC).
   - Expected impact and potential attack scenarios.
   - Affected components (`backend`, `worker`, `nginx`, `frontend`).
3. We will acknowledge receipt within **24 hours** and provide a status update or remediation timeline within **72 hours**.

---

## Security Architecture & Defenses

Runnel includes layered security controls designed for safe public and multi-tenant operation:

### 1. Outbound Webhook Dispatcher & SSRF Protection
Runnel background workers execute asynchronous HTTP webhooks. To prevent Server-Side Request Forgery (SSRF) and network pivoting, every outbound request passes through an isolated security pipeline:
- **Comprehensive IP Range Validation:** Validates all destination addresses using `ipaddr.js`. Rejects IPv4 and IPv6 loopback (`127.0.0.0/8`, `::1`), private networks (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`; RFC 4193 `fc00::/7`), link-local (RFC 3927 `169.254.0.0/16`, RFC 4291 `fe80::/10`), multicast (`224.0.0.0/4`, `ff00::/8`), broadcast, carrier-grade NAT (`100.64.0.0/10`), unspecified (`0.0.0.0`, `::`), and IPv4-mapped IPv6 ranges.
- **Explicit Cloud Metadata Blocking:** Prohibits connections to AWS/GCP/Azure instance metadata endpoints (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`).
- **DNS-Rebinding Defense:** Performs pre-resolution of all DNS A and AAAA records, validates every returned IP against destination policy, and binds custom socket lookups strictly to the pre-validated IP address, eliminating TOCTOU (Time-of-Check to Time-of-Use) DNS rebinding attacks.
- **Safe Manual Redirect Following:** Automatic client-side redirect following is disabled. Redirects are manually inspected, restricted to a maximum of 3 hops, and re-validated against the full destination policy before each hop.
- **Header Sanitization:** Strips caller-injected `Host`, `Cookie`, `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Real-IP` headers to prevent proxy manipulation.
- **Bounded Resource Consumption:** Enforces configurable connect timeouts (5s default), overall request timeouts (10s default), and maximum response body buffers (1 MB default). Responses exceeding 1 MB are safely truncated to prevent memory exhaustion.
- **Sensitive Token Redaction:** Automatically redacts `Authorization`, `Token`, `Secret`, `Cookie`, and API keys from execution history, error records, and logs.

### 2. Multi-Tenant Execution Isolation & Authorization
- Every execution record, attempt record, and retry transition is strictly partitioned by `userId`.
- Users cannot access, inspect, cancel, or retry executions belonging to other accounts. Cross-user requests reject with `404 NOT_FOUND` or `403 FORBIDDEN`.

### 3. Rate Limiting & Abuse Prevention
- **Authentication Endpoints:**
  - Login: 50 requests per 15-minute window per IP.
  - Registration: 100 requests per 15-minute window per IP.
- **Global API Gateway:** 1000 requests per 15-minute window.
- **Execution Submission Quota:** 60 submissions per minute per user.
- **Active Execution Concurrency Limit:** Maximum 25 concurrent active executions (`pending`, `running`, `retrying`) per user. Requests exceeding this quota reject with HTTP 429 (`CONCURRENT_QUOTA_EXCEEDED`).
- **Payload Limits:** Incoming JSON request payloads are bounded to 2 MB (configurable via `MAX_PAYLOAD_SIZE`). Execution `input` bodies are bounded to 256 KB.

### 4. Authentication & Secret Management
- Passwords hashed using `bcryptjs` (salt work factor 12).
- Dual-token session strategy: 15-minute JWT access tokens and 7-day refresh tokens stored and tracked in Redis.
- Atomic refresh token rotation with automated reuse detection and family revocation.
- Dedicated `/api/v1/auth/logout` revokes active refresh tokens immediately.
- Production environment validation strictly rejects placeholder, default, or weak secrets for `JWT_SECRET`.

### 5. Network & Reverse Proxy Boundaries
- In production Docker Compose (`docker-compose.prod.yml`), MongoDB and Redis ports remain private to the internal container network. No database ports are published to host or internet.
- Nginx terminates TLS 1.2/1.3, enforces HSTS (`max-age=63072000; includeSubDomains; preload`), CSP, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`.
- Production CORS is locked down to the exact application origin (`FRONTEND_URL`).
