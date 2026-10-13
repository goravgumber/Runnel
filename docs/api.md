# Runnel — API Reference

Base URL: `/api/v1`

All protected endpoints require an `Authorization: Bearer <JWT_ACCESS_TOKEN>` header.

---

## 1. Authentication (`/api/v1/auth`)

### `POST /auth/signup`
Register a new developer account.
- **Request Body**:
  ```json
  {
    "username": "alice_dev",
    "password": "Password123!"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "User created successfully",
    "data": {
      "id": "6ace...",
      "username": "alice_dev",
      "role": "user"
    }
  }
  ```

### `POST /auth/login`
Authenticate credentials and issue JWT token pair.
- **Request Body**:
  ```json
  {
    "username": "alice_dev",
    "password": "Password123!"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Login successful",
    "data": {
      "accessToken": "eyJhbG...",
      "refreshToken": "eyJhbG...",
      "user": {
        "id": "6ace...",
        "username": "alice_dev",
        "role": "user"
      }
    }
  }
  ```

### `POST /auth/refresh`
Rotate refresh token for a new access token.
- **Request Body**: `{ "refreshToken": "<token>" }`

### `POST /auth/logout`
Revoke active session tokens.
- **Request Body**: `{ "refreshToken": "<token>" }`

### `POST /auth/logout-all`
Revoke all active sessions across all devices for the authenticated user.

### `GET /auth/validate`
Validate the current access token.

### `GET /auth/me`
Retrieve active user profile.

---

## 2. Executions (`/api/v1/executions`)

### `POST /executions`
Submit an asynchronous execution.
- **Request Body**:
  ```json
  {
    "name": "Sync Stripe Webhook",
    "type": "webhook",
    "input": {
      "url": "https://api.example.com/webhooks/orders",
      "method": "POST",
      "headers": { "Content-Type": "application/json" },
      "body": { "eventId": "evt_1002", "orderId": "ord_9901" }
    },
    "maxAttempts": 3,
    "idempotencyKey": "webhook_evt_1002",
    "tags": ["billing", "stripe"]
  }
  ```
  *(Note: `type: "webhook"` is the primary production handler; demo handlers `echo` and `fail` are disabled in production).*
- **Response** (`202 Accepted`): Returns execution record with initial status `pending`.

### `GET /executions`
Paginated, filtered list of user executions.
- **Query Parameters**:
  - `status`: Filter by status (`pending`, `running`, `completed`, `failed`, `retrying`, `cancelled`).
  - `type`: Filter by execution type (`webhook`, `echo`, `fail`).
  - `search`: Case-insensitive substring search on execution name.
  - `page`: Page number (default: 1).
  - `limit`: Page size (default: 20, max: 100).

### `GET /executions/stats`
Per-user status counts (cached 5s):
```json
{
  "success": true,
  "data": {
    "pending": 0,
    "running": 1,
    "completed": 12,
    "failed": 2,
    "retrying": 0,
    "cancelled": 1,
    "total": 16
  }
}
```

### `GET /executions/:id`
Full execution details including chronological attempt history (`attempts` array).

### `POST /executions/:id/retry`
Manually retry a failed or cancelled execution.
- Returns `202 Accepted` with new BullMQ `jobId`.
- Returns `409 Conflict` if execution is already running or completed.
- Returns `429 Too Many Requests` if manual retry cap (`maxAttempts * 2`) is reached.

### `POST /executions/:id/cancel`
Cancel a pending, retrying, or running execution.

### `DELETE /executions/:id`
Hard delete an execution and associated attempts (Admin only).

---

## 3. Administration (`/api/v1/admin`)

- `GET /admin/overview` — Platform-wide overview metrics (Admin only).
- `GET /admin/users` — Paginated user inventory (Admin only).
- `PATCH /admin/users/:userId/role` — Update user role (Admin only).

---

## 4. Queues & Observability (`/api/v1/queues`)

- `GET /queues` — Summary of BullMQ queue counts (`waiting`, `active`, `completed`, `failed`, `delayed`).
- `GET /queues/:queueName/jobs` — Detailed job listing for queue.
- `GET /queues/:queueName/jobs/:jobId` — Inspect individual queue job state.

---

## 5. Health & Probes (`/health`)

- `GET /health` — General health status, uptime, and version.
- `GET /health/live` — Liveness probe (HTTP 200 while process is running).
- `GET /health/ready` — Readiness probe (validates active MongoDB and Redis connectivity).
