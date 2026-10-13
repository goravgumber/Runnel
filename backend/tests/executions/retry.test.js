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
const Execution = require("../../models/Execution");
const ExecutionAttempt = require("../../models/ExecutionAttempt");

describe("Execution Retry (POST /api/v1/executions/:id/retry)", () => {
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

  it("retries a failed execution, transitioning status to pending and returning 202", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Failed Job to Retry",
      status: "failed",
      error: { code: "TEMP_NETWORK_ERROR", message: "Timeout" },
      maxAttempts: 3,
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/retry`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 202);
    assert.equal(res.body.success, true);
    assert.match(res.body.message, /queued for retry/i);

    // Verify status in DB updated to pending and error cleared
    const updated = await Execution.findById(exec._id);
    assert.equal(updated.status, "pending");
    assert.ok(!updated.error?.code);
  });

  it("retries a cancelled execution successfully", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Cancelled Job",
      status: "cancelled",
      maxAttempts: 3,
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/retry`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 202);
    const updated = await Execution.findById(exec._id);
    assert.equal(updated.status, "pending");
  });

  it("rejects retry with 409 when execution is already completed", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Completed Job",
      status: "completed",
      output: { ok: true },
      maxAttempts: 3,
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/retry`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error?.message || res.body.message, /Only failed or cancelled executions can be retried/i);
  });

  it("rejects retry with 409 when execution is currently running", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Running Job",
      status: "running",
      maxAttempts: 3,
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/retry`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 409);
  });

  it("enforces attempt cap and returns 429 when total attempts reaches limit (maxAttempts * 2)", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Flaky Repeated Job",
      status: "failed",
      maxAttempts: 2, // cap is 2 * 2 = 4
    });

    // Create 4 prior attempt records
    for (let i = 1; i <= 4; i++) {
      await ExecutionAttempt.create({
        executionId: exec._id,
        userId: auth.user.id,
        attemptNumber: i,
        status: "failed",
      });
    }

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/retry`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.match(res.body.error?.message || res.body.message, /Manual retry limit reached/i);
  });

  it("ensures concurrency safety: two concurrent retry requests do not double-retry", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Concurrent Retry Target",
      status: "failed",
      maxAttempts: 3,
    });

    // Fire two retry requests in parallel
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/executions/${exec._id}/retry`)
        .set("Authorization", `Bearer ${auth.token}`),
      request(app)
        .post(`/api/v1/executions/${exec._id}/retry`)
        .set("Authorization", `Bearer ${auth.token}`),
    ]);

    // Exactly one should succeed (202) and one should get 409 (status already changed)
    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [202, 409]);
  });
});
