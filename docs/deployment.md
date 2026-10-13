# Runnel — Public Deployment & Operational Runbook

This document details the production deployment architecture, hosting topology comparisons, configuration contracts, security verifications, disaster recovery runbooks, and external staging checklist for **Runnel**.

---

## 1. Production Architecture Overview

Runnel's production runtime comprises five core services orchestrated via Docker Compose:

```text
External Internet Traffic (Clients, Webhooks, Browsers)
                         │
                         │  HTTPS (443)  /  HTTP (80 -> 301 Redirect)
                         ▼
         ┌────────────────────────────────────────────────────────┐
         │ Nginx Reverse Proxy (runnel_nginx_prod)                 │
         │  • TLS 1.2/1.3 Termination & HSTS                      │
         │  • ACME Challenge Route (Certbot / Let's Encrypt)      │
         │  • Static Asset Caching (/assets/)                     │
         │  • WebSocket Upgrades (/socket.io/)                    │
         │  • Security Headers (CSP, X-Frame-Options, etc.)       │
         └─────────────────────────┬──────────────────────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
         ┌──────────────────────┐    ┌──────────────────────────────────┐
         │ Frontend (React SPA) │    │ Backend API & Worker Engine      │
         │  • Port 80 internal    │    │  • Port 5000 internal            │
         │  • Nginx 1.30.5 Alpine │    │  • Node.js 24 LTS / Express 4    │
         │  • Client-side SPA     │    │  • BullMQ Queue Worker           │
         │    routing           │    │  • Stuck-Execution Recovery      │
         └──────────────────────┘    │  • Outbound Webhook Dispatcher   │
                                     └───────────┬──────────────┬───────┘
                                                 │              │
                           Private Docker Bridge │              │ Private Docker Bridge
                                                 ▼              ▼
                               ┌──────────────────────┐   ┌──────────────────────┐
                               │ MongoDB 8.0          │   │ Redis 7.4 Alpine     │
                               │  • Port 27017 private│   │  • Port 6379 private │
                               │  • mongodb_prod_data │   │  • redis_prod_data   │
                               │    volume            │   │    volume            │
                               └──────────────────────┘   └──────────────────────┘
```

### Process Topology & Lifecycle
- **Co-located API & Worker Process:** The Express REST API, Socket.IO gateway, BullMQ queue worker, and stuck-execution recovery service execute within the **same single Node.js process** in the `backend` container (`server.js` calls `startExecutionWorker(io)`).
- **Restart Implications:** If the backend container restarts, both API requests and in-flight BullMQ jobs are paused. On shutdown, a graceful teardown handler (`stopExecutionWorker()`, `mongoose.disconnect()`, `redisClient.quit()`) allows active jobs up to the worker timeout to conclude.
- **Worker Recovery Guarantees:** Any jobs interrupted mid-execution (e.g. hard SIGKILL or host power disruption) are automatically detected by Runnel's built-in reconciliation engine after `RECOVERY_STALE_THRESHOLD_MS` (default: 5 minutes) and re-enqueued under `WORKER_INTERRUPTED` with retry budgets strictly preserved.
- **Scaling Considerations:** For single-node staging and early production, the co-located model offers maximum efficiency and low overhead. For multi-replica horizontal clustering in the future, Redis distributed locking coordinates reconciliation across replicas.

---

## 2. Hosting Topology Comparison

### Option A: Single Linux VPS with Production Docker Compose (Recommended)

| Category | Assessment |
| :--- | :--- |
| **Architecture** | 1x Linux VPS running `docker-compose.prod.yml` (Nginx, Frontend, Backend, MongoDB, Redis). |
| **Compute Specification** | 2 vCPUs, 4 GB RAM, 40+ GB NVMe SSD (e.g., Hetzner CX22 or DigitalOcean Basic Droplet). |
| **Confirmed / Est. Cost** | **~$10 to $24 / month** compute; domain ~$10–$15 / year; TLS certificates free via Let's Encrypt. |
| **Configuration Changes** | **Zero**. Fully implemented, tested, and automated by existing repository configurations. |
| **Operational Strengths** | Near-zero latency loopback between API, worker, Redis, and Mongo; backing services completely isolated from public internet; unified log capture; simple deployment. |
| **Operational Risks** | Single point of failure (SPOF); host-level backups must be scheduled; shared host resources. |

