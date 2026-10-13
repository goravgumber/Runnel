/**
 * executionWorker.js
 *
 * BullMQ worker for the "runnel-executions" queue.
 *
 * Design decisions captured here:
 *
 * 1. Concurrency-safe retry: the worker reads the execution fresh from
 *    MongoDB on every invocation. It uses an atomic findOneAndUpdate
 *    with a status precondition before mutating state, so two concurrent
 *    workers processing the same job cannot double-count attempts.
 *
 * 2. Attempt recording: every attempt is written as a separate
 *    ExecutionAttempt document. The Execution.attemptsMade counter is
 *    incremented atomically via $inc to avoid lost updates.
 *
 * 3. Error handling: handler errors re-throw so BullMQ's own retry /
 *    backoff logic kicks in. Only after BullMQ exhausts its retry budget
 *    (job.opts.attempts) does the execution land in `failed`.
 *
 * 4. Cancelled executions: if status is `cancelled` when the worker
 *    picks up the job, we return early — the job is considered consumed.
 *
 * 5. Socket.IO: injected at startup the same way as createTickWorker.
 */

const { Worker } = require("bullmq");
const redisClient       = require("../config/redis");
const Execution         = require("../models/Execution");
const ExecutionAttempt  = require("../models/ExecutionAttempt");
const logger            = require("../utils/logger");

const { dispatchWebhook } = require("../utils/webhookClient");
const { startRecoveryScheduler, stopRecoveryScheduler } = require("../services/executionRecoveryService");

// ── Handler registry ─────────────────────────────────────────────────
// Each handler receives (input, { job, exec }) and must return a
// JSON-serialisable result or throw an Error.
// Additional handlers will be registered here in Phase 2.
const HANDLER_REGISTRY = {
  /**
   * echo — reflects input back as output.
   * Useful for smoke-testing the entire pipeline end-to-end.
   */
  echo: async (input) => ({ echoed: input, at: new Date().toISOString() }),

  /**
   * fail — always throws.
   * Useful for testing retry / failure paths without mocking.
   */
  fail: async (input) => {
    const err = new Error(input?.reason || "Intentional failure");
    err.code = "INTENTIONAL_FAILURE";
    throw err;
  },
  /**
   * webhook — performs HTTP dispatch / webhook delivery.
   * Primary production handler for Runnel's asynchronous recovery inbox.
   * Enforces URL validation, DNS rebinding pinning, SSRF checks, redirect limits, and response bounds.
   */
  webhook: async (input) => {
    const allowInternal = process.env.NODE_ENV === "test";
    return dispatchWebhook(input, { allowInternal });
  },
};

function resolveHandler(type) {
  if (HANDLER_REGISTRY[type]) {
    return HANDLER_REGISTRY[type];
  }
  if (process.env.NODE_ENV === "production") {
    const err = new Error(`Unsupported execution handler type: '${type}'`);
    err.code = "UNKNOWN_HANDLER";
    throw err;
  }
  return HANDLER_REGISTRY["echo"];
}

// ── Worker factory ───────────────────────────────────────────────────

