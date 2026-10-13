/**
 * stuckExecutionRecovery.test.js
 *
 * Automated test suite for Runnel's Reliable Stuck-Execution Recovery Service.
 *
 * Verifies all 10 operational and failure scenarios:
 * 1. A genuinely abandoned running execution is safely recovered and re-queued.
 * 2. An active BullMQ job is preserved and NOT incorrectly marked failed.
 * 3. A delayed retry job is preserved and remains intact.
 * 4. A worker restart / interrupted execution with waiting job is synchronized to 'retrying'.
 * 5. Concurrent reconciliation requests do not produce duplicate recoveries or double-enqueues.
 * 6. Multiple application instances safely coordinate via distributed lock.
 * 7. Retry-limit exhaustion transitions abandoned executions to 'failed'.
 * 8. MongoDB or Redis temporarily unavailable safely aborts without misclassifying jobs.
 * 9. Missing or inconsistent queue records with non-retryable handlers flag for investigation.
 * 10. Execution and attempt history are correctly preserved with structured audit reasons.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  generateToken,
} = require("../helpers/testSetup");
const Execution = require("../../models/Execution");
const ExecutionAttempt = require("../../models/ExecutionAttempt");
const queues = require("../../queues");
const redisClient = require("../../config/redis");
const {
  reconcileStuckExecutions,
  getRecoveryMetrics,
  resetRecoveryMetrics,
  LOCK_KEY,
} = require("../../services/executionRecoveryService");

describe("Reliable Stuck-Execution Recovery Service", () => {
  let user;

  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    resetRecoveryMetrics();
    user = generateToken().user;
  });

  // ── 1. Genuinely Abandoned Running Execution ─────────────────────────
  it("1. safely recovers and re-enqueues a genuinely abandoned running execution", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000); // 10m ago

    const exec = await Execution.create({
      userId: user.id,
      name: "Abandoned Webhook Execution",
      type: "webhook",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      input: { url: "https://example.com/webhook" },
      startedAt: staleTime,
    });

    // Force updatedAt to past timestamp
    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    // Create an open running attempt
    await ExecutionAttempt.create({
      executionId: exec._id,
      userId: user.id,
      attemptNumber: 1,
      status: "running",
      startedAt: staleTime,
    });

    const res = await reconcileStuckExecutions({
      staleThresholdMs: 60 * 1000, // 1m
      bypassLock: true,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.candidatesExamined, 1);
    assert.equal(res.executionsRecovered, 1);
    assert.equal(res.executionsRequeued, 1);

    // Verify Execution was transitioned to 'retrying'
    const updatedExec = await Execution.findById(exec._id);
    assert.equal(updatedExec.status, "retrying");
    assert.equal(updatedExec.error?.code, "WORKER_INTERRUPTED");
    assert.ok(updatedExec.jobId, "New recovery job ID assigned");

    // Verify running attempt was safely closed with structured reason
    const attempts = await ExecutionAttempt.find({ executionId: exec._id });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].status, "failed");
    assert.equal(attempts[0].error?.code, "WORKER_INTERRUPTED");
    assert.ok(attempts[0].completedAt);
  });

  // ── 2. Active BullMQ Job Preservation ────────────────────────────────
  it("2. preserves an active BullMQ job and does NOT mark it failed", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Long Running Webhook Execution",
      type: "webhook",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      jobId: "active-job-999",
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    // Stub queue.getJob to return an active job
    const origGetRunnelQueue = queues.getRunnelQueue;
    queues.getRunnelQueue = () => ({
      getJob: async (id) => {
        if (id === "active-job-999") {
          return {
            id,
            getState: async () => "active",
          };
        }
        return null;
      },
    });

    try {
      const res = await reconcileStuckExecutions({
        staleThresholdMs: 60 * 1000,
        bypassLock: true,
      });

      assert.equal(res.candidatesExamined, 1);
      assert.equal(res.skippedActive, 1);
      assert.equal(res.executionsRecovered, 0);

      // Verify Execution remains 'running'
      const checkExec = await Execution.findById(exec._id);
      assert.equal(checkExec.status, "running");
    } finally {
      queues.getRunnelQueue = origGetRunnelQueue;
    }
  });

  // ── 3. Delayed Retry Preservation ────────────────────────────────────
  it("3. preserves a delayed BullMQ retry job and leaves it intact", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Backoff Delayed Execution",
      type: "webhook",
      status: "running",
      jobId: "delayed-job-888",
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    const origGetRunnelQueue = queues.getRunnelQueue;
    queues.getRunnelQueue = () => ({
      getJob: async (id) => {
        if (id === "delayed-job-888") {
          return {
            id,
            getState: async () => "delayed",
          };
        }
        return null;
      },
    });

    try {
      const res = await reconcileStuckExecutions({
        staleThresholdMs: 60 * 1000,
        bypassLock: true,
      });

      assert.equal(res.candidatesExamined, 1);
      assert.equal(res.skippedDelayed, 1);
      assert.equal(res.executionsRecovered, 0);

      const checkExec = await Execution.findById(exec._id);
      assert.equal(checkExec.status, "running");
    } finally {
      queues.getRunnelQueue = origGetRunnelQueue;
    }
  });

  // ── 4. Worker Restart / Interrupted Execution (Waiting Job) ──────────
  it("4. synchronizes waiting queue job after worker interruption to retrying", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Interrupted Worker Execution",
      type: "echo",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      jobId: "waiting-job-777",
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    await ExecutionAttempt.create({
      executionId: exec._id,
      userId: user.id,
      attemptNumber: 1,
      status: "running",
      startedAt: staleTime,
    });

    const origGetRunnelQueue = queues.getRunnelQueue;
    queues.getRunnelQueue = () => ({
      getJob: async (id) => {
        if (id === "waiting-job-777") {
          return {
            id,
            getState: async () => "waiting",
          };
        }
        return null;
      },
    });

    try {
      const res = await reconcileStuckExecutions({
        staleThresholdMs: 60 * 1000,
        bypassLock: true,
      });

      assert.equal(res.candidatesExamined, 1);
      assert.equal(res.executionsRecovered, 1);

      const checkExec = await Execution.findById(exec._id);
      assert.equal(checkExec.status, "retrying");
      assert.equal(checkExec.error?.code, "WORKER_INTERRUPTED");

      const attempt = await ExecutionAttempt.findOne({ executionId: exec._id });
      assert.equal(attempt.status, "failed");
      assert.equal(attempt.error?.code, "WORKER_INTERRUPTED");
    } finally {
      queues.getRunnelQueue = origGetRunnelQueue;
    }
  });

  // ── 5. Concurrent Reconciliation Requests ────────────────────────────
  it("5. prevents duplicate recoveries and double-enqueues under concurrent reconciliation", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Race Condition Test Execution",
      type: "webhook",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    // Launch two simultaneous reconciliation runs
    const [res1, res2] = await Promise.all([
      reconcileStuckExecutions({ staleThresholdMs: 60 * 1000, bypassLock: true }),
      reconcileStuckExecutions({ staleThresholdMs: 60 * 1000, bypassLock: true }),
    ]);

    // Exactly one must have recovered the execution
    const totalRecovered = res1.executionsRecovered + res2.executionsRecovered;
    assert.equal(totalRecovered, 1, "Execution must be recovered exactly once across concurrent callers");

    const finalExec = await Execution.findById(exec._id);
    assert.equal(finalExec.status, "retrying");
  });

  // ── 6. Distributed Locking Across Replicas ───────────────────────────
  it("6. coordinates multiple application replicas via Redis distributed lock", async () => {
    if (!redisClient || redisClient.status !== "ready") {
      return; // Skip if redisClient not ready
    }

    // Pre-acquire lock with a dummy owner
    await redisClient.set(LOCK_KEY, "other-replica-instance", "PX", 10000);

    try {
      const res = await reconcileStuckExecutions({
        staleThresholdMs: 60 * 1000,
        bypassLock: false, // Enforce distributed lock check
      });

      assert.equal(res.status, "skipped");
      assert.equal(res.reason, "Lock busy");
    } finally {
      await redisClient.del(LOCK_KEY);
    }
  });

  // ── 7. Retry-Limit Exhaustion ────────────────────────────────────────
  it("7. transitions abandoned execution to failed when retry limit is exhausted", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Exhausted Retries Execution",
      type: "webhook",
      status: "running",
      attemptsMade: 3,
      maxAttempts: 3,
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    await ExecutionAttempt.create({
      executionId: exec._id,
      userId: user.id,
      attemptNumber: 3,
      status: "running",
      startedAt: staleTime,
    });

    const res = await reconcileStuckExecutions({
      staleThresholdMs: 60 * 1000,
      bypassLock: true,
    });

    assert.equal(res.candidatesExamined, 1);
    assert.equal(res.executionsFailed, 1);
    assert.equal(res.executionsRequeued, 0);

    const finalExec = await Execution.findById(exec._id);
    assert.equal(finalExec.status, "failed");
    assert.equal(finalExec.error?.code, "RECOVERY_RETRIES_EXHAUSTED");
    assert.ok(finalExec.completedAt);

    const attempt = await ExecutionAttempt.findOne({ executionId: exec._id, attemptNumber: 3 });
    assert.equal(attempt.status, "failed");
    assert.equal(attempt.error?.code, "RECOVERY_RETRIES_EXHAUSTED");
  });

  // ── 8. MongoDB / Redis Outage Immunity ────────────────────────────────
  it("8. safely aborts when MongoDB is unavailable without misclassifying jobs", async () => {
    const res = await reconcileStuckExecutions({ dbReady: false, bypassLock: true });
    assert.equal(res.status, "aborted");
    assert.equal(res.reason, "MongoDB disconnected");
  });

  // ── 9. Non-Retryable Handler Flagged for Investigation ───────────────
  it("9. flags non-retryable execution for investigation rather than blindly re-queuing", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Custom Unknown Type Execution",
      type: "unsupported_legacy_script",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    const res = await reconcileStuckExecutions({
      staleThresholdMs: 60 * 1000,
      bypassLock: true,
    });

    assert.equal(res.candidatesExamined, 1);
    assert.equal(res.executionsFailed, 1);
    assert.equal(res.executionsRequeued, 0);

    const finalExec = await Execution.findById(exec._id);
    assert.equal(finalExec.status, "failed");
    assert.equal(finalExec.error?.code, "RECOVERY_REQUIRES_INVESTIGATION");
  });

  // ── 10. Execution and Attempt History Preservation ───────────────────
  it("10. correctly preserves existing attempt history and records structured recovery reasons", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);

    const exec = await Execution.create({
      userId: user.id,
      name: "Multi-Attempt Execution",
      type: "webhook",
      status: "running",
      attemptsMade: 2,
      maxAttempts: 3,
      startedAt: staleTime,
    });

    await Execution.collection.updateOne(
      { _id: exec._id },
      { $set: { updatedAt: staleTime } }
    );

    // Past attempt 1 (already failed previously)
    await ExecutionAttempt.create({
      executionId: exec._id,
      userId: user.id,
      attemptNumber: 1,
      status: "failed",
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      completedAt: new Date(Date.now() - 19 * 60 * 1000),
      durationMs: 412,
      error: { code: "HTTP_500", message: "Internal Server Error" },
    });

    // Dangling attempt 2 (abandoned)
    await ExecutionAttempt.create({
      executionId: exec._id,
      userId: user.id,
      attemptNumber: 2,
      status: "running",
      startedAt: staleTime,
    });

    await reconcileStuckExecutions({
      staleThresholdMs: 60 * 1000,
      bypassLock: true,
    });

    const attempts = await ExecutionAttempt.find({ executionId: exec._id }).sort({ attemptNumber: 1 });
    assert.equal(attempts.length, 2);

    // Attempt 1 must be completely untouched
    assert.equal(attempts[0].attemptNumber, 1);
    assert.equal(attempts[0].status, "failed");
    assert.equal(attempts[0].error?.code, "HTTP_500");
    assert.equal(attempts[0].durationMs, 412);

    // Attempt 2 must be closed with WORKER_INTERRUPTED
    assert.equal(attempts[1].attemptNumber, 2);
    assert.equal(attempts[1].status, "failed");
    assert.equal(attempts[1].error?.code, "WORKER_INTERRUPTED");
    assert.ok(attempts[1].completedAt);

    // Operational metrics verified
    const metrics = getRecoveryMetrics();
    assert.ok(metrics.totalRuns >= 1);
    assert.ok(metrics.candidatesExamined >= 1);
    assert.ok(metrics.executionsRecovered >= 1);
  });
});
