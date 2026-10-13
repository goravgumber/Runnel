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

describe("Authorization and Multi-User Isolation (GET/POST/DELETE /api/v1/executions)", () => {
  let app;
  let userA;
  let userB;
  let adminUser;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    userA = generateToken({ role: "user" });
    userB = generateToken({ role: "user" });
    adminUser = generateToken({ role: "admin" });
  });

  it("returns 404 when user attempts to GET another user's execution (no information leakage)", async () => {
    const execB = await Execution.create({
      userId: userB.user.id,
      name: "User B Secret Job",
      status: "completed",
    });

    const res = await request(app)
      .get(`/api/v1/executions/${execB._id}`)
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.error?.message || res.body.message, /Execution not found/i);
  });

  it("returns 404 when user attempts to retry another user's execution", async () => {
    const execB = await Execution.create({
      userId: userB.user.id,
      name: "User B Failed Job",
      status: "failed",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${execB._id}/retry`)
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 404);
  });

  it("returns 404 when user attempts to cancel another user's execution", async () => {
    const execB = await Execution.create({
      userId: userB.user.id,
      name: "User B Pending Job",
      status: "pending",
    });

    const res = await request(app)
      .post(`/api/v1/executions/${execB._id}/cancel`)
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 404);
  });

  it("strictly isolates execution listing between users", async () => {
    await Execution.create([
      { userId: userA.user.id, name: "Job A1", status: "completed" },
      { userId: userA.user.id, name: "Job A2", status: "failed" },
      { userId: userB.user.id, name: "Job B1", status: "pending" },
    ]);

    const res = await request(app)
      .get("/api/v1/executions")
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    const names = res.body.data.executions.map((e) => e.name);
    assert.ok(names.includes("Job A1"));
    assert.ok(names.includes("Job A2"));
    assert.ok(!names.includes("Job B1"));
  });

  it("strictly isolates stats counts between users", async () => {
    await Execution.create([
      { userId: userA.user.id, name: "Job A", status: "failed" },
      { userId: userB.user.id, name: "Job B1", status: "failed" },
      { userId: userB.user.id, name: "Job B2", status: "completed" },
    ]);

    const res = await request(app)
      .get("/api/v1/executions/stats")
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.failed, 1);
    assert.equal(res.body.data.completed, 0);
    assert.equal(res.body.data.total, 1);
  });

  it("allows admin to hard delete execution with DELETE /api/v1/executions/:id and removes attempts", async () => {
    const execAdmin = await Execution.create({
      userId: adminUser.user.id,
      name: "Admin Execution To Delete",
      status: "completed",
    });
    await ExecutionAttempt.create({
      executionId: execAdmin._id,
      userId: adminUser.user.id,
      attemptNumber: 1,
      status: "completed",
    });

    const res = await request(app)
      .delete(`/api/v1/executions/${execAdmin._id}`)
      .set("Authorization", `Bearer ${adminUser.token}`);

    assert.equal(res.status, 200);
    assert.match(res.body.message, /permanently deleted/i);

    const doc = await Execution.findById(execAdmin._id);
    assert.equal(doc, null);
    const attempts = await ExecutionAttempt.find({ executionId: execAdmin._id });
    assert.equal(attempts.length, 0);
  });

  it("rejects non-admin from calling DELETE /api/v1/executions/:id with 403 Forbidden", async () => {
    const execA = await Execution.create({
      userId: userA.user.id,
      name: "Job A",
      status: "completed",
    });

    const res = await request(app)
      .delete(`/api/v1/executions/${execA._id}`)
      .set("Authorization", `Bearer ${userA.token}`);

    assert.equal(res.status, 403);
  });
});
