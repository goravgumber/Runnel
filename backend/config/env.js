const path = require("path");
const dotenv = require("dotenv");
const { z } = require("zod");
const logger = require("./logger");

// Load root .env or backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/ecosystem"),
  JWT_SECRET: z.string().min(12, "JWT_SECRET must be at least 12 characters").default("development_fallback_secret_key_9999"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  ML_SERVICE_URL: z.string().url("ML_SERVICE_URL must be a valid URL").optional(),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL").optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  SIMULATION_SERVICE_URL: z.string().default("http://localhost:3001"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error("Environment validation failed:");
  parsed.error.errors.forEach((err) => {
    logger.error(`- ${err.path.join(".")}: ${err.message}`);
  });
  process.exit(1);
}

module.exports = parsed.data;
