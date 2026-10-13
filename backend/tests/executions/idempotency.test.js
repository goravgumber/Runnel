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

describe("Execution Idempotency (POST /api/v1/executions with idempotencyKey)", () => {
  let app;
  let authUser1;
  let authUser2;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    authUser1 = generateToken();
    authUser2 = generateToken();
  });

  it("returns 200 and existing execution when resubmitting with same key and identical payload", async () => {
    const key = "webhook-delivery-abc-123";
    const payload = {
      name: "Webhook Job",
      idempotencyKey: key,
      input: { event: "order.created", orderId: 994 },
    };

    // First submission
    const res1 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser1.token}`)
      .send(payload);

    assert.equal(res1.status, 202);
    const firstId = res1.body.data._id;

    // Resubmission with identical payload
    const res2 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser1.token}`)
      .send(payload);

    assert.equal(res2.status, 200);
    assert.equal(res2.body.data._id, firstId);
    assert.match(res2.body.message, /Duplicate submission/i);

    // Verify only ONE record exists in MongoDB
    const totalCount = await Execution.countDocuments({
      userId: authUser1.user.id,
      idempotencyKey: key,
    });
    assert.equal(totalCount, 1);
  });

  it("returns 409 Conflict when submitting same idempotencyKey with different payload", async () => {
    const key = "idemp-key-conflict-check";

    // Initial submission
    const res1 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser1.token}`)
      .send({
        name: "Initial Payload",
        idempotencyKey: key,
        input: { amount: 100 },
      });
    assert.equal(res1.status, 202);

    // Resubmission with altered input payload
    const res2 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser1.token}`)
      .send({
        name: "Altered Payload",
        idempotencyKey: key,
        input: { amount: 500 }, // different!
      });

    assert.equal(res2.status, 409);
    assert.equal(res2.body.success, false);
    assert.match(res2.body.error?.message || res2.body.message, /already exists with a different payload/i);
  });

  it("allows different users to use the same idempotencyKey independently (per-user scope)", async () => {
    const sharedKey = "shared-idempotency-token-77";

    const res1 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser1.token}`)
      .send({
        name: "User 1 Execution",
        idempotencyKey: sharedKey,
        input: { user: 1 },
      });
    assert.equal(res1.status, 202);

    const res2 = await request(app)
      .post("/api/v1/executions")
      .set("Authorization", `Bearer ${authUser2.token}`)
      .send({
        name: "User 2 Execution",
        idempotencyKey: sharedKey,
        input: { user: 2 },
      });
    assert.equal(res2.status, 202);

    // Distinct executions created
    assert.notEqual(res1.body.data._id, res2.body.data._id);
  });
});
