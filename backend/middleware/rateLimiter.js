const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { createResilientRateLimitStore } = require("./resilientRateLimitStore");
const redisClient = require("../config/redis");
const logger = require("../config/logger");
const config = require("../config/env");

const generateExecutionKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
};

const createLimiter = (options) => {
  if (process.env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMITER && !options?.forceEnable) {
    return (_req, _res, next) => next();
  }
  const opts = typeof options === "number" ? { limit: options } : options;
  const limit = opts.limit;
  const prefix = opts.prefix || "rate-limit:";
  const windowMs = opts.windowMs || 15 * 60 * 1000;
  const message = opts.message || "Too many requests. Please wait before trying again.";
  const keyGenerator = opts.keyGenerator;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || undefined,
    store: createResilientRateLimitStore({
      prefix,
      windowMs,
      redisClient,
      logger,
    }),
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message,
        },
        message,
      });
    },
  });
};

const loginLimiter = createLimiter({
  limit: 50,
  prefix: "rate-limit:login:",
  windowMs: 15 * 60 * 1000,
  message: "Too many authentication attempts. Please wait 15 minutes before trying again.",
});

const registerLimiter = createLimiter({
  limit: 100,
  prefix: "rate-limit:register:",
  windowMs: 15 * 60 * 1000,
  message: "Too many account registrations from this IP. Please wait before trying again.",
});

const executionSubmitLimiter = createLimiter({
  limit: config.EXECUTION_RATE_LIMIT_MAX || 60,
  prefix: "rate-limit:exec-submit:",
  windowMs: config.EXECUTION_RATE_LIMIT_WINDOW_MS || 60000,
  message: "Execution submission quota exceeded. Please slow down your request rate.",
  keyGenerator: generateExecutionKey,
});

module.exports = {
  loginLimiter,
  registerLimiter,
  executionSubmitLimiter,
  generateExecutionKey,
  createLimiter,
};

