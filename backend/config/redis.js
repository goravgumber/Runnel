const Redis = require("ioredis");
const config = require("./env");
const logger = require("../utils/logger");

const isTestWithoutRedis = process.env.NODE_ENV === "test" && !process.env.TEST_WITH_REDIS;
const redisUrl = process.env.REDIS_URL || config.REDIS_URL;

let redisClient = null;

if (!isTestWithoutRedis) {
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 100, 2000)),
  });

  redisClient.on("ready", () => {
    logger.info("Redis connected");
  });

  redisClient.on("error", (error) => {
    logger.error("Redis error: %s", error.message);
  });

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
  redisClient = {
    status: "end",
    on: () => {},
    blacklistToken: async () => false,
    isTokenBlacklisted: async () => false,
    get: async () => null,
    set: async () => false,
    del: async () => false,
    keys: async () => [],
    quit: async () => {},
  };
}

module.exports = redisClient;
