const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const winston = require("winston");

describe("Production Logger Configuration & Transports", () => {
  const origNodeEnv = process.env.NODE_ENV;

  const loadFreshLogger = (env) => {
    process.env.NODE_ENV = env;
    const loggerPath = require.resolve("../../config/logger");
    delete require.cache[loggerPath];
    return require("../../config/logger");
  };

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    const loggerPath = require.resolve("../../config/logger");
    delete require.cache[loggerPath];
  });

  it("configures Console transport and retains File transports in production", () => {
    const logger = loadFreshLogger("production");

    assert.equal(logger.level, "info", "Production logger level must be 'info'");

    const consoleTransport = logger.transports.find(
      (t) => t instanceof winston.transports.Console
    );
    assert.ok(
      consoleTransport,
      "Production logger must include a Console transport for container stdout capture"
    );

    const fileTransports = logger.transports.filter(
      (t) => t instanceof winston.transports.File
    );
    assert.equal(
      fileTransports.length,
      2,
      "Production logger must retain combined.log and error.log File transports"
    );
  });

  it("scrubs database and redis credentials from log entries in production", () => {
    const logger = loadFreshLogger("production");

    // Capture output from the console transport format
    let loggedEntry = null;
    const testFormat = winston.format.combine(
      logger.format,
      winston.format((info) => {
        loggedEntry = info;
        return info;
      })()
    );

    // Simulate formatting an entry containing database and cache connection strings
    const rawEntry = {
      level: "error",
      message: "Connection failed to mongodb+srv://mock-test-user:mock-test-password-123@mock-db-cluster.invalid/runnel-test",
      stack: "Error: connect failed\n  at connect (rediss://mock-redis-user:mock-redis-password-456@mock-cache-endpoint.invalid:6379)",
      meta: {
        rawMongo: "mongodb://mock-local-user:mock-local-password-789@mock-local-host.invalid:27017/runnel-test",
      },
    };

    const transformed = testFormat.transform(rawEntry, {});

    assert.ok(transformed, "Log entry should be transformed");
    assert.ok(
      !transformed.message.includes("mock-test-password-123"),
      "Synthetic database password must be redacted from message"
    );
    assert.match(
      transformed.message,
      /mongodb\+srv:\/\/mock-test-user:\[REDACTED\]@mock-db-cluster\.invalid\/runnel-test/,
      "Database credentials should be masked as [REDACTED]"
    );

    assert.ok(
      !transformed.stack.includes("mock-redis-password-456"),
      "Synthetic Redis password must be redacted from stack trace"
    );
    assert.match(
      transformed.stack,
      /rediss:\/\/mock-redis-user:\[REDACTED\]@mock-cache-endpoint\.invalid:6379/,
      "Redis credentials should be masked as [REDACTED]"
    );

    assert.ok(
      !transformed.meta.rawMongo.includes("mock-local-password-789"),
      "Nested metadata synthetic credentials must be redacted"
    );
    assert.match(
      transformed.meta.rawMongo,
      /mongodb:\/\/mock-local-user:\[REDACTED\]@mock-local-host\.invalid:27017\/runnel-test/,
      "Nested MongoDB URI must be masked as [REDACTED]"
    );
  });

  it("configures Console transport in development mode with debug level", () => {
    const logger = loadFreshLogger("development");

    assert.equal(logger.level, "debug", "Development logger level must be 'debug'");
    const consoleTransport = logger.transports.find(
      (t) => t instanceof winston.transports.Console
    );
    assert.ok(consoleTransport, "Development logger must include a Console transport");
  });

  it("exposes a compatible stream interface for HTTP request logging", () => {
    const logger = loadFreshLogger("production");
    assert.equal(typeof logger.stream?.write, "function");
  });
});