const processExecutionJob = async (job, io) => {
  const { executionId } = job.data;

  // ── 1. Load execution, bail out if cancelled ──────────────────
  const exec = await Execution.findById(executionId);
  if (!exec) {
    logger.warn(`[ExecWorker] Execution ${executionId} not found; skipping job ${job.id}`);
    return null;
  }
  if (exec.status === "cancelled") {
    logger.info(`[ExecWorker] Execution ${executionId} is cancelled; consuming job ${job.id} without work`);
    return null;
  }

  // ── 2. Determine this attempt's number ────────────────────────
  // Use $inc atomically so concurrent workers cannot use the same
  // attempt number for the same execution.
  const updated = await Execution.findOneAndUpdate(
    {
      _id: executionId,
      status: { $in: ["pending", "retrying"] },
    },
    {
      $inc: { attemptsMade: 1 },
      $set: {
        status: "running",
        startedAt: exec.startedAt || new Date(),
      },
    },
    { new: true }
  );

  if (!updated) {
    // Another worker already picked this up, or status changed.
    logger.warn(
      `[ExecWorker] Execution ${executionId} status conflict; skipping job ${job.id}`
    );
    return null;
  }

  const attemptNumber = updated.attemptsMade;

  // ── 3. Record the attempt ─────────────────────────────────────
  const attempt = await ExecutionAttempt.create({
    executionId: updated._id,
    userId: updated.userId,
    attemptNumber,
    status: "running",
    startedAt: new Date(),
    workerMeta: {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      queue: job.queueName,
    },
  });

  // ── 4. Emit real-time update ──────────────────────────────────
  if (io) {
    io.to(`user-${updated.userId}`).emit("execution:update", {
      executionId,
      status: "running",
      attemptNumber,
    });
  }

  // ── 5. Invoke handler ─────────────────────────────────────────
  const handler = resolveHandler(updated.type);

  try {
    const output = await handler(updated.input, { job, exec: updated });

    const completedAt = new Date();
    const durationMs  = completedAt - attempt.startedAt;

    // Update attempt
    await ExecutionAttempt.findByIdAndUpdate(attempt._id, {
      status: "completed",
      completedAt,
      durationMs,
    });

    // Update execution
    await Execution.findByIdAndUpdate(executionId, {
      status: "completed",
      output,
      completedAt,
    });

    if (io) {
      io.to(`user-${updated.userId}`).emit("execution:update", {
        executionId,
        status: "completed",
        output,
      });
    }

    logger.info(`[ExecWorker] Execution ${executionId} completed on attempt ${attemptNumber}`);
    return output;

  } catch (err) {
    const completedAt    = new Date();
    const durationMs     = completedAt - attempt.startedAt;
    // BullMQ increments job.attemptsMade after each failure,
    // so after this throw, job.attemptsMade + 1 = total attempts used.
    const isFinalAttempt = (job.attemptsMade || 0) + 1 >= (job.opts?.attempts || 1);
    const nextStatus     = isFinalAttempt ? "failed" : "retrying";

    // Record failure in the attempt document
    await ExecutionAttempt.findByIdAndUpdate(attempt._id, {
      status: "failed",
      completedAt,
      durationMs,
      error: {
        code:    err.code || "HANDLER_ERROR",
        message: err.message,
      },
    });

    // Update execution status and capture error
    const errorPayload = {
      code:    err.code || "HANDLER_ERROR",
      message: err.message,
    };
    if (process.env.NODE_ENV !== "production" && err.stack) {
      errorPayload.stack = err.stack;
    }

    await Execution.findByIdAndUpdate(executionId, {
      status: nextStatus,
      error:  errorPayload,
    });

    if (io) {
      io.to(`user-${updated.userId}`).emit("execution:update", {
        executionId,
        status: nextStatus,
        error: { code: errorPayload.code, message: errorPayload.message },
      });
    }

    logger.error(
      `[ExecWorker] Execution ${executionId} attempt ${attemptNumber} failed (final: ${isFinalAttempt}): ${err.message}`
    );

    // Re-throw so BullMQ applies its backoff / retry budget
    throw err;
  }
};

let activeWorker = null;

const startExecutionWorker = (io) => {
  if (!redisClient) {
    logger.warn("Redis unavailable; execution worker will not start.");
    return null;
  }

  activeWorker = new Worker(
    "runnel-executions",
    async (job) => processExecutionJob(job, io),
    {
      connection: redisClient,
      concurrency: 4,
    }
  );

  activeWorker.on("completed", (job) =>
    logger.info(`[ExecWorker] Job ${job.id} completed`)
  );
  activeWorker.on("failed", (job, err) =>
    logger.error(`[ExecWorker] Job ${job?.id} failed after all attempts: ${err.message}`)
  );

  startRecoveryScheduler({ io });
  logger.info("Execution worker started (queue: runnel-executions, concurrency: 4)");
  return activeWorker;
};

const stopExecutionWorker = async () => {
  stopRecoveryScheduler();
  if (activeWorker) {
    try {
      await activeWorker.close();
      logger.info("Execution worker closed gracefully");
    } catch (_) {}
    activeWorker = null;
  }
};

module.exports = { startExecutionWorker, stopExecutionWorker, processExecutionJob, HANDLER_REGISTRY, resolveHandler };

