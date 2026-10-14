const redisClient = require("../config/redis");
const logger = require("./logger");

const REDIS_OP_TIMEOUT_MS = 2000;

const isClientReady = () => {
  if (!redisClient) return false;
  if (redisClient.isTestStub) return true;
  return redisClient.status === "ready";
};

const executeWithTimeout = async (opFn, timeoutMs = REDIS_OP_TIMEOUT_MS) => {
  if (!isClientReady()) {
    throw new Error(`Redis client not ready (status: ${redisClient?.status || "unavailable"})`);
  }
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Redis operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([opFn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

const blacklistToken = async (token, expirySeconds) => {
  if (!token || expirySeconds <= 0 || !isClientReady()) return false;
  try {
    await executeWithTimeout(() => redisClient.blacklistToken(token, expirySeconds));
    return true;
  } catch (error) {
    logger.error("Failed to blacklist token: %s", error.message);
    return false;
  }
};

const isTokenBlacklisted = async (token) => {
  if (!token || !isClientReady()) return false;
  try {
    return await executeWithTimeout(() => redisClient.isTokenBlacklisted(token));
  } catch (error) {
    logger.error("Failed to check if token is blacklisted: %s", error.message);
    return false;
  }
};

const storeRefreshToken = async (userId, tokenId, ttlSeconds) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready (status: %s); cannot store refresh token", redisClient?.status || "unavailable");
    return false;
  }
  try {
    await executeWithTimeout(() =>
      redisClient.set(`refresh:${userId}:${tokenId}`, "active", "EX", ttlSeconds)
    );
    return true;
  } catch (error) {
    logger.error("Failed to store refresh token: %s", error.message);
    return false;
  }
};

const isRefreshTokenActive = async (userId, tokenId) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready; cannot verify refresh token state");
    return false;
  }
  try {
    const result = await executeWithTimeout(() =>
      redisClient.get(`refresh:${userId}:${tokenId}`)
    );
    return result === "active";
  } catch (error) {
    logger.error("Failed to check refresh token: %s", error.message);
    return false;
  }
};

const rotateRefreshToken = async (userId, tokenId, successorPayload, graceTtlSeconds = 30) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready; cannot rotate refresh token");
    return false;
  }
  try {
    const data = JSON.stringify({ status: "rotated", successor: successorPayload });
    await executeWithTimeout(() =>
      redisClient.set(`refresh:${userId}:${tokenId}`, data, "EX", graceTtlSeconds)
    );
    return true;
  } catch (error) {
    logger.error("Failed to mark refresh token as rotated: %s", error.message);
    return false;
  }
};

const getRefreshTokenStatus = async (userId, tokenId) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready (status: %s); cannot check refresh token status", redisClient?.status || "unavailable");
    return { status: "error" };
  }
  try {
    const raw = await executeWithTimeout(() =>
      redisClient.get(`refresh:${userId}:${tokenId}`)
    );
    if (!raw) return { status: "inactive" };
    if (raw === "active") return { status: "active" };
    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return { status: "inactive" };
    }
  } catch (error) {
    logger.error("Failed to check refresh token status: %s", error.message);
    return { status: "error" };
  }
};

const revokeRefreshToken = async (userId, tokenId) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready; cannot revoke refresh token");
    return false;
  }
  try {
    await executeWithTimeout(() =>
      redisClient.del(`refresh:${userId}:${tokenId}`)
    );
    return true;
  } catch (error) {
    logger.error("Failed to revoke refresh token: %s", error.message);
    return false;
  }
};

const revokeAllRefreshTokens = async (userId) => {
  if (!isClientReady()) {
    logger.warn("Redis client not ready; cannot revoke refresh token family");
    return false;
  }
  try {
    const keys = await executeWithTimeout(() =>
      redisClient.keys(`refresh:${userId}:*`)
    );
    if (keys && keys.length) {
      await executeWithTimeout(() => redisClient.del(...keys));
    }
    return true;
  } catch (error) {
    logger.error("Failed to revoke refresh token family: %s", error.message);
    return false;
  }
};

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  storeRefreshToken,
  isRefreshTokenActive,
  rotateRefreshToken,
  getRefreshTokenStatus,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