### Option B: Vercel Frontend + Managed Cloud Backend, Database & Cache

| Category | Assessment |
| :--- | :--- |
| **Architecture** | Frontend on Vercel; Backend on persistent container host (Render / Railway / AWS App Runner); MongoDB on Atlas (M0/M10); Redis on Upstash / Redis Cloud. |
| **Confirmed / Est. Cost** | Vercel (Free or $20/mo/user); Backend host ($7–$25/mo); MongoDB Atlas (Free M0 sandbox or $57/mo M10); Redis ($0–$15/mo). **Total: ~$15–$100+/month**. |
| **Configuration Changes** | Requires splitting root repository deploy, setting up CORS across distinct domains (`app.runnel.com` vs `api.runnel.com`), configuring cross-site secure cookie policies, and updating WebSocket client URLs. |
| **Operational Strengths** | Global CDN for frontend static assets; zero host OS maintenance; automated managed database backups. |
| **Operational Risks** | Distributed multi-vendor failure modes; network latency hops between Vercel, API host, Atlas, and Redis; BullMQ persistent connection limits on serverless Redis providers. |

### Architectural Recommendation
**Option A (Single Linux VPS with Production Compose)** is the **strongly recommended, lowest-risk path** for Runnel's self-hosted production release. It uses the exact, battle-tested orchestration already maintained in `docker-compose.prod.yml`, avoids cross-origin complexity, keeps MongoDB and Redis strictly private, and operates at predictable, minimal cost.

---

## 3. Free Portfolio Deployment (Zero-Cost Hosting on Render, Atlas & Upstash)

This section provides the end-to-end operational guide for deploying Runnel as a **100% free ($0.00 budget)** public portfolio demonstration for recruiters and open-source contributors, without paid infrastructure, VPS instances, or purchased domain names.

### Service Topology

```text
Recruiter Browser / Public Clients
                │
                │  HTTPS (Managed TLS)
                ▼
┌────────────────────────────────────────────────────────┐
│ Frontend Static Site (Render Free Static Site)         │
│  • Deployed from frontend/ root directory              │
│  • Built via: npm ci && npm run build (dist/)          │
│  • Automatic SPA rewrite: /* -> /index.html            │
│  • Public URL: https://runnel-frontend-xxxx.onrender.com│
└───────────────────────┬────────────────────────────────┘
                        │
                        │  HTTPS / WSS Cross-Origin
                        ▼
┌────────────────────────────────────────────────────────┐
│ Backend Web Service (Render Free Web Service)          │
│  • Deployed from backend/ root directory               │
│  • Node.js 24 LTS, Express API + Socket.IO             │
│  • Co-located BullMQ Queue Worker                      │
│  • Co-located Stuck-Execution Recovery Scheduler       │
│  • Health check: /health/live                          │
│  • Public URL: https://runnel-backend-xxxx.onrender.com│
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            │ TLS Native TCP (rediss://)     │ TLS MongoDB SRV (mongodb+srv://)
            ▼                                ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Upstash Redis (Free Tier)    │ │ MongoDB Atlas (M0 Free Tier) │
│  • Native Redis over TCP/TLS │ │  • MongoDB 8.0 cluster       │
│  • 10,000 commands / day     │ │  • 512 MB storage            │
│  • BullMQ & Distributed Lock │ │  • Shared RAM & CPU          │
└──────────────────────────────┘ └──────────────────────────────┘
```

> [!NOTE]
> **Single Node.js Process Preserved:** The Express API, Socket.IO gateway, BullMQ queue worker, and recovery engine share a single Node.js process. This design allows the entire backend to operate within Render's single free web service instance without incurring costs for dedicated background worker services.

