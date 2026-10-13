const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const http = require("node:http");
const {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  generateToken,
} = require("../helpers/testSetup");
const {
  processExecutionJob,
  HANDLER_REGISTRY,
  resolveHandler,
} = require("../../workers/executionWorker");
const Execution = require("../../models/Execution");
const ExecutionAttempt = require("../../models/ExecutionAttempt");

describe("Execution Worker Unit Tests", () => {
  let user;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    user = generateToken().user;
  });

  describe("Handler Registry", () => {
    it("echo handler reflects input back with ISO timestamp", async () => {
      const handler = resolveHandler("echo");
      const input = { message: "runnel-test-123" };
      const output = await handler(input);
      assert.deepEqual(output.echoed, input);
      assert.ok(output.at);
    });

    it("fail handler throws INTENTIONAL_FAILURE", async () => {
      const handler = resolveHandler("fail");
      await assert.rejects(
        async () => {
          await handler({ reason: "Boom!" });
        },
        (err) => {
          assert.equal(err.code, "INTENTIONAL_FAILURE");
          assert.equal(err.message, "Boom!");
          return true;
        }
      );
    });

    it("webhook handler delivers payload and returns response data", async () => {
      const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: JSON.parse(body), status: "acknowledged" }));
        });
      });
      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const handler = resolveHandler("webhook");
        const res = await handler({
          url: `http://127.0.0.1:${port}/webhook`,
          method: "POST",
          body: { event: "order_dispatched" },
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.status, "acknowledged");
        assert.deepEqual(res.data.received, { event: "order_dispatched" });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it("webhook handler throws structured HTTP_500 on server failure", async () => {
      const server = http.createServer((req, res) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Gateway Error" }));
      });
      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const handler = resolveHandler("webhook");
        await assert.rejects(
          async () => {
            await handler({ url: `http://127.0.0.1:${port}/fail` });
          },
          (err) => {
            assert.equal(err.code, "HTTP_500");
            return true;
          }
        );
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it("webhook handler enforces SSRF protection in production", async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const handler = resolveHandler("webhook");
        await assert.rejects(
          async () => {
            await handler({ url: "http://169.254.169.254/latest/meta-data/" });
          },
          (err) => {
            assert.equal(err.code, "SSRF_BLOCKED");
            return true;
          }
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it("defaults to echo handler when an unknown type is requested", () => {
      const handler = resolveHandler("unknown-custom-type");
      assert.equal(handler, HANDLER_REGISTRY.echo);
    });
  });

  describe("processExecutionJob lifecycle", () => {
    it("executes echo job to completion, recording attempt and updating Execution status", async () => {
      const exec = await Execution.create({
        userId: user.id,
        name: "Worker Test Job",
        type: "echo",
        input: { ping: "pong" },
        status: "pending",
        maxAttempts: 3,
      });

      const mockJob = {
        id: "job-101",
        data: { executionId: exec._id.toString() },
        attemptsMade: 0,
        queueName: "runnel-executions",
        opts: { attempts: 3 },
      };

      const emitted = [];
      const mockIo = {
        to: (room) => ({
          emit: (event, data) => emitted.push({ room, event, data }),
        }),
      };

      const result = await processExecutionJob(mockJob, mockIo);
      assert.deepEqual(result.echoed, { ping: "pong" });

      // Verify Execution status in MongoDB
      const updated = await Execution.findById(exec._id);
      assert.equal(updated.status, "completed");
      assert.equal(updated.attemptsMade, 1);
      assert.ok(updated.completedAt);
      assert.deepEqual(updated.output.echoed, { ping: "pong" });

      // Verify ExecutionAttempt record
      const attempts = await ExecutionAttempt.find({ executionId: exec._id });
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].attemptNumber, 1);
      assert.equal(attempts[0].status, "completed");
      assert.ok(typeof attempts[0].durationMs === "number");

      // Verify Socket.IO updates were emitted
      assert.ok(emitted.length >= 2);
      assert.equal(emitted[0].data.status, "running");
      assert.equal(emitted[1].data.status, "completed");
    });

    it("records failure and sets status to retrying when non-final attempt fails", async () => {
      const exec = await Execution.create({
        userId: user.id,
        name: "Worker Fail Job",
        type: "fail",
        input: { reason: "Temporary glitch" },
        status: "pending",
        maxAttempts: 3,
      });

      const mockJob = {
        id: "job-102",
        data: { executionId: exec._id.toString() },
        attemptsMade: 0, // attempt 1 of 3
        queueName: "runnel-executions",
        opts: { attempts: 3 },
      };

      await assert.rejects(
        async () => {
          await processExecutionJob(mockJob);
        },
        /Temporary glitch/
      );

      // Verify Execution status in MongoDB is retrying
      const updated = await Execution.findById(exec._id);
      assert.equal(updated.status, "retrying");
      assert.equal(updated.attemptsMade, 1);
      assert.equal(updated.error.code, "INTENTIONAL_FAILURE");

      // Verify ExecutionAttempt recorded
      const attempts = await ExecutionAttempt.find({ executionId: exec._id });
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, "failed");
      assert.equal(attempts[0].error.code, "INTENTIONAL_FAILURE");
    });

    it("sets status to failed when the final attempt fails", async () => {
      const exec = await Execution.create({
        userId: user.id,
        name: "Worker Final Fail Job",
        type: "fail",
        input: { reason: "Terminal error" },
        status: "retrying",
        attemptsMade: 2,
        maxAttempts: 3,
      });

      const mockJob = {
        id: "job-103",
        data: { executionId: exec._id.toString() },
        attemptsMade: 2, // 3rd attempt out of 3
        queueName: "runnel-executions",
        opts: { attempts: 3 },
      };

      await assert.rejects(
        async () => {
          await processExecutionJob(mockJob);
        },
        /Terminal error/
      );

      // Verify Execution transitioned to failed
      const updated = await Execution.findById(exec._id);
      assert.equal(updated.status, "failed");
      assert.equal(updated.attemptsMade, 3);
      assert.equal(updated.error.code, "INTENTIONAL_FAILURE");
    });

    it("bails out cleanly without running handler when execution was cancelled", async () => {
      const exec = await Execution.create({
        userId: user.id,
        name: "Cancelled Before Worker",
        type: "echo",
        status: "cancelled",
        attemptsMade: 0,
      });

      const mockJob = {
        id: "job-104",
        data: { executionId: exec._id.toString() },
        attemptsMade: 0,
        queueName: "runnel-executions",
        opts: { attempts: 3 },
      };

      const result = await processExecutionJob(mockJob);
      assert.equal(result, null);

      // No attempts should have been recorded
      const attempts = await ExecutionAttempt.countDocuments({ executionId: exec._id });
      assert.equal(attempts, 0);

      const unchanged = await Execution.findById(exec._id);
      assert.equal(unchanged.status, "cancelled");
      assert.equal(unchanged.attemptsMade, 0);
    });
  });
});
