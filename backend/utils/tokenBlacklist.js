const redisClient = require("../config/redis");
const logger = require("./logger");

const blacklistToken = async (token, expirySeconds) => {
  try {
    return await redisClient.blacklistToken(token, expirySeconds);
  } catch (error) {
    logger.error("Failed to blacklist token: %s", error.message);
    return false;
  }
};

const isTokenBlacklisted = async (token) => {
  try {
    return await redisClient.isTokenBlacklisted(token);
  } catch (error) {
    logger.error("Failed to check if token is blacklisted: %s", error.message);
    return false;
  }
};

const storeRefreshToken = async (userId, tokenId, ttlSeconds) => {
  if (!redisClient) return false;
  try {
    await redisClient.set(`refresh:${userId}:${tokenId}`, "active", "EX", ttlSeconds);
    return true;
  } catch (error) {
    logger.error("Failed to store refresh token: %s", error.message);
    return false;
  }
};

const isRefreshTokenActive = async (userId, tokenId) => {
  if (!redisClient) return true;
  try {
    const result = await redisClient.get(`refresh:${userId}:${tokenId}`);
    return result === "active";
  } catch (error) {
    logger.error("Failed to check refresh token: %s", error.message);
    return false;
  }
};

const rotateRefreshToken = async (userId, tokenId, successorPayload, graceTtlSeconds = 30) => {
  if (!redisClient) return false;
  try {
    const data = JSON.stringify({ status: "rotated", successor: successorPayload });
    await redisClient.set(`refresh:${userId}:${tokenId}`, data, "EX", graceTtlSeconds);
    return true;
  } catch (error) {
    logger.error("Failed to mark refresh token as rotated: %s", error.message);
    return false;
  }
};

const getRefreshTokenStatus = async (userId, tokenId) => {
  if (!redisClient) return { status: "active" };
  try {
    const raw = await redisClient.get(`refresh:${userId}:${tokenId}`);
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
  if (!redisClient) return false;
  try {
    await redisClient.del(`refresh:${userId}:${tokenId}`);
    return true;
  } catch (error) {
    logger.error("Failed to revoke refresh token: %s", error.message);
    return false;
  }
};

const revokeAllRefreshTokens = async (userId) => {
  if (!redisClient) return false;
  try {
    const keys = await redisClient.keys(`refresh:${userId}:*`);
    if (keys.length) await redisClient.del(...keys);
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
