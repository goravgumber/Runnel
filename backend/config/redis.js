const Redis = require("ioredis");
const config = require("./env");
const logger = require("../utils/logger");

const isTestWithoutRedis = process.env.NODE_ENV === "test" && !process.env.TEST_WITH_REDIS;
const redisUrl = process.env.REDIS_URL || config.REDIS_URL;

let isShuttingDown = false;

const calculateRetryDelay = (times, options = {}) => {
  if (options.isShuttingDown || isShuttingDown) {
    return null;
  }
  // Bounded exponential backoff with jitter: 100ms * (1.5 ^ min(times, 10)), capped at 5000ms
  const baseDelay = Math.min(100 * Math.pow(1.5, Math.min(times, 10)), 5000);
  const jitter = typeof options.jitter === "number" ? options.jitter : Math.floor(Math.random() * 200);
  return Math.min(Math.round(baseDelay + jitter), 5000);
};

let redisClient = null;

if (!isTestWithoutRedis) {
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times) => calculateRetryDelay(times),
  });

  redisClient.on("connecting", () => {
    logger.info("Connecting to Redis...");
  });

  redisClient.on("reconnecting", (delay) => {
    logger.info(`Reconnecting to Redis in ${delay}ms...`);
  });

  redisClient.on("ready", () => {
    logger.info("Redis connected and ready");
  });

  redisClient.on("end", () => {
    logger.info("Redis connection closed");
  });

  redisClient.on("error", (error) => {
    // Redact any potential credentials from error message
    const rawMessage = error?.message || "Unknown Redis error";
    const safeMessage = rawMessage.replace(/:\/\/([^:@\s]+):([^@\s]+)@/g, "://$1:[REDACTED]@");
    logger.error("Redis error: %s", safeMessage);
  });

  const originalQuit = redisClient.quit.bind(redisClient);
  redisClient.quit = async () => {
    isShuttingDown = true;
    return originalQuit();
  };

  const originalDisconnect = redisClient.disconnect.bind(redisClient);
  redisClient.disconnect = (reconnect) => {
    if (reconnect === false) {
      isShuttingDown = true;
    }
    return originalDisconnect(reconnect);
  };

  redisClient.blacklistToken = async (token, ttlSeconds) => {
    if (!token || ttlSeconds <= 0) return false;
    await redisClient.set(`blacklist:${token}`, "true", "EX", ttlSeconds);
    return true;
  };

  redisClient.isTokenBlacklisted = async (token) => {
    if (!token) return false;
    return (await redisClient.get(`blacklist:${token}`)) === "true";
  };
} else {
  // Stub for isolated test environments without a running Redis instance
  const memoryStore = new Map();
  redisClient = {
    status: "end",
    isTestStub: true,
    on: () => {},
    blacklistToken: async (token) => {
      memoryStore.set(`blacklist:${token}`, "true");
      return true;
    },
    isTokenBlacklisted: async (token) => {
      return memoryStore.get(`blacklist:${token}`) === "true";
    },
    get: async (key) => memoryStore.get(key) || null,
    set: async (key, val) => {
      memoryStore.set(key, val);
      return "OK";
    },
    del: async (...keys) => {
      keys.forEach((k) => memoryStore.delete(k));
      return 1;
    },
    keys: async (pattern) => {
      const prefix = pattern.replace("*", "");
      return Array.from(memoryStore.keys()).filter((k) => k.startsWith(prefix));
    },
    quit: async () => {},
    disconnect: () => {},
  };
}

// Attach calculateRetryDelay for unit test verification
redisClient.calculateRetryDelay = calculateRetryDelay;

module.exports = redisClient;
