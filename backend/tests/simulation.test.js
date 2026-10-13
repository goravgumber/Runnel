const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { setupTestDb, teardownTestDb, createTestApp, generateToken } = require("./helpers/testSetup");

describe("Simulation endpoints", () => {
  let app;
  let token;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
    const tokenInfo = generateToken();
    token = tokenInfo.token;
  });

  after(async () => {
    await teardownTestDb();
  });

  it("GET /simulation/status without auth returns 401", async () => {
    const res = await request(app).get("/api/v1/simulation/status");
    assert.strictEqual(res.status, 401);
  });

  it("GET /simulation/status with valid token returns 200", async () => {
    const res = await request(app)
      .get("/api/v1/simulation/status")
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(res.status, 200);
    const data = res.body.data || res.body;
    assert.ok(typeof data.isRunning === "boolean" || typeof data.status === "object");
  });

  it("POST /simulation with plants=0 returns 400", async () => {
    const res = await request(app)
      .post("/api/v1/simulation")
      .set("Authorization", `Bearer ${token}`)
      .send({ plants: 0, herbivores: 0, carnivores: 0 });
    assert.strictEqual(res.status, 400);
  });
});
