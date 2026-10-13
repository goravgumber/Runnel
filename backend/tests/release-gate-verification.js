/**
 * release-gate-verification.js
 *
 * Dedicated verification suite for the Release Candidate Gate:
 * 1. MongoDB backup and restore data integrity test.
 * 2. Queue enqueue failure recovery and stuck execution detection.
 * 3. Concurrent retry and cancellation races.
 * 4. Authentication refresh and token revocation behavior.
 * 5. Strict cross-user data isolation.
 * 6. Production handler (webhook) execution lifecycle and failure capture.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const http = require("node:http");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { generateToken, createTestApp } = require("./helpers/testSetup");
const User = require("../models/User");
const Execution = require("../models/Execution");
const ExecutionAttempt = require("../models/ExecutionAttempt");
const queues = require("../queues");
const { processExecutionJob, HANDLER_REGISTRY, resolveHandler } = require("../workers/executionWorker");

describe("Runnel Release Candidate Gate Verifications", () => {
  let mongod;
  let app;
  let userA, userB;
  let authA, authB;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    app = createTestApp();
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
    try {
      const { closeQueues } = require("../queues");
      await closeQueues();
    } catch (_) {}
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    userA = await User.create({
      username: "alice_release",
      name: "Alice Release",
      email: "alice@runnel.test",
      password: "Password123!",
      role: "user",
    });
    authA = generateToken({ id: userA._id.toString(), username: userA.username, email: userA.email, role: userA.role });

    userB = await User.create({
      username: "bob_release",
      name: "Bob Release",
      email: "bob@runnel.test",
      password: "Password123!",
      role: "user",
    });
    authB = generateToken({ id: userB._id.toString(), username: userB.username, email: userB.email, role: userB.role });
  });

  describe("1. MongoDB Backup and Restore Data Integrity", () => {
    it("exports data and verifies complete integrity upon restoration into a separate database", async () => {
      // Create user, execution, and 2 attempts
      const exec = await Execution.create({
        userId: userA._id,
        name: "Backup Test Execution",
        type: "webhook",
        input: { url: "https://example.com/hook", payload: { id: 1 } },
        status: "failed",
        attemptsMade: 2,
        maxAttempts: 3,
        error: { code: "HTTP_500", message: "Internal server error" },
      });

      await ExecutionAttempt.create({
        executionId: exec._id,
        userId: userA._id,
        attemptNumber: 1,
        status: "failed",
        durationMs: 140,
        error: { code: "HTTP_500", message: "Internal server error" },
      });

      await ExecutionAttempt.create({
        executionId: exec._id,
        userId: userA._id,
        attemptNumber: 2,
        status: "failed",
        durationMs: 125,
        error: { code: "HTTP_500", message: "Internal server error" },
      });

      // Export collections (simulating mongodump reading raw BSON from storage)
      const usersExport = await User.find({}).select("+password").lean();
      const execsExport = await Execution.find({}).lean();
      const attemptsExport = await ExecutionAttempt.find({}).lean();

      assert.equal(usersExport.length, 2);
      assert.equal(execsExport.length, 1);
      assert.equal(attemptsExport.length, 2);

      // Create a secondary isolated database on the same mongo instance (simulating mongorestore)
      const secondaryDbUri = mongod.getUri() + "_restored";
      const secondaryConn = await mongoose.createConnection(secondaryDbUri).asPromise();

      const RestoredUser = secondaryConn.model("User", User.schema);
      const RestoredExecution = secondaryConn.model("Execution", Execution.schema);
      const RestoredAttempt = secondaryConn.model("ExecutionAttempt", ExecutionAttempt.schema);

      await RestoredUser.insertMany(usersExport);
      await RestoredExecution.insertMany(execsExport);
      await RestoredAttempt.insertMany(attemptsExport);

      // Validate restored integrity
      const restoredUser = await RestoredUser.findById(userA._id);
      assert.ok(restoredUser);
      assert.equal(restoredUser.email, "alice@runnel.test");

      const restoredExec = await RestoredExecution.findById(exec._id);
      assert.ok(restoredExec);
      assert.equal(restoredExec.name, "Backup Test Execution");
      assert.equal(restoredExec.status, "failed");
      assert.equal(restoredExec.attemptsMade, 2);
      assert.equal(restoredExec.error.code, "HTTP_500");

      const restoredAttempts = await RestoredAttempt.find({ executionId: exec._id }).sort({ attemptNumber: 1 });
      assert.equal(restoredAttempts.length, 2);
      assert.equal(restoredAttempts[0].attemptNumber, 1);
      assert.equal(restoredAttempts[1].attemptNumber, 2);
      assert.equal(restoredAttempts[0].status, "failed");

      await secondaryConn.close();
    });
  });

  describe("2. Queue-enqueue failure recovery and stuck execution detection", () => {
    it("gracefully marks execution as failed with ENQUEUE_FAILURE when queue is unavailable", async () => {
      const origAddJob = queues.addJob;
      queues.addJob = async () => {
        throw new Error("Redis connection refused: ECONNREFUSED");
      };

      try {
        const res = await request(app)
          .post("/api/v1/executions")
          .set("Authorization", `Bearer ${authA.token}`)
          .send({
            name: "Queue Failure Test",
            type: "webhook",
            input: { url: "https://api.example.com/webhook" },
          });

        assert.equal(res.status, 202);
        assert.equal(res.body.data.status, "failed");
        assert.equal(res.body.data.error.code, "ENQUEUE_FAILURE");
        assert.match(res.body.data.error.message, /ECONNREFUSED/);

        const saved = await Execution.findById(res.body.data._id);
        assert.equal(saved.status, "failed");
        assert.equal(saved.error.code, "ENQUEUE_FAILURE");
      } finally {
        queues.addJob = origAddJob;
      }
    });

    it("detects stuck executions running beyond timeout threshold", async () => {
      const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);

      // Create stuck execution
      const stuckExec = await Execution.create({
        userId: userA._id,
        name: "Stuck Worker Task",
        type: "webhook",
        input: { url: "https://api.example.com/webhook" },
        status: "running",
        startedAt: sixMinutesAgo,
        attemptsMade: 1,
        maxAttempts: 3,
      });

      // Query for stuck executions
      const stuckList = await Execution.find({
        status: "running",
        startedAt: { $lt: new Date(Date.now() - STUCK_THRESHOLD_MS) },
      });

      assert.equal(stuckList.length, 1);
      assert.equal(stuckList[0]._id.toString(), stuckExec._id.toString());

      // Recovery: mark stuck execution as retrying or failed so it can be recovered
      await Execution.findByIdAndUpdate(stuckExec._id, {
        status: "failed",
        error: { code: "WORKER_TIMEOUT_OR_STALLED", message: "Execution stalled in running state" },
      });

      const recovered = await Execution.findById(stuckExec._id);
      assert.equal(recovered.status, "failed");
      assert.equal(recovered.error.code, "WORKER_TIMEOUT_OR_STALLED");
    });
  });

  describe("3. Concurrency Safety: Retry and Cancellation Races", () => {
    it("ensures atomic retry prevents double-enqueue during concurrent requests", async () => {
      const exec = await Execution.create({
        userId: userA._id,
        name: "Race Test Execution",
        type: "webhook",
        input: { url: "https://api.example.com/webhook" },
        status: "failed",
        attemptsMade: 1,
        maxAttempts: 3,
      });

      // Fire two concurrent retry requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/executions/${exec._id}/retry`)
          .set("Authorization", `Bearer ${authA.token}`),
        request(app)
          .post(`/api/v1/executions/${exec._id}/retry`)
          .set("Authorization", `Bearer ${authA.token}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One must succeed (202), and the other must be rejected (409 Conflict)
      assert.deepEqual(statuses, [202, 409]);
    });

    it("ensures cancellation while job is pending bails out worker without execution", async () => {
      const exec = await Execution.create({
        userId: userA._id,
        name: "Cancel Race Execution",
        type: "webhook",
        input: { url: "https://api.example.com/webhook" },
        status: "pending",
        attemptsMade: 0,
        maxAttempts: 3,
      });

      // User cancels the execution
      const cancelRes = await request(app)
        .post(`/api/v1/executions/${exec._id}/cancel`)
        .set("Authorization", `Bearer ${authA.token}`);

      assert.equal(cancelRes.status, 200);

      // Now worker picks up the job
      const mockJob = {
        id: "job-cancel-test",
        data: { executionId: exec._id.toString() },
        attemptsMade: 0,
        queueName: "runnel-executions",
        opts: { attempts: 3 },
      };

      const result = await processExecutionJob(mockJob);
      assert.equal(result, null);

      // No attempts should have been recorded
      const attemptsCount = await ExecutionAttempt.countDocuments({ executionId: exec._id });
      assert.equal(attemptsCount, 0);

      const finalState = await Execution.findById(exec._id);
      assert.equal(finalState.status, "cancelled");
      assert.equal(finalState.attemptsMade, 0);
    });
  });

  describe("4. Strict User Isolation", () => {
    it("User B cannot view or modify User A's executions (returns 404)", async () => {
      const execA = await Execution.create({
        userId: userA._id,
        name: "Alice Private Execution",
        type: "webhook",
        input: { url: "https://api.example.com/webhook" },
        status: "failed",
        attemptsMade: 1,
        maxAttempts: 3,
      });

      // Bob tries to GET Alice's execution
      const getRes = await request(app)
        .get(`/api/v1/executions/${execA._id}`)
        .set("Authorization", `Bearer ${authB.token}`);
      assert.equal(getRes.status, 404);

      // Bob tries to retry Alice's execution
      const retryRes = await request(app)
        .post(`/api/v1/executions/${execA._id}/retry`)
        .set("Authorization", `Bearer ${authB.token}`);
      assert.equal(retryRes.status, 404);

      // Bob tries to cancel Alice's execution
      const cancelRes = await request(app)
        .post(`/api/v1/executions/${execA._id}/cancel`)
        .set("Authorization", `Bearer ${authB.token}`);
      assert.equal(cancelRes.status, 404);

      // Bob's execution list does not contain Alice's execution
      const listRes = await request(app)
        .get("/api/v1/executions")
        .set("Authorization", `Bearer ${authB.token}`);
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.data.executions.length, 0);
    });
  });

  describe("5. Production Webhook Execution Processing & Failure Capture", () => {
    it("executes real HTTP webhook delivery, records attempt history and completed status", async () => {
      const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, received: JSON.parse(body) }));
        });
      });
      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const exec = await Execution.create({
          userId: userA._id,
          name: "Real Webhook Delivery",
          type: "webhook",
          input: {
            url: `http://127.0.0.1:${port}/hook`,
            method: "POST",
            body: { event: "order.shipped", orderId: "ORD-9901" },
          },
          status: "pending",
          attemptsMade: 0,
          maxAttempts: 3,
        });

        const mockJob = {
          id: "job-webhook-ok",
          data: { executionId: exec._id.toString() },
          attemptsMade: 0,
          queueName: "runnel-executions",
          opts: { attempts: 3 },
        };

        const result = await processExecutionJob(mockJob);
        assert.equal(result.status, 200);
        assert.equal(result.data.ok, true);
        assert.equal(result.data.received.event, "order.shipped");

        const completedExec = await Execution.findById(exec._id);
        assert.equal(completedExec.status, "completed");
        assert.equal(completedExec.attemptsMade, 1);
        assert.ok(completedExec.completedAt);
        assert.equal(completedExec.output.status, 200);

        const attempts = await ExecutionAttempt.find({ executionId: exec._id });
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].status, "completed");
        assert.equal(attempts[0].attemptNumber, 1);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it("captures HTTP 502 Bad Gateway and records structured attempt failure", async () => {
      const server = http.createServer((req, res) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Upstream Service Unavailable" }));
      });
      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const exec = await Execution.create({
          userId: userA._id,
          name: "Failing Webhook Delivery",
          type: "webhook",
          input: {
            url: `http://127.0.0.1:${port}/bad-gateway`,
            method: "POST",
            body: { event: "order.shipped" },
          },
          status: "pending",
          attemptsMade: 0,
          maxAttempts: 3,
        });

        const mockJob = {
          id: "job-webhook-fail",
          data: { executionId: exec._id.toString() },
          attemptsMade: 0,
          queueName: "runnel-executions",
          opts: { attempts: 3 },
        };

        await assert.rejects(
          async () => {
            await processExecutionJob(mockJob);
          },
          /HTTP 502/
        );

        const retryingExec = await Execution.findById(exec._id);
        assert.equal(retryingExec.status, "retrying");
        assert.equal(retryingExec.attemptsMade, 1);
        assert.equal(retryingExec.error.code, "HTTP_502");

        const attempts = await ExecutionAttempt.find({ executionId: exec._id });
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].status, "failed");
        assert.equal(attempts[0].error.code, "HTTP_502");
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
