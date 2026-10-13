const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  generateToken,
  createTestApp,
} = require("../helpers/testSetup");
const config = require("../../config/env");
const Execution = require("../../models/Execution");

describe("Execution Handler Authorization & Production Guards (POST /api/v1/executions)", () => {
  let app;
  let auth;
  let origNodeEnv;
  let origDemoHandlers;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
    origNodeEnv = config.NODE_ENV;
    origDemoHandlers = config.ENABLE_DEMO_HANDLERS;
  });

  after(async () => {
    config.NODE_ENV = origNodeEnv;
    config.ENABLE_DEMO_HANDLERS = origDemoHandlers;
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    auth = generateToken();
  });

  afterEach(() => {
    config.NODE_ENV = origNodeEnv;
    config.ENABLE_DEMO_HANDLERS = origDemoHandlers;
  });

  describe("Production Mode with ENABLE_DEMO_HANDLERS=false", () => {
    beforeEach(() => {
      config.NODE_ENV = "production";
      config.ENABLE_DEMO_HANDLERS = false;
    });

    it("rejects synthetic 'echo' execution with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Test Echo Task",
          type: "echo",
          input: { message: "hello" },
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error.message, /Demo handlers \('echo', 'fail'\) are disabled in production/i);

      // Verify no execution was persisted
      const count = await Execution.countDocuments();
      assert.equal(count, 0);
    });

    it("rejects synthetic 'fail' execution with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Test Fail Task",
          type: "fail",
          input: { reason: "test failure" },
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error.message, /Demo handlers \('echo', 'fail'\) are disabled in production/i);

      const count = await Execution.countDocuments();
      assert.equal(count, 0);
    });

    it("accepts valid 'webhook' execution and returns 202 Accepted", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Production Webhook Dispatch",
          type: "webhook",
          input: {
            url: "https://httpbin.org/post",
            method: "POST",
            body: { event: "order.created", id: "ord_1001" },
          },
        });

      assert.equal(res.status, 202);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.type, "webhook");
      assert.equal(res.body.data.status, "pending");

      const doc = await Execution.findById(res.body.data._id);
      assert.ok(doc);
      assert.equal(doc.type, "webhook");
    });

    it("rejects 'webhook' execution when url is missing or malformed with 400", async () => {
      // Missing url
      const res1 = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Malformed Webhook",
          type: "webhook",
          input: { method: "POST" },
        });

      assert.equal(res1.status, 400);
      assert.match(res1.body.error.message, /requires an input object with a 'url' property/i);

      // Invalid protocol
      const res2 = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "FTP Webhook",
          type: "webhook",
          input: { url: "ftp://example.com/test" },
        });

      assert.equal(res2.status, 400);
      assert.match(res2.body.error.message, /must be a valid HTTP or HTTPS URL/i);
    });

    it("rejects unsupported execution types with 400", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Unsupported Task",
          type: "shell_exec",
          input: { command: "ls" },
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /Invalid execution type 'shell_exec'/i);
    });
  });

  describe("Development / Explicitly Enabled Mode (ENABLE_DEMO_HANDLERS=true)", () => {
    beforeEach(() => {
      config.NODE_ENV = "production";
      config.ENABLE_DEMO_HANDLERS = true;
    });

    it("permits 'echo' execution when demo handlers are explicitly enabled", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Permitted Echo Task",
          type: "echo",
          input: { message: "authorized demo" },
        });

      assert.equal(res.status, 202);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.type, "echo");
    });

    it("permits 'fail' execution when demo handlers are explicitly enabled", async () => {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Permitted Fail Task",
          type: "fail",
          input: { reason: "authorized demo failure" },
        });

      assert.equal(res.status, 202);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.type, "fail");
    });
  });
});
