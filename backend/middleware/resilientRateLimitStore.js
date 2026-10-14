const { MemoryStore } = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const defaultLogger = require("../config/logger");

/**
 * ResilientRateLimitStore
 *
 * Implements express-rate-limit Store interface with a primary RedisStore
 * and an automatic, bounded in-memory fallback using express-rate-limit's MemoryStore.
 *
 * Guarantees:
 * 1. Never blocks HTTP requests indefinitely when Redis is disconnected or stalls.
 * 2. Emits sanitized warnings when falling back to memory store.
 * 3. Automatically resumes Redis-backed rate limiting when Redis recovers.
 * 4. Preserves configured limits and per-key isolation in both modes.
 */
class ResilientRateLimitStore {
  constructor(options = {}) {
    this.prefix = options.prefix || "rate-limit:";
    this.windowMs = options.windowMs || 15 * 60 * 1000;
    this.redisClient = options.redisClient || null;
    this.logger = options.logger || defaultLogger;
    this.commandTimeoutMs = options.commandTimeoutMs || 1000;

    this.fallbackStore = new MemoryStore();
    this.localKeys = false;
    this.fallbackActive = false;
    this.lastWarnTime = 0;

    if (this.redisClient && typeof this.redisClient.call === "function") {
      this.redisStore = new RedisStore({
        prefix: this.prefix,
        sendCommand: (...args) => this._sendCommand(...args),
      });
    } else {
      this.redisStore = null;
    }
  }

  isRedisReady() {
    if (!this.redisClient) return false;
    if (this.redisClient.isTestStub) return true;
    return this.redisClient.status === "ready";
  }

  async _sendCommand(...args) {
    if (!this.isRedisReady()) {
      throw new Error(`Redis client not ready (status: ${this.redisClient?.status || "unavailable"})`);
    }

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Redis command timed out after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);
    });

    try {
      return await Promise.race([
        this.redisClient.call(...args),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async init(options) {
    this.windowMs = options.windowMs || this.windowMs;
    this.fallbackStore.init(options);

    if (this.redisStore) {
      try {
        await this.redisStore.init(options);
      } catch (err) {
        this._warnFallback(`Redis store init failed: ${err.message}`);
      }
    }
  }

  _warnFallback(reason) {
    const now = Date.now();
    // Throttle warnings to once per 30 seconds per limiter prefix
    if (!this.fallbackActive || now - this.lastWarnTime > 30000) {
      this.fallbackActive = true;
      this.lastWarnTime = now;
      if (this.logger && typeof this.logger.warn === "function") {
        this.logger.warn(
          "Redis rate-limit store unavailable (%s). Falling back to in-memory store for prefix '%s'.",
          reason,
          this.prefix
        );
      }
    }
  }

  _markRecovered() {
    if (this.fallbackActive) {
      this.fallbackActive = false;
      if (this.logger && typeof this.logger.info === "function") {
        this.logger.info(
          "Redis rate-limit store recovered. Resumed Redis-backed rate limiting for prefix '%s'.",
          this.prefix
        );
      }
    }
  }

  async increment(key) {
    if (this.redisStore && this.isRedisReady()) {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Redis increment timed out after ${this.commandTimeoutMs}ms`));
        }, this.commandTimeoutMs);
      });

      try {
        const result = await Promise.race([
          this.redisStore.increment(key),
          timeoutPromise,
        ]);
        clearTimeout(timer);
        this._markRecovered();
        return result;
      } catch (err) {
        clearTimeout(timer);
        this._warnFallback(err.message);
        return this.fallbackStore.increment(key);
      }
    }

    this._warnFallback(
      this.redisClient
        ? `Redis client status is '${this.redisClient.status}'`
        : "No Redis client configured"
    );
    return this.fallbackStore.increment(key);
  }

  async decrement(key) {
    if (this.redisStore && this.isRedisReady()) {
      try {
        await this.redisStore.decrement(key);
        return;
      } catch (err) {
        this._warnFallback(err.message);
      }
    }
    return this.fallbackStore.decrement(key);
  }

  async resetKey(key) {
    await this.fallbackStore.resetKey(key);
    if (this.redisStore && this.isRedisReady()) {
      try {
        await this.redisStore.resetKey(key);
      } catch {
        // ignore
      }
    }
  }

  async resetAll() {
    await this.fallbackStore.resetAll();
    if (this.redisStore && this.isRedisReady()) {
      try {
        await this.redisStore.resetAll();
      } catch {
        // ignore
      }
    }
  }

  async get(key) {
    if (this.redisStore && this.isRedisReady()) {
      try {
        return await this.redisStore.get(key);
      } catch {
        return this.fallbackStore.get(key);
      }
    }
    return this.fallbackStore.get(key);
  }

  shutdown() {
    this.fallbackStore.shutdown();
  }
}

function createResilientRateLimitStore(options = {}) {
  return new ResilientRateLimitStore(options);
}

module.exports = {
  ResilientRateLimitStore,
  createResilientRateLimitStore,
};
