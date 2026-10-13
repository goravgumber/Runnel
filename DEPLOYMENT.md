# Runnel — Public Deployment & Operational Guide

This document describes the deployment architecture, configuration contracts, security baselines, and operational runbooks for Runnel.

---

## 1. Architecture Overview

Runnel's production runtime comprises five core services orchestrated via Docker:

```text
Internet / External Traffic
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
 │ Frontend (React SPA) │    │ Backend API & Queue Worker       │
 │  • Port 80 internal  │    │  • Port 5000 internal            │
 │  • Nginx static host │    │  • Node.js / Express 4           │
 └──────────────────────┘    │  • BullMQ Worker (Concurrency: 4)│
                             │  • Stuck-Execution Recovery      │
                             │  • Outbound Webhook Dispatcher   │
                             └───────────┬──────────────┬───────┘
                                         │              │
                   Private Docker Bridge │              │ Private Docker Bridge
                                         ▼              ▼
                       ┌──────────────────────┐   ┌──────────────────────┐
                       │ MongoDB 6.0          │   │ Redis 7.0 Alpine     │
                       │  • Port 27017 private│   │  • Port 6379 private │
                       │  • Persistent Volume │   │  • Persistent Volume │
                       └──────────────────────┘   └──────────────────────┘
```

---

## 2. Deployment Topology Options

### Option A: Single VPS + Docker Compose (Recommended for v1.0 Launch)
Ideal for initial external access, staging environments, and early production workloads:
- **Compute:** 1x VPS (Hetzner Cloud CX22 or DigitalOcean Droplet with 2 vCPUs, 4 GB RAM, 40 GB NVMe).
- **Cost:** ~$10–$24/month.
- **Backing Services:** Co-located Dockerized MongoDB and Redis using persistent Docker volumes, or hybrid with free-tier MongoDB Atlas (M0) and Redis Cloud.
- **Complexity:** Low. Single Git repository checkout, single `docker compose -f docker-compose.prod.yml up -d`.

### Option B: Managed Cloud (High Availability / Scale)
For enterprise workloads requiring multi-AZ failover and automated horizontal scaling:
- **Frontend:** AWS S3 + CloudFront CDN (~$1–$5/month).
- **Backend API & Worker:** AWS ECS Fargate or GCP Cloud Run (~$30–$75/month).
- **Database:** MongoDB Atlas M10 Dedicated (~$57/month).
- **Queue & Cache:** AWS ElastiCache for Redis (~$15–$35/month).
- **HTTPS Termination:** AWS Application Load Balancer with AWS Certificate Manager (~$18/month).
- **Total Expected Cost:** ~$120–$190/month.

---

## 3. Environment Configuration Contract

Every deployment must supply a production environment file (`.env.production` or system environment variables). **Never commit production environment files to source control.**

