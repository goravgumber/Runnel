const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const redisClient = require("../../config/redis");
const { generateExecutionKey } = require("../../middleware/rateLimiter");

describe("Startup, Queue Resilience & Rate Limiting (Phase 19 Regression Suite)", () => {
  after(async () => {
    if (redisClient && typeof redisClient.quit === "function") {
      try {
        await redisClient.quit();
      } catch (_) {}
    }
  });
  describe("1. Redis Retry Strategy & Reconnection Resilience", () => {
    it("continues reconnection attempts after more than 5 attempts", () => {
      const calculateDelay = redisClient.calculateRetryDelay;
      assert.equal(typeof calculateDelay, "function");

      // Verify attempts 1 through 5 return valid integer delays
      for (let t = 1; t <= 5; t++) {
        const delay = calculateDelay(t, { jitter: 50 });
        assert.ok(typeof delay === "number" && delay > 0, `Attempt ${t} should return positive delay`);
        assert.ok(delay <= 5000, "Delay should be bounded");
      }

      // Verify attempts beyond 5 continue (do NOT return null)
      for (const t of [6, 7, 10, 25, 50, 100]) {
        const delay = calculateDelay(t, { jitter: 50 });
        assert.ok(
          typeof delay === "number" && delay > 0,
          `Attempt ${t} must continue reconnecting with a positive delay`
        );
      }
    });

    it("enforces a bounded delay ceiling and applies backoff", () => {
      const calculateDelay = redisClient.calculateRetryDelay;
      const delayAt1 = calculateDelay(1, { jitter: 0 });
      const delayAt5 = calculateDelay(5, { jitter: 0 });
      const delayAt10 = calculateDelay(10, { jitter: 0 });
      const delayAt100 = calculateDelay(100, { jitter: 0 });

      assert.ok(delayAt5 > delayAt1, "Delay should increase with attempt count");
      assert.ok(delayAt10 >= delayAt5, "Delay should back off up to ceiling");
      assert.equal(delayAt10, 5000, "Delay at attempt 10 should cap at 5000ms");
      assert.equal(delayAt100, 5000, "Delay at attempt 100 must remain capped at 5000ms");
    });

    it("stops reconnecting when shutdown is intentional", () => {
      const calculateDelay = redisClient.calculateRetryDelay;
      const delay = calculateDelay(1, { isShuttingDown: true });
      assert.equal(delay, null, "Should return null to stop reconnecting when shutting down");
    });
  });

  describe("2. Rate Limiting Key Normalization & Namespace Isolation", () => {
    it("normalizes IPv6 addresses using express-rate-limit ipKeyGenerator", () => {
      const reqIpv6A = { ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334" };
      const reqIpv6B = { ip: "2001:0db8:85a3:0000:0000:8a2e:0370:0001" };

      const keyA = generateExecutionKey(reqIpv6A);
      const keyB = generateExecutionKey(reqIpv6B);

      assert.ok(keyA.startsWith("ip:"), "Key should be namespaced with 'ip:'");
      // Both IPv6 addresses belong to the same /56 subnet, normalized by ipKeyGenerator
      assert.equal(keyA, keyB, "IPv6 addresses in same subnet should normalize to prevent bypass");
      assert.equal(keyA, "ip:2001:db8:85a3::/56");
    });

    it("normalizes standard IPv4 addresses", () => {
      const reqIpv4 = { ip: "192.168.1.50" };
      const key = generateExecutionKey(reqIpv4);
      assert.equal(key, "ip:192.168.1.50");
    });

    it("isolates authenticated user keys from IP fallback keys", () => {
      const reqUser = { user: { id: "user_789" }, ip: "192.168.1.50" };
      const reqAnon = { ip: "192.168.1.50" };

      const userKey = generateExecutionKey(reqUser);
      const ipKey = generateExecutionKey(reqAnon);

      assert.equal(userKey, "user:user_789");
      assert.equal(ipKey, "ip:192.168.1.50");
      assert.notEqual(userKey, ipKey, "User key and IP key must be namespaced and never collide");
    });
  });

  describe("3. Bull Board Dynamic Queue Registration & 503 Fallback", () => {
    it("initializes Bull Board cleanly without crashing when queue is initially null", () => {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath("/admin/queues");

      // Verify createBullBoard succeeds with empty queues array
      let board;
      assert.doesNotThrow(() => {
        board = createBullBoard({ queues: [], serverAdapter });
      }, "Bull Board must initialize with empty queue array without throwing");

      assert.ok(board);
      assert.equal(typeof board.addQueue, "function");
    });

    it("returns 503 Service Unavailable when admin requests /admin/queues while queue is unavailable", async () => {
      const app = express();
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath("/admin/queues");
      createBullBoard({ queues: [], serverAdapter });

      let mockQueue = null; // Simulates unavailable Redis
      let isRegistered = false;

      const ensureQueueRegistered = () => {
        if (isRegistered) return true;
        if (mockQueue) {
          isRegistered = true;
          return true;
        }
        return false;
      };

      // Mock admin authorization middleware
      const mockRequireAdmin = (req, res, next) => {
        if (req.headers["x-role"] !== "admin") {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
        next();
      };

      app.use(
        "/admin/queues",
        mockRequireAdmin,
        (req, res, next) => {
          if (!ensureQueueRegistered()) {
            return res.status(503).json({
              status: "fail",
              code: "QUEUE_UNAVAILABLE",
              message: "Queue system is temporarily unavailable. Background processing and metrics will resume once Redis reconnects.",
            });
          }
          next();
        },
        serverAdapter.getRouter()
      );

      // Non-admin is blocked with 403
      const forbiddenRes = await request(app).get("/admin/queues");
      assert.equal(forbiddenRes.status, 403);

      // Authorized admin receives 503 while queue is unavailable
      const unavailableRes = await request(app)
        .get("/admin/queues")
        .set("x-role", "admin");

      assert.equal(unavailableRes.status, 503);
      assert.equal(unavailableRes.body.status, "fail");
      assert.equal(unavailableRes.body.code, "QUEUE_UNAVAILABLE");
      assert.match(unavailableRes.body.message, /temporarily unavailable/i);
    });

    it("registers queue when it becomes available without duplicate registration on repeated calls", () => {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath("/admin/queues");
      const board = createBullBoard({ queues: [], serverAdapter });

      let registeredCount = 0;
      let isRegistered = false;

      // Mock a BullMQ queue object
      const fakeQueue = {
        name: "runnel-executions",
        opts: { prefix: "bull" },
        toKey: (k) => `bull:runnel-executions:${k}`,
        metaValues: { version: "bullmq:5.0.0" },
      };

      const ensureQueueRegistered = (queue) => {
        if (isRegistered) return true;
        if (queue) {
          board.addQueue(new BullMQAdapter(queue));
          isRegistered = true;
          registeredCount++;
          return true;
        }
        return false;
      };

      // Initial call with null returns false
      assert.equal(ensureQueueRegistered(null), false);
      assert.equal(registeredCount, 0);

      // Call when queue becomes available registers once
      assert.equal(ensureQueueRegistered(fakeQueue), true);
      assert.equal(registeredCount, 1);

      // Repeated calls do NOT register duplicates
      assert.equal(ensureQueueRegistered(fakeQueue), true);
      assert.equal(ensureQueueRegistered(fakeQueue), true);
      assert.equal(registeredCount, 1, "Queue must only be registered once");
    });
  });

  describe("4. MongoDB Driver Options Verification", () => {
    it("ensures useNewUrlParser and useUnifiedTopology are removed from backend/server.js", () => {
      const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.js"), "utf8");

      assert.ok(
        !serverCode.includes("useNewUrlParser"),
        "server.js must not contain deprecated useNewUrlParser flag"
      );
      assert.ok(
        !serverCode.includes("useUnifiedTopology"),
        "server.js must not contain deprecated useUnifiedTopology flag"
      );
      assert.match(
        serverCode,
        /serverSelectionTimeoutMS:\s*\d+/,
        "server.js should retain serverSelectionTimeoutMS"
      );
    });
  });
});
