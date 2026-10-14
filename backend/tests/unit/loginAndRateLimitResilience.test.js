const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { ResilientRateLimitStore } = require("../../middleware/resilientRateLimitStore");
const { createLimiter, generateExecutionKey } = require("../../middleware/rateLimiter");
const authService = require("../../services/authService");
const User = require("../../models/User");
const redisClient = require("../../config/redis");
const tokenBlacklist = require("../../utils/tokenBlacklist");
const { setupTestDb, teardownTestDb } = require("../helpers/testSetup");

describe("Runnel Phase 20 — Login Hang & Rate Limit Resilience Regression Suite", () => {
  let createdTestUserId = null;
  const testUsername = `resilience_user_${Date.now()}`;
  const testPassword = "ValidPassword123!";

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    if (createdTestUserId) {
      try {
        await User.findByIdAndDelete(createdTestUserId);
      } catch (_) {}
    }
    await teardownTestDb();
  });

  describe("1. Resilient Rate Limit Store & Redis Disconnection", () => {
    it("immediately falls back to in-memory store when Redis is disconnected without blocking", async () => {
      const mockDisconnectedRedis = {
        status: "reconnecting",
        call: async () => {
          throw new Error("Should not be called when disconnected");
        },
      };

      const warnedMessages = [];
      const mockLogger = {
        warn: (msg, ...args) => warnedMessages.push(args.length ? `${msg} ${args.join(" ")}` : msg),
        info: () => {},
        error: () => {},
      };

      const store = new ResilientRateLimitStore({
        prefix: "test:disconnected:",
        windowMs: 60000,
        redisClient: mockDisconnectedRedis,
        logger: mockLogger,
        commandTimeoutMs: 100,
      });

      await store.init({ windowMs: 60000 });

      const startTime = Date.now();
      const res1 = await store.increment("user:123");
      const hits1 = res1.totalHits;
      const res2 = await store.increment("user:123");
      const hits2 = res2.totalHits;
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 200, `Expected immediate in-memory return, took ${elapsed}ms`);
      assert.equal(hits1, 1);
      assert.equal(hits2, 2);
      assert.equal(store.fallbackActive, true);
      assert.ok(warnedMessages.length > 0, "Expected sanitized warning when falling back");

      store.shutdown();
    });

    it("bounds execution when Redis command stalls and times out", async () => {
      // Simulate a hanging command that never resolves
      const mockHangingRedis = {
        status: "ready",
        call: () => new Promise(() => {}),
      };

      const store = new ResilientRateLimitStore({
        prefix: "test:timeout:",
        windowMs: 60000,
        redisClient: mockHangingRedis,
        commandTimeoutMs: 50,
      });

      await store.init({ windowMs: 60000 });

      const startTime = Date.now();
      const res = await store.increment("ip:10.0.0.1");
      const elapsed = Date.now() - startTime;

      // Must abort command after ~50ms and complete via fallback
      assert.ok(elapsed >= 45 && elapsed < 500, `Expected ~50ms timeout fallback, took ${elapsed}ms`);
      assert.equal(res.totalHits, 1);
      assert.equal(store.fallbackActive, true);

      store.shutdown();
    });

    it("preserves per-user and per-IP isolation under in-memory fallback", async () => {
      const store = new ResilientRateLimitStore({
        prefix: "test:isolation:",
        windowMs: 60000,
        redisClient: null,
      });

      await store.init({ windowMs: 60000 });

      // Simulate 5 hits for user:alice
      for (let i = 0; i < 5; i++) {
        await store.increment("user:alice");
      }

      // Check user:bob has independent count
      const bobRes = await store.increment("user:bob");
      assert.equal(bobRes.totalHits, 1);

      // Check ip:192.0.2.1 has independent count
      const ip1Res = await store.increment("ip:192.0.2.1");
      assert.equal(ip1Res.totalHits, 1);

      // Check ip:192.0.2.2 has independent count
      const ip2Res = await store.increment("ip:192.0.2.2");
      assert.equal(ip2Res.totalHits, 1);

      // User alice should be at 5
      const aliceCheck = await store.get("user:alice");
      assert.equal(aliceCheck.totalHits, 5);

      store.shutdown();
    });

    it("resumes Redis-backed rate limiting when Redis recovers", async () => {
      let redisReady = false;
      let redisHits = 0;

      const mockRecoveringRedis = {
        get status() {
          return redisReady ? "ready" : "reconnecting";
        },
        call: async (cmd, ...args) => {
          if (cmd === "SCRIPT") {
            return "mock_script_sha";
          }
          if (cmd === "EVAL" || cmd === "EVALSHA") {
            redisHits++;
            // Returns [totalHits, resetTimeMs] in rate-limit-redis format
            return [redisHits, Date.now() + 60000];
          }
          return "OK";
        },
      };

      const infoLogs = [];
      const mockLogger = {
        warn: () => {},
        info: (msg, ...args) => infoLogs.push(args.length ? `${msg} ${args.join(" ")}` : msg),
        error: () => {},
      };

      const store = new ResilientRateLimitStore({
        prefix: "test:recover:",
        windowMs: 60000,
        redisClient: mockRecoveringRedis,
        logger: mockLogger,
        commandTimeoutMs: 100,
      });

      await store.init({ windowMs: 60000 });

      // 1. Initial hit while disconnected -> uses fallback
      const hit1 = await store.increment("client:test");
      assert.equal(hit1.totalHits, 1);
      assert.equal(store.fallbackActive, true);
      assert.equal(redisHits, 0);

      // 2. Redis recovers
      redisReady = true;

      // 3. Next hit -> uses RedisStore
      const hit2 = await store.increment("client:test");
      assert.equal(redisHits, 1);
      assert.equal(store.fallbackActive, false);
      assert.ok(infoLogs.some((m) => m.includes("recovered")), "Expected recovery log message");

      store.shutdown();
    });
  });

  describe("2. Authentication Dependencies & Session Persistence", () => {
    it("handles wrong password with an appropriate 401 response and does not hang", async () => {
      // First ensure user exists in test db
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      const user = await User.create({
        username: testUsername,
        password: hashedPassword,
        role: "user",
      });
      createdTestUserId = user._id;

      // Attempt login with incorrect password
      await assert.rejects(
        async () => {
          await authService.login({
            username: testUsername,
            password: "WrongPassword999!",
          });
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.ok(err.message.includes("Incorrect password"));
          return true;
        }
      );
    });

    it("handles non-existent user with an appropriate 401 response", async () => {
      await assert.rejects(
        async () => {
          await authService.login({
            username: "non_existent_user_99999",
            password: "AnyPassword123!",
          });
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.ok(err.message.includes("No account found"));
          return true;
        }
      );
    });

    it("returns 503 SERVICE_UNAVAILABLE when session state cannot be persisted safely", async () => {
      // Temporarily mark redis client as offline so token storage fails
      const originalStatus = redisClient.status;
      const originalIsStub = redisClient.isTestStub;

      redisClient.status = "disconnected";
      redisClient.isTestStub = false;

      try {
        await assert.rejects(
          async () => {
            await authService.login({
              username: testUsername,
              password: testPassword,
            });
          },
          (err) => {
            assert.equal(err.statusCode, 503);
            assert.equal(err.errorCode, "SERVICE_UNAVAILABLE");
            assert.ok(err.message.includes("temporarily unavailable"));
            return true;
          }
        );
      } finally {
        redisClient.status = originalStatus;
        redisClient.isTestStub = originalIsStub;
      }
    });

    it("successfully logs in when MongoDB and session store are healthy", async () => {
      const result = await authService.login({
        username: testUsername,
        password: testPassword,
      });

      assert.ok(result.token, "Expected valid access token");
      assert.ok(result.refreshToken, "Expected valid refresh token");
      assert.equal(result.user.username, testUsername);
    });

    it("successfully signs up when MongoDB and session store are healthy", async () => {
      const newUsername = `signup_test_${Date.now()}`;
      const result = await authService.signup({
        username: newUsername,
        password: testPassword,
      });

      assert.ok(result.token);
      assert.ok(result.refreshToken);
      assert.equal(result.user.username, newUsername);

      // Clean up created user
      await User.deleteOne({ username: newUsername });
    });
  });

  describe("3. Token Blacklist & State Verification Safety", () => {
    it("returns false from storeRefreshToken when Redis is unavailable without blocking", async () => {
      const originalStatus = redisClient.status;
      const originalIsStub = redisClient.isTestStub;

      redisClient.status = "reconnecting";
      redisClient.isTestStub = false;

      try {
        const startTime = Date.now();
        const stored = await tokenBlacklist.storeRefreshToken("user_1", "token_1", 3600);
        const elapsed = Date.now() - startTime;

        assert.equal(stored, false);
        assert.ok(elapsed < 100, `Expected fast return without hanging, took ${elapsed}ms`);
      } finally {
        redisClient.status = originalStatus;
        redisClient.isTestStub = originalIsStub;
      }
    });

    it("returns { status: 'error' } from getRefreshTokenStatus when Redis is unavailable", async () => {
      const originalStatus = redisClient.status;
      const originalIsStub = redisClient.isTestStub;

      redisClient.status = "disconnected";
      redisClient.isTestStub = false;

      try {
        const status = await tokenBlacklist.getRefreshTokenStatus("user_1", "token_1");
        assert.equal(status.status, "error");
      } finally {
        redisClient.status = originalStatus;
        redisClient.isTestStub = originalIsStub;
      }
    });
  });
});
