# Runnel — Backend Platform Architecture

Runnel is an observable recovery inbox and execution engine for asynchronous work and webhook dispatching.

---

## 1. System Architecture

```text
Client Applications (HTTP / WebSocket)
        │
        ▼
Express API Gateway (/api/v1)
        ├── Trace & Request Logging (Winston, Correlation IDs)
        ├── Auth Middleware (JWT Access/Refresh, Token Revocation in Redis)
        ├── Rate Limiting (Redis-backed per-IP and per-user submission quotas)
        │
        ├── Execution Lifecycle Engine
        │       ├── Idempotency Verification & Payload Hashing
        │       ├── Status State Machine (pending → running → completed/failed/retrying/cancelled)
        │       └── MongoDB Persistence (Executions, Attempts, Users)
        │
        ├── BullMQ Queue Dispatcher (Queue: runnel-executions, Concurrency: 4)
        │       └── Redis Broker
        │
        ├── BullMQ Execution Worker
        │       ├── Handler Registry ('webhook', 'echo', 'fail')
        │       ├── Outbound Webhook Client (SSRF validation, DNS pinning, 1 MB limit)
        │       ├── ExecutionAttempt Recording (Timestamps, Durations, Errors)
        │       └── Real-Time Socket.IO Broadcaster
        │
        └── Automated Stuck-Execution Recovery Service
                ├── Periodic Reconciler (Default: every 60s, stale threshold: 5m)
                ├── Redis Distributed Mutex Lock (Multi-replica safe)
                └── BullMQ Queue State Reconciliation & Safe Re-queuing
```

---

## 2. Core Operational Modules

### A. Execution Lifecycle & Inbox
- **REST Endpoints (`/api/v1/executions`)**: Paginated listing, full detail view with attempt timeline, status aggregations (`/executions/stats`), manual retry with atomic concurrency guard, and execution cancellation.
- **Per-User Isolation**: Every database query strictly filters on `userId`. Cross-user access returns `404 Not Found` without information leakage.
- **Idempotency Guard**: Per-user `idempotencyKey` computes a deterministic SHA-256 hash of input payloads. Matching payloads return existing records; altered payloads reject with `409 Conflict`.
- **Database Index Optimization**:
  - `idx_execution_user_created` (`{ userId: 1, createdAt: -1 }`): Eliminates in-memory sorting for default inbox views.
  - `idx_execution_inbox` (`{ userId: 1, status: 1, createdAt: -1 }`): Optimizes status-filtered tabs.
  - `idx_attempt_exec_number` (`{ executionId: 1, attemptNumber: 1 }`): Powers attempt history ordering and lookup.

### B. Outbound Webhook Client & SSRF Boundary
Outbound webhooks executed by background workers enforce defense-in-depth protections:
1. **Destination Policy**: All destination IP addresses are validated using `ipaddr.js`. Rejects loopback (`127.0.0.0/8`, `::1`), RFC 1918 private networks, link-local, multicast, carrier-grade NAT (`100.64.0.0/10`), and unspecified addresses.
2. **Cloud Metadata Defense**: Explicitly blocks requests targeting cloud metadata addresses (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`).
3. **DNS-Pinning**: Pre-resolves DNS records and binds custom HTTP sockets directly to the verified IP, immunizing against Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks.
4. **Controlled Redirects**: Manual redirect inspection up to 3 hops; every redirect target is re-validated through the full destination policy.
5. **Bounded Consumption**: Connect timeout (5s), request timeout (10s), and maximum response body limit (1 MB). Responses exceeding 1 MB are safely truncated.
6. **Credential Redaction**: Redacts sensitive headers (`Authorization`, `Cookie`, API keys) from persisted attempt outputs.

### C. Automated Stuck-Execution Recovery
- **Reconciliation Engine**: Periodically queries executions lingering in `running` status beyond `RECOVERY_STALE_THRESHOLD_MS`.
- **Distributed Mutex**: Uses Redis distributed locking (`runnel:recovery:lock`) with automatic expiry to coordinate across multiple API/worker replicas.
- **State Reconciliation**: Inspects live BullMQ job states before modifying database records:
  - If BullMQ job is active: Preserves execution.
  - If BullMQ job is delayed (backoff retry): Preserves execution.
  - If BullMQ job is waiting after worker restart: Transitions status to `retrying`.
  - If BullMQ job is missing (worker crash/interruption): Re-enqueues job if retry budget remains; marks `failed` with reason `WORKER_INTERRUPTED` if budget exhausted.

### D. Authentication & Session Security
- **Dual-Token Architecture**: 15-minute JWT access tokens and 7-day refresh tokens.
- **Token Blacklisting**: Revoked tokens stored in Redis with TTL matching token expiry.
- **Session Revocation**: `/api/v1/auth/logout` revokes current session; `/api/v1/auth/logout-all` revokes all active refresh tokens for the user.

---

## 3. Production Deployment Topologies

- **Docker Compose (Default / Local Staging)**: Orchestrates API backend, React frontend, Nginx reverse proxy, MongoDB 6.0, and Redis 7.0 Alpine.
- **Docker Compose Production (`docker-compose.prod.yml`)**: Restricts MongoDB and Redis ports to the private container network, enables TLS termination and security headers (CSP, HSTS) in Nginx, and enforces strict production environment validation.
