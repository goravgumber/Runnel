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

describe("Execution Cancellation (POST /api/v1/executions/:id/cancel)", () => {
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

  it("cancels a pending execution and sets status to cancelled", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Job to Cancel",
      status: "pending",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/cancel`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.message, /Execution cancelled/i);

    const doc = await Execution.findById(exec._id);
    assert.equal(doc.status, "cancelled");
  });

  it("cancels a running execution", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Running Job to Cancel",
      status: "running",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/cancel`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 200);
    const doc = await Execution.findById(exec._id);
    assert.equal(doc.status, "cancelled");
  });

  it("rejects cancel with 409 when execution is already completed", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Finished Job",
      status: "completed",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/cancel`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.match(res.body.error?.message || res.body.message, /Only pending, retrying, or running executions can be cancelled/i);
  });

  it("rejects cancel with 409 when execution is already cancelled", async () => {
    const exec = await Execution.create({
      userId: auth.user.id,
      name: "Already Cancelled",
      status: "cancelled",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${exec._id}/cancel`)
      .set("Authorization", `Bearer ${auth.token}`);

    assert.equal(res.status, 409);
  });
});
