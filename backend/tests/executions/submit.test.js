const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  generateToken,
  createTestApp,
} = require("../helpers/testSetup");
const queues = require("../../queues");
const Execution = require("../../models/Execution");

describe("Execution Submission (POST /api/v1/executions)", () => {
  let app;
  let auth;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    auth = generateToken();
  });

  it("submits valid execution successfully and returns 202 Accepted", async () => {
    const payload = {
      name: "Data Ingestion Task",
      description: "Nightly sync",
      type: "echo",
      input: { records: 42, source: "s3" },
      maxAttempts: 3,
      tags: ["sync", "nightly"],
    };

    const res = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${auth.token}`)
      .send(payload);

    assert.equal(res.status, 202);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, payload.name);
    assert.equal(res.body.data.status, "pending");
    assert.equal(res.body.data.type, "echo");
    assert.deepEqual(res.body.data.input, payload.input);
    assert.equal(res.body.data.maxAttempts, 3);
    assert.equal(res.body.data.userId, auth.user.id);

    // Verify record in MongoDB
    const doc = await Execution.findById(res.body.data._id);
    assert.ok(doc);
    assert.equal(doc.status, "pending");
    assert.equal(doc.userId.toString(), auth.user.id);
  });

  it("returns 400 validation error when name is missing", async () => {
    const res = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ type: "echo", input: {} });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("returns 400 when maxAttempts exceeds upper bound (max 10)", async () => {
    const res = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ name: "Invalid Max Attempts", maxAttempts: 99 });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("returns 401 when request lacks authorization token", async () => {
    const res = await request(app)
      .post("/api/v1/executions")
      .send({ name: "Unauthenticated job" });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it("handles queue enqueue failure gracefully by saving execution as failed with ENQUEUE_FAILURE", async () => {
    // Temporarily stub addJob to throw an error simulating queue down
    const origAddJob = queues.addJob;
    queues.addJob = async () => {
      throw new Error("Redis connection refused: ECONNREFUSED");
    };

    try {
      const res = await request(app)
        .post("/api/v1/executions")
        .set("Authorization", `Bearer ${auth.token}`)
        .send({
          name: "Queue Failure Recovery Test",
          type: "echo",
          input: { key: "val" },
        });

      assert.equal(res.status, 202);
      assert.equal(res.body.data.status, "failed");
      assert.equal(res.body.data.error.code, "ENQUEUE_FAILURE");
      assert.match(res.body.data.error.message, /ECONNREFUSED/);

      // Verify MongoDB persistence
      const saved = await Execution.findById(res.body.data._id);
      assert.ok(saved);
      assert.equal(saved.status, "failed");
      assert.equal(saved.error.code, "ENQUEUE_FAILURE");
    } finally {
      queues.addJob = origAddJob;
    }
  });
});