### Free-Tier Services & Prerequisites

1. **Render Account (Free Tier):**
   - Free Web Service: 512 MB RAM, shared CPU, automatic sleep after 15 minutes of inactivity.
   - Free Static Site: 100 GB bandwidth / month, global CDN edge, automatic Let's Encrypt HTTPS.
2. **MongoDB Atlas Account (Free M0 Sandbox):**
   - Cluster tier: M0 Sandbox (512 MB storage, shared RAM, MongoDB 8.0).
   - Region: Select an AWS region close to your Render deployment (e.g., `us-west-2` Oregon or `eu-central-1` Frankfurt).
3. **Upstash Redis Account (Free Tier):**
   - Free plan: 10,000 commands per day, maximum 256 MB storage.
   - Connection type: Native Redis TCP over TLS (`rediss://...`).

---

### Step-by-Step Provisioning Guide

#### Step 1: Configure MongoDB Atlas (Free M0 Cluster)

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Click **Create Cluster**, choose the **M0 Free (Shared)** tier, and select the AWS region matching your backend (e.g. `us-west-2` Oregon).
3. Under **Security → Database Access**:
   - Create a new Database User (e.g. `runnel_user`).
   - Assign authentication method: **Password** (generate a secure 32-character random string).
   - Assign database role: **Read and write to any database** or specifically `readWrite` on `runnel`.
4. Under **Security → Network Access**:
   - Click **Add IP Address**.
   - Select **Allow Access from Anywhere (`0.0.0.0/0`)**.
   - *Security Note:* Render's free tier uses dynamic outbound IP addresses that shift across shared hosting nodes. While `0.0.0.0/0` is necessary for connectivity, security is maintained through SCRAM-SHA-256 authentication, strict password complexity, and TLS encryption in transit.
5. Click **Connect → Drivers → Node.js** and copy the connection string:
   ```text
   mongodb+srv://runnel_user:<PASSWORD>@cluster0.abcde.mongodb.net/runnel?retryWrites=true&w=majority
   ```

#### Step 2: Configure Upstash Redis (Free Native TCP)

