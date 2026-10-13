const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const redisClient = require("../config/redis");

const createLimiter = (limit, prefix) => {
  if (process.env.NODE_ENV === "test") {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store:
      redisClient && typeof redisClient.call === "function"
        ? new RedisStore({
            prefix,
            sendCommand: (...args) => redisClient.call(...args),
          })
        : undefined,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: "Too many authentication attempts, please try again later.",
      });
    },
  });
};

const loginLimiter = createLimiter(50, "rate-limit:login:");
const registerLimiter = createLimiter(100, "rate-limit:register:");

module.exports = {
  loginLimiter,
  registerLimiter,
};
