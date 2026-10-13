# Runnel — Local Development Guide

This guide details the local setup, development workflows, configuration contracts, and developer tooling for contributing to **Runnel**.

---

## 1. Prerequisites

- **Node.js**: `>= 20.0.0` (v24 LTS recommended)
- **npm**: `>= 9.0.0`
- **Redis**: `>= 7.0` (v7.4 recommended, running locally on `127.0.0.1:6379` or via Docker)
- **MongoDB**: `>= 7.0` (v8.0 recommended; optional: Runnel automatically initializes an embedded `MongoMemoryServer` if no external MongoDB instance is running during local development)
- **Docker & Docker Compose** (optional: for containerized development)

---

## 2. Quickstart

### Step 1: Clone the Repository
```bash
git clone https://github.com/goravgumber/Runnel.git
cd Runnel
```

### Step 2: Configure Environment Files
Copy the example environment configurations:
```bash
# Root & backend environments
cp .env.example .env
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env
```

### Step 3: Install Dependencies
Run clean installations using lockfiles:
```bash
# Install backend dependencies
cd backend && npm ci

# Install frontend dependencies
cd ../frontend && npm ci
```

### Step 4: Seed Development Users (Optional)
To seed default development accounts (`admin / Admin123!` and `testuser / User123!`):
```bash
cd backend
node scripts/seed.js
```
*(Note: `seed.js` is strictly a development fixture with production safety guards. Database migrations are separately managed in `backend/scripts/migrations/`).*

### Step 5: Start Local Services

**Terminal 1 — Backend API & Worker:**
```bash
cd backend
npm run dev
# Starts Express API gateway on http://localhost:5000 with nodemon
```

**Terminal 2 — Frontend Console:**
```bash
cd frontend
npm run dev
# Starts Vite development server on http://localhost:5173 with HMR
```

Visit **`http://localhost:5173`** in your browser.

---

## 3. Docker-Based Development

To run the complete application stack locally with live container orchestration:

```bash
# Start MongoDB, Redis, Backend, Frontend, and Nginx
docker compose up -d

# Follow service logs
docker compose logs -f backend frontend
```

Default development mappings:
- **Web Console**: `http://localhost:8080` (or `http://localhost` via reverse proxy)
- **API Server**: `http://localhost:5000`
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6380`

To tear down containers:
```bash
docker compose down
```

---

## 4. Environment Variables Reference

### Backend (`backend/.env` / `.env`)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | `5000` | HTTP port for Express API |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/runnel` | MongoDB connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection for queues and locks |
| `JWT_SECRET` | Development fallback string | Secret key for JWT signing (>=32 chars required in prod) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifespan |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifespan |
| `ENABLE_DEMO_HANDLERS` | `true` in dev, `false` in prod | Enables demo `echo` and `fail` worker types |
| `RECOVERY_ENABLED` | `true` | Enables background stuck-execution reconciler |
| `RECOVERY_INTERVAL_MS` | `60000` | Interval between recovery reconciliation passes |
| `RECOVERY_STALE_THRESHOLD_MS` | `300000` | Stale timeout (5 min) for abandoned running jobs |
| `MAX_CONCURRENT_EXECUTIONS_PER_USER` | `25` | Maximum active concurrent executions per user |

### Frontend (`frontend/.env`)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_URL` | `/api/v1` | Base URL for REST API requests (proxied by Vite in dev) |
| `VITE_SOCKET_URL` | `http://localhost:5000` | WebSocket endpoint for live execution streaming |

---

## 5. Development Quality Checks

Before submitting a pull request, run all verification gates locally:

```bash
# Backend syntax check
cd backend && npm run check

# Full backend test suite
cd backend && npm test

# Frontend linting
cd ../frontend && npm run lint

# Frontend production bundle
cd ../frontend && npm run build
```