1. Log in to the [Upstash Console](https://console.upstash.com/).
2. Click **Create Database**, select the free tier, and choose a region close to your Render service.
3. In the database dashboard, navigate to the **Connect** tab.
4. Select **ioredis / Node.js** (or standard Redis TCP) to view the native connection string:
   ```text
   rediss://default:<PASSWORD>@<ENDPOINT>.upstash.io:6379
   ```
5. **Critical Caveat:** Do **not** use the `@upstash/redis` REST API or copy the `UPSTASH_REDIS_REST_URL`. Runnel's queue orchestration relies on **BullMQ**, which requires a persistent Redis TCP connection with blocking command support (`BRPOPLPUSH`) and pub/sub. The `rediss://` scheme automatically activates TLS in `ioredis`.

---

### Two-Stage Deployment Sequence on Render

Because Vite bakes frontend environment variables into static bundles at **build time**, and because Render assigns random hostname subdomains upon service creation, follow this two-stage deployment order:

#### Stage 1: Deploy Backend Web Service (`runnel-backend`)

1. In the Render Dashboard, click **New + → Web Service**.
2. Connect your GitHub repository: `https://github.com/goravgumber/Runnel`.
3. Configure settings:
   - **Name:** `runnel-backend`
   - **Region:** Oregon (US West) or Frankfurt (EU Central)
   - **Branch:** `develop` or your release branch
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm ci`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free` (0.1 CPU, 512 MB RAM)
4. Under **Advanced → Health Check Path**, enter: `/health/live`.
5. Under **Environment Variables**, define:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production mode |
| `MONGO_URI` | `mongodb+srv://...` | Atlas connection string from Step 1 |
| `REDIS_URL` | `rediss://...` | Upstash native TCP/TLS URL from Step 2 |
| `JWT_SECRET` | *(Click "Generate" or paste 32+ hex chars)* | High-entropy session secret |
| `ENABLE_DEMO_HANDLERS` | `false` | Keeps execution engine secure |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15 minutes window |
| `RATE_LIMIT_MAX` | `1000` | 1000 requests per IP |
| `EXECUTION_RATE_LIMIT_WINDOW_MS` | `60000` | 1 minute window |
| `EXECUTION_RATE_LIMIT_MAX` | `60` | 60 submissions / user / minute |
| `MAX_CONCURRENT_EXECUTIONS_PER_USER` | `25` | Concurrency ceiling |
| `RECOVERY_ENABLED` | `true` | Automated reconciliation engine |

6. Click **Create Web Service**. Wait 2–3 minutes for the build to finish.
7. Once deployed, copy your backend's assigned public URL from the top of the dashboard:
   `https://runnel-backend-xxxx.onrender.com`

#### Stage 2: Deploy Frontend Static Site (`runnel-frontend`)

1. In the Render Dashboard, click **New + → Static Site**.
2. Connect the same GitHub repository.
3. Configure settings:
   - **Name:** `runnel-frontend`
   - **Branch:** `develop` or your release branch
   - **Root Directory:** `frontend`
   - **Build Command:** `npm ci && npm run build`
   - **Publish Directory:** `dist`
4. Under **Redirects / Rewrites**, add the Single Page Application rewrite rule:
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`
5. Under **Environment Variables**, configure:

| Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://runnel-backend-xxxx.onrender.com` | Exact backend URL from Stage 1 |
| `VITE_SOCKET_URL` | `https://runnel-backend-xxxx.onrender.com` | Socket.IO gateway URL |
| `VITE_ENABLE_DEMO_DISPATCHER` | `false` | Production UI safety |

6. Click **Create Static Site**.
7. Once deployed, copy your frontend's assigned public URL:
   `https://runnel-frontend-xxxx.onrender.com`

#### Stage 3: Wire Frontend Origin to Backend CORS

1. Return to the `runnel-backend` service in the Render Dashboard.
2. Under **Environment**, add:
   - `FRONTEND_URL`: `https://runnel-frontend-xxxx.onrender.com` (exact frontend URL without trailing slash)
   - `PUBLIC_API_URL`: `https://runnel-backend-xxxx.onrender.com`
3. Click **Save Changes**. Render will automatically redeploy the backend with updated CORS configuration.

---

### Reproducible Render Blueprint (`render.yaml`)

As an alternative to manual dashboard setup, Runnel provides a root-level `render.yaml` Blueprint. When creating an environment via **Blueprints** on Render:
- Services and build scripts are automatically discovered.
- Secrets (`MONGO_URI`, `REDIS_URL`, `JWT_SECRET`) are configured as `sync: false` to ensure credentials are never committed.
- The two-stage URL binding documented above must still be followed to cross-reference frontend and backend URLs after initial provisioning.

---

### Free-Tier Operational Characteristics & Cold Starts

| Characteristic | Free Tier Reality | Runnel Mitigation |
| :--- | :--- | :--- |
| **Inactivity Spin-Down** | Web services sleep after 15 minutes without inbound HTTP requests. | Frontend detects 502/network gateway latency and probes `/health/live`. |
| **Cold-Start Latency** | Booting Node.js from cold state takes **40 to 60 seconds**. | Displays clear banner: *"Waking up the demo backend — this may take up to a minute on the free hosting tier."* |
| **Mutation Safety** | Auto-retrying state changes during spin-up could duplicate work. | **Never auto-retries mutations:** Sign-up, execution submission, retry, and cancellation are strictly user-initiated. Read-only stats auto-sync once online. |
| **Background Processing** | BullMQ workers do not process jobs while the container is spun down. | Queued executions remain safe in Upstash Redis and resume immediately when the service wakes up. |
| **Daily Command Limits** | Upstash Free allows 10,000 commands / day. | Polling intervals are bounded (12s–30s) to comfortably stay within quota. |
| **Zero-Cost Safeguards** | Platforms may offer paid upgrades or add-on disks. | Runnel requires **no paid addons**. Do not attach persistent disks or select starter/standard instances. |

---

### Free Portfolio Verification Sequence

After deployment, test the public deployment with this checklist:

1. **Verify Backend Health:**
   ```bash
   curl -fsS https://runnel-backend-xxxx.onrender.com/health/live
   # Returns: {"status":"live","uptime":...}
   ```
2. **Open Frontend URL:** Navigate to `https://runnel-frontend-xxxx.onrender.com`.
3. **Register Demo Account:** Create a new user with username and password.
4. **Inspect Overview Dashboard:** Verify stat counters load and live gateway status shows *Gateway Online*.
5. **Submit Test Execution:**
   - In Settings or via terminal, copy the sample cURL command with your JWT token.
   - Dispatch an `echo` execution to `https://runnel-backend-xxxx.onrender.com/api/v1/executions`.
   - Verify the execution appears in the **Execution Inbox** and transitions from `pending` → `running` → `completed`.
6. **Test Manual Retry:** Trigger a retry on a test execution; verify attempt history increments atomically.
7. **Simulate Inactivity / Wake-Up:** Allow the backend to sleep for 16 minutes. Open the frontend and verify the wake-up banner guides the user smoothly through the cold start.

---

## 4. Production Environment Configuration Contract

Every deployment requires a production environment file (`.env.production` or host environment variables). **Never commit production environment files to source control.**

### Required Variables (Must be supplied by Operator)
| Variable | Description | Validation Rule / Constraint |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | Must be `production` |
| `FRONTEND_URL` | Canonical external HTTPS domain | Must include protocol (e.g., `https://runnel.example.com`) |
| `PUBLIC_API_URL` | Public-facing API URL | Typically matches `FRONTEND_URL` |
| `JWT_SECRET` | Cryptographic signing secret | Minimum 32 random characters (generated via `openssl rand -hex 32`). Startup **fails immediately** if placeholder or weak secret is detected. |

### Optional Operational Variables (With Tested Production Defaults)
| Variable | Default Value | Purpose |
| :--- | :--- | :--- |
| `MONGO_URI` | `mongodb://mongodb:27017/runnel` | Internal Docker network URI to MongoDB container |
| `REDIS_URL` | `redis://redis:6379` | Internal Docker network URI to Redis container |
| `ENABLE_DEMO_HANDLERS` | `false` | Must remain `false` to block synthetic `echo` and `fail` tasks |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global API rate limit window (15 minutes) |
| `RATE_LIMIT_MAX` | `1000` | Max requests per IP per rate limit window |
| `EXECUTION_RATE_LIMIT_MAX`| `60` | Execution submission quota per user per minute |
| `MAX_CONCURRENT_EXECUTIONS_PER_USER` | `25` | Maximum active in-flight executions per user |
| `MAX_PAYLOAD_SIZE` | `2mb` | Maximum express request body size |
| `WEBHOOK_REQUEST_TIMEOUT_MS` | `10000` | Maximum socket duration for outbound webhook deliveries |
| `WEBHOOK_CONNECT_TIMEOUT_MS` | `5000` | Socket connection timeout for outbound webhooks |
| `WEBHOOK_MAX_REDIRECTS` | `3` | Maximum allowed HTTP redirect hops |
| `WEBHOOK_MAX_RESPONSE_BYTES` | `1048576` | Response body size ceiling (1 MB) before auto-truncation |
| `RECOVERY_ENABLED` | `true` | Automated stuck-execution reconciliation engine |
| `RECOVERY_INTERVAL_MS` | `60000` | Reconciliation cycle interval (1 minute) |
| `RECOVERY_STALE_THRESHOLD_MS` | `300000` | Inactive execution threshold for stuck recovery (5 minutes) |

---

## 5. Operator Step-by-Step VPS Deployment Runbook

### Step 1: DNS & Domain Setup
Create an **A Record** pointing your domain or subdomain to the public IPv4 address of the VPS:
- **Type:** `A`
- **Name:** `runnel` (e.g. `runnel.yourdomain.com`) or `@` for apex
- **Target:** `<VPS_PUBLIC_IPV4>`
- **TTL:** 300 seconds

Verify DNS resolution before proceeding:
```bash
dig +short runnel.yourdomain.com
```

### Step 2: Host Preparation
On your Linux VPS (Ubuntu 22.04 LTS / Debian 12):
```bash
# Update base system and install dependencies
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release git certbot

# Install Docker CE and Compose plugin
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Grant current user docker group access
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3: Issue Initial TLS Certificate
To ensure Nginx starts successfully on first boot, create the webroot challenge directory and obtain the initial certificate using Certbot standalone with `--cert-name runnel`:
```bash
# Create shared ACME challenge directory on host
sudo mkdir -p /var/www/certbot

# Ensure port 80 is temporarily clear before starting Docker containers
sudo certbot certonly --standalone \
  --cert-name runnel \
  -d runnel.yourdomain.com \
  --agree-tos \
  --email operator@yourdomain.com \
  --non-interactive
```
*Note: Using `--cert-name runnel` creates `/etc/letsencrypt/live/runnel/fullchain.pem` and `privkey.pem` on the host, matching the exact paths referenced in `infra/nginx/nginx.prod.conf`.*

### Step 4: Clone Repository & Configure Environment
```bash
# Clone the verified repository
git clone https://github.com/goravgumber/Runnel.git /opt/runnel
cd /opt/runnel

# Generate high-entropy production JWT secret
PROD_JWT_SECRET=$(openssl rand -hex 32)

# Create secured .env.production file (restricted permissions)
cat <<EOF > .env.production
NODE_ENV=production
FRONTEND_URL=https://runnel.yourdomain.com
PUBLIC_API_URL=https://runnel.yourdomain.com
JWT_SECRET=${PROD_JWT_SECRET}
ENABLE_DEMO_HANDLERS=false
EOF

chmod 600 .env.production
```

### Step 5: Configure Certificate Mount & Launch Production Stack
`docker-compose.prod.yml` mounts certificates and challenges directly from host directories into Nginx:
- `${LETSENCRYPT_DIR:-/etc/letsencrypt}:/etc/letsencrypt:ro`
- `${CERTBOT_CHALLENGE_DIR:-/var/www/certbot}:/var/www/certbot:ro`

Because the initial certificate was provisioned in Step 3, Nginx starts cleanly without missing certificate errors:
```bash
# Launch the complete production stack
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Step 6: Verify Private Networking & Health Endpoints
```bash
# 1. Verify container status (all 5 containers running and healthy)
docker compose -f docker-compose.prod.yml ps

# 2. Verify MongoDB and Redis have ZERO host-exposed ports
docker port runnel_mongodb_prod
# (Expected: empty output - ports are unexposed to host)

docker port runnel_redis_prod
# (Expected: empty output - ports are unexposed to host)

# 3. Verify only Nginx exposes ports 80 and 443
docker port runnel_nginx_prod
# Expected output:
# 80/tcp -> 0.0.0.0:80
# 443/tcp -> 0.0.0.0:443

# 4. Check HTTP to HTTPS redirect
curl -I http://runnel.yourdomain.com
# Expected: HTTP/1.1 301 Moved Permanently -> Location: https://runnel.yourdomain.com/

# 5. Check live health endpoint over HTTPS
curl -fsS https://runnel.yourdomain.com/health/live
# Expected: {"status":"live","uptime":...}
```

### Step 7: Automated Certificate Renewal Setup
When Nginx is running, renewal challenges are fulfilled through the HTTP webroot route (`/.well-known/acme-challenge/ -> /var/www/certbot`). Set up a bi-weekly renewal cron (or systemd timer):
```bash
# Add cron job to renew via webroot challenge and reload Nginx
sudo crontab -l 2>/dev/null | { cat; echo "0 3 1,15 * * certbot renew --webroot -w /var/www/certbot --post-hook 'docker compose -f /opt/runnel/docker-compose.prod.yml exec -T nginx nginx -s reload'"; } | sudo crontab -
```
*How renewal works without downtime:*
1. Certbot writes challenge verification tokens to `/var/www/certbot/.well-known/acme-challenge/` on the host.
2. Nginx serves the HTTP challenge on port 80 directly from the mounted `/var/www/certbot` directory.
3. Once validated by Let's Encrypt, Certbot writes updated certificates to `/etc/letsencrypt/live/runnel/`.
4. The `--post-hook` executes `nginx -s reload` inside the running Nginx container, applying the new certificate with zero connection drops.

---

## 6. Backup, Disaster Recovery & Rollback

### Automated MongoDB Daily Backup
Create `/etc/cron.daily/runnel-backup`:
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/runnel"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Stream mongodump archive to compressed file
docker compose -f /opt/runnel/docker-compose.prod.yml exec -T mongodb \
  mongodump --archive --gzip > "$BACKUP_DIR/runnel_mongo_$DATE.gz"

# Retain backups for 14 days
find "$BACKUP_DIR" -type f -name "runnel_mongo_*.gz" -mtime +14 -delete
```
```bash
sudo chmod +x /etc/cron.daily/runnel-backup
```

### Database Restoration Procedure
To restore from a backup archive:
```bash
docker compose -f /opt/runnel/docker-compose.prod.yml exec -T mongodb \
  mongorestore --archive --gzip --drop < /var/backups/runnel/runnel_mongo_YYYYMMDD_HHMMSS.gz
```

### Application Rollback Runbook
If an upgraded release encounters regressions:
```bash
cd /opt/runnel

# 1. Checkout previous known-good tag or commit
git checkout tags/v1.0.0

# 2. Rebuild and restart application containers
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend frontend

# 3. Verify health status
curl -fsS https://runnel.yourdomain.com/health/ready
```

---

## 7. Production VPS Verification Checklist

Perform this 10-point test sequence once the staging stack is live at its public HTTPS URL:

- [ ] **1. HTTPS & Security Headers:** `curl -I https://runnel.yourdomain.com` verifies valid TLS certificate and headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`).
- [ ] **2. Authentication Lifecycle:** Register a new user, log in, refresh session token, and verify logout revokes tokens in Redis.
- [ ] **3. Execution Ingestion & Validation:** Submit a webhook execution payload via `POST /api/v1/executions` with `idempotencyKey` and verify receipt in the Execution Inbox.
- [ ] **4. Webhook Dispatch to Controlled Endpoint:** Submit an execution targeting a controlled endpoint (e.g., mock target or webhook.site) and verify HTTP 200 delivery.
- [ ] **5. Upstream Failure Diagnostics:** Submit an execution targeting an HTTP 502 endpoint and verify attempt failure captures duration, status code, and sanitized response body.
- [ ] **6. Safe Manual Retries & State Machine:** Trigger a manual retry from the UI and verify attempt count increments without violating max-attempt policy bounds.
- [ ] **7. Data Persistence Across Restarts:** Restart backend and database containers (`docker compose -f docker-compose.prod.yml restart`) and verify all historical executions and attempts remain intact.
- [ ] **8. Stuck-Execution Recovery:** Issue a simulated crash/SIGKILL to the backend container while an execution is running; verify that after restart, the recovery engine reconciles the job to `retrying` or `failed` with reason `WORKER_INTERRUPTED`.
- [ ] **9. Multi-Tenant Execution Isolation:** Create User B and verify User B cannot read, retry, or cancel User A's executions (returns HTTP 404/403).
- [ ] **10. Operational Probes & Backups:** Verify `/health/live`, `/health/ready`, and run a test `mongodump` archive creation to ensure backup scripts function.