### Required Variables
| Variable | Description | Example / Constraint |
|---|---|---|
| `NODE_ENV` | Must be `production` | `production` |
| `FRONTEND_URL` | Exact external domain with protocol (used for CORS and redirect validation) | `https://runnel.example.com` |
| `PUBLIC_API_URL` | External API URL (typically matches `FRONTEND_URL`) | `https://runnel.example.com` |
| `JWT_SECRET` | Cryptographically secure secret for token signing (min 32 characters) | Generated via `openssl rand -hex 32` |
| `MONGO_URI` | MongoDB connection string | `mongodb://mongodb:27017/runnel` or Atlas URI |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` or Redis Cloud URI |

### Security & Operational Variables (With Production Defaults)
| Variable | Default | Purpose |
|---|---|---|
| `ENABLE_DEMO_HANDLERS` | `false` | Must remain `false` to block synthetic `echo` and `fail` handlers |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global API rate limit window (15 minutes) |
| `RATE_LIMIT_MAX` | `1000` | Global API max requests per window |
| `EXECUTION_RATE_LIMIT_WINDOW_MS` | `60000` | Execution submission quota window (1 minute) |
| `EXECUTION_RATE_LIMIT_MAX` | `60` | Execution submissions allowed per user per minute |
| `MAX_CONCURRENT_EXECUTIONS_PER_USER` | `25` | Maximum active (`pending`, `running`, `retrying`) executions per user |
| `MAX_PAYLOAD_SIZE` | `2mb` | Maximum express request body size |
| `WEBHOOK_REQUEST_TIMEOUT_MS` | `10000` | Maximum overall duration for outbound webhook requests |
| `WEBHOOK_CONNECT_TIMEOUT_MS` | `5000` | Maximum socket connection timeout for outbound webhooks |
| `WEBHOOK_MAX_REDIRECTS` | `3` | Maximum allowed redirect hops |
| `WEBHOOK_MAX_RESPONSE_BYTES` | `1048576` | Maximum response size (1 MB) before automatic truncation |
| `RECOVERY_ENABLED` | `true` | Automated stuck-execution reconciliation enabled |
| `RECOVERY_INTERVAL_MS` | `60000` | Frequency of reconciliation cycles (1 minute) |
| `RECOVERY_STALE_THRESHOLD_MS` | `300000` | Heartbeat age threshold to consider a running job abandoned (5 minutes) |

---

## 4. Step-by-Step Deployment (Option A: Single VPS)

### Step 1: Provision DNS Records
Create an **A Record** with your DNS provider:
- **Type:** `A`
- **Host / Name:** `runnel` (or `@` for apex domain)
- **Value:** `<VPS_PUBLIC_IPV4>`
- **TTL:** 300 seconds

### Step 2: Prepare Host System
```bash
# On your Linux VPS (Ubuntu 22.04 / Debian 12 / Fedora)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git certbot
sudo usermod -aG docker $USER
```

### Step 3: Issue Initial TLS Certificate
```bash
# Obtain Let's Encrypt certificate using standalone certbot
sudo certbot certonly --standalone -d runnel.example.com --agree-tos --email admin@example.com -n
```

### Step 4: Clone Repository & Configure Environment
```bash
git clone https://github.com/goravgumber/Runnel.git
cd Runnel

# Create production environment file
cat <<EOF > .env.production
NODE_ENV=production
FRONTEND_URL=https://runnel.example.com
PUBLIC_API_URL=https://runnel.example.com
JWT_SECRET=$(openssl rand -hex 32)
ENABLE_DEMO_HANDLERS=false
EOF
```

### Step 5: Mount Certificates & Launch Containers
```bash
# Mount host certificates into docker volume or map /etc/letsencrypt in docker-compose.prod.yml
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Step 6: Verify Deployment Health
```bash
# 1. Check container statuses
docker compose -f docker-compose.prod.yml ps

# 2. Check Nginx access and error logs
docker compose -f docker-compose.prod.yml logs nginx

# 3. Test HTTP to HTTPS redirect
curl -I http://runnel.example.com

# 4. Test authenticated healthcheck
curl -I https://runnel.example.com/health/live
```

---

## 5. Backup & Recovery Runbooks

### Automated Database Backup
Run daily via host `cron`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/runnel"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Dump MongoDB to archive
docker compose -f /path/to/Runnel/docker-compose.prod.yml exec -T mongodb mongodump --archive --gzip > "$BACKUP_DIR/mongo_backup_$DATE.gz"

# Retain 14 days of backups
find "$BACKUP_DIR" -type f -name "mongo_backup_*.gz" -mtime +14 -delete
```

### Database Restoration Procedure
To restore from a backup archive:
```bash
docker compose -f docker-compose.prod.yml exec -T mongodb mongorestore --archive --gzip --drop < /var/backups/runnel/mongo_backup_20261013_120000.gz
```

---

## 6. Rollback & Troubleshooting Procedures

### Application Rollback
If a new release encounters unexpected regressions:
1. Revert to the previous Git commit / tag:
   ```bash
   git checkout tags/v1.0.0
   ```
2. Rebuild and restart the application containers:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build backend frontend
   ```
3. Verify `/health/live` returns HTTP 200:
   ```bash
   curl -f https://runnel.example.com/health/live || exit 1
   ```

### Troubleshooting Stuck Jobs
- Check the BullMQ queue state and automated recovery logs:
  ```bash
  docker compose -f docker-compose.prod.yml logs backend | grep -i "\[Recovery\]"
  ```
- If a worker crashes, the automated recovery service will identify abandoned executions after `RECOVERY_STALE_THRESHOLD_MS` (5 minutes) and transition eligible jobs to `retrying` with reason `WORKER_INTERRUPTED`.
