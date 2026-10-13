process.env.NODE_ENV = "test";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const User = require("../models/User");
const { setupTestDb, teardownTestDb, createTestApp } = require("./helpers/testSetup");

describe("Runnel Authentication & Session Suite", () => {
  let app;
  const uniqueSuffix = Date.now();
  const testUsername = `user_${uniqueSuffix}`;
  const testPassword = "securePassword123!";
  let registeredToken = null;

  before(async () => {
    await setupTestDb();
    app = createTestApp();
  });

  after(async () => {
    try {
      await User.deleteOne({ username: testUsername });
    } catch (_) {}
    await teardownTestDb();
  });

  it("1. registers a new user with valid credentials (returns 201 with tokens and user info)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: testUsername, password: testPassword });

    assert.strictEqual(res.status, 201, `Expected status 201, got ${res.status}`);
    const data = res.body;
    assert.strictEqual(data.success, true);
    assert.ok(data.data.token || data.token, "Expected access token in response");
    assert.ok(data.data.refreshToken || data.refreshToken, "Expected refresh token in response");
    assert.strictEqual(data.data.user.username, testUsername);
    registeredToken = data.data.token || data.token;
  });

  it("2. rejects invalid input (username < 3 chars) with useful 400 validation error", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: "ab", password: testPassword });

    assert.strictEqual(res.status, 400);
    const data = res.body;
    assert.strictEqual(data.success, false);
    const errMessage =
      data.error?.details?.validationErrors?.[0]?.message ||
      data.error?.message ||
      "";
    assert.ok(
      errMessage.toLowerCase().includes("at least 3 characters") ||
      errMessage.toLowerCase().includes("validation failed"),
      `Expected validation error message, got: ${errMessage}`
    );
  });

  it("3. rejects invalid input (password < 8 chars) with useful 400 validation error", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: `valid_${Date.now()}`, password: "123" });

    assert.strictEqual(res.status, 400);
    const data = res.body;
    assert.strictEqual(data.success, false);
    const errMessage =
      data.error?.details?.validationErrors?.[0]?.message ||
      data.error?.message ||
      "";
    assert.ok(
      errMessage.toLowerCase().includes("at least 8 characters") ||
      errMessage.toLowerCase().includes("validation failed"),
      `Expected validation error message, got: ${errMessage}`
    );
  });

  it("4. rejects duplicate username registration with 409 CONFLICT", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: testUsername, password: testPassword });

    assert.strictEqual(res.status, 409);
    const data = res.body;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, "CONFLICT");
    assert.ok(data.error.message.toLowerCase().includes("already taken"));
  });

  it("5. verifies the user in MongoDB is persisted with a securely hashed bcrypt password", async () => {
    const userDoc = await User.findOne({ username: testUsername }).select("+password");
    assert.ok(userDoc, "User document should exist in database");
    assert.notStrictEqual(userDoc.password, testPassword, "Password must not be stored in plain text");
    assert.ok(userDoc.password.startsWith("$2"), "Password should be a valid bcrypt hash format");

    const matches = await bcrypt.compare(testPassword, userDoc.password);
    assert.strictEqual(matches, true, "Bcrypt hash should correctly match the plaintext password");
  });

  it("6. logs in successfully with valid credentials and returns JWT access + refresh tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: testUsername, password: testPassword });

    assert.strictEqual(res.status, 200);
    const data = res.body;
    assert.strictEqual(data.success, true);
    assert.ok(data.data.token || data.token, "Expected access token");
    assert.ok(data.data.refreshToken || data.refreshToken, "Expected refresh token");
    assert.strictEqual(data.data.user.username, testUsername);
    registeredToken = data.data.token || data.token;
  });

  it("7. rejects login with wrong password (401 UNAUTHORIZED)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: testUsername, password: "wrong_password_999" });

    assert.strictEqual(res.status, 401);
    const data = res.body;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, "UNAUTHORIZED");
  });

  it("8. rejects login with non-existent user (401 UNAUTHORIZED)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "ghost_user_does_not_exist_99", password: testPassword });

    assert.strictEqual(res.status, 401);
    const data = res.body;
    assert.strictEqual(data.success, false);
  });

  it("9. validates active token via GET /auth/validate", async () => {
    const res = await request(app)
      .get("/api/v1/auth/validate")
      .set("Authorization", `Bearer ${registeredToken}`);

    assert.strictEqual(res.status, 200);
    const data = res.body;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.valid, true);
  });

  it("10. rejects token validation when token is missing or invalid (401 UNAUTHORIZED)", async () => {
    const res = await request(app)
      .get("/api/v1/auth/validate")
      .set("Authorization", "Bearer bad.token.here");

    assert.strictEqual(res.status, 401);
  });

  it("11. rejects unauthenticated access to protected route GET /executions with 401", async () => {
    const res = await request(app).get("/api/v1/executions");
    assert.strictEqual(res.status, 401);
    const data = res.body;
    assert.strictEqual(data.success, false);
  });

  it("12. permits authenticated access to protected route GET /executions with 200", async () => {
    const res = await request(app)
      .get("/api/v1/executions")
      .set("Authorization", `Bearer ${registeredToken}`);

    assert.strictEqual(res.status, 200);
    const data = res.body;
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.executions));
  });
});
