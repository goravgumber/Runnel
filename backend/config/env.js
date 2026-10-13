const path = require("path");
const dotenv = require("dotenv");
const { z } = require("zod");
const logger = require("./logger");

// Load root .env or backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DISALLOWED_PRODUCTION_SECRETS = [
  "development_fallback_secret_key_9999",
  "replace_with_a_secure_random_string_min_32_characters",
  "dev-secret-change-in-production",
  "changeme",
  "secret",
];

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/runnel"),
    JWT_SECRET: z.string().min(12, "JWT_SECRET must be at least 12 characters").default("development_fallback_secret_key_9999"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL").optional(),
    PUBLIC_API_URL: z.string().default("http://localhost:5000"),
    ENABLE_DEMO_HANDLERS: z.coerce.boolean().default(false),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    RECOVERY_ENABLED: z.coerce.boolean().default(true),
    RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
    RECOVERY_STALE_THRESHOLD_MS: z.coerce.number().int().positive().default(300000),
    RECOVERY_LOCK_TTL_MS: z.coerce.number().int().positive().default(30000),
    RECOVERY_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    EXECUTION_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    EXECUTION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    MAX_CONCURRENT_EXECUTIONS_PER_USER: z.coerce.number().int().positive().default(25),
    MAX_PAYLOAD_SIZE: z.string().default("2mb"),
    WEBHOOK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    WEBHOOK_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    WEBHOOK_MAX_REDIRECTS: z.coerce.number().int().positive().default(3),
    WEBHOOK_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(1048576),
  })
  .superRefine((data, ctx) => {
    // In production, reject weak, placeholder, or default development secrets
    if (data.NODE_ENV === "production") {
      const isDisallowed =
        !process.env.JWT_SECRET ||
        DISALLOWED_PRODUCTION_SECRETS.some((disallowed) =>
          data.JWT_SECRET.toLowerCase().includes(disallowed.toLowerCase())
        );

      if (isDisallowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET cannot use default or example placeholder secrets in production",
          path: ["JWT_SECRET"],
        });
      } else if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET must be at least 32 characters in production",
          path: ["JWT_SECRET"],
        });
      }
    }
  });

// Set default ENABLE_DEMO_HANDLERS to true in development/test if not explicitly specified
if (process.env.ENABLE_DEMO_HANDLERS === undefined && process.env.NODE_ENV !== "production") {
  process.env.ENABLE_DEMO_HANDLERS = "true";
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error("Environment validation failed:");
  parsed.error.errors.forEach((err) => {
    logger.error(`- ${err.path.join(".")}: ${err.message}`);
  });
  process.exit(1);
}

module.exports = parsed.data;
