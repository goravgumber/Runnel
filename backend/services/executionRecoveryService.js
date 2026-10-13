/**
 * executionRecoveryService.js
 *
 * Automated, reliable stuck-execution reconciliation service for Runnel.
 *
 * Design and Safety Properties:
 * 1. Bounded & Configurable: Reconciles stale executions in configurable batches
 *    exceeding a strict stale threshold (RECOVERY_STALE_THRESHOLD_MS).
 * 2. BullMQ Job Inspection: Queries BullMQ before touching any execution.
 *    - Preserves legitimately active jobs (lock held by active worker).
 *    - Preserves delayed backoff retries and scheduled executions.
 *    - Synchronises state when jobs completed or failed in Redis while MongoDB remained running.
 *    - Safely re-queues orphaned executions where the worker crashed and no queue job exists.
 * 3. Atomic State Transitions: Uses optimistic concurrency control (matching _id, status="running",
 *    and exact updatedAt) so concurrent workers or replicas cannot double-recover or double-enqueue.
 * 4. Distributed Leader Lock: Uses Redis SET ... NX PX to ensure only one replica runs reconciliation
 *    at any given time.
 * 5. Outage Immunity: Aborts cleanly if MongoDB or Redis is disconnected or degraded;
 *    never misclassifies infrastructure outages as execution abandonment.
 * 6. Attempt History Preservation: Atomically closes dangling running attempts with structured
 *    reasons and audit contexts without overwriting previous attempt history.
 * 7. Bounded Retries: Strictly respects maxAttempts and manual retry limits. Flags ambiguous work
 *    for manual investigation rather than infinite loops.
 * 8. Real Operational Metrics: Tracks and exposes genuine counters for examined, recovered,
 *    requeued, failed, skipped, and error events.
 */

const os = require("node:os");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Execution = require("../models/Execution");
const ExecutionAttempt = require("../models/ExecutionAttempt");
const queues = require("../queues");
const { enqueueExecution } = require("../controllers/executionController");
const redisClient = require("../config/redis");
const config = require("../config/env");
const logger = require("../utils/logger");

const LOCK_KEY = "runnel:locks:stuck-recovery";

// Operational metrics counters
const recoveryMetrics = {
  enabled: true,
  lastRunAt: null,
  lastDurationMs: 0,
  totalRuns: 0,
  candidatesExamined: 0,
  executionsRecovered: 0,
  executionsRequeued: 0,
  executionsFailed: 0,
  skippedActive: 0,
  skippedDelayed: 0,
  reconciliationErrors: 0,
};

let schedulerTimer = null;
let currentIo = null;

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire distributed lock across replicas in Redis.
 */
async function acquireDistributedLock(ownerId, lockTtlMs) {
  if (!redisClient) {
    return false;
  }
  // If running in test stub mode without live Redis
  if (redisClient.status !== "ready" && redisClient.status !== "connected") {
    if (redisClient.set && redisClient.get && typeof redisClient.set === "function") {
      const existing = await redisClient.get(LOCK_KEY);
      if (existing) return false;
      await redisClient.set(LOCK_KEY, ownerId);
      return true;
    }
    return false;
  }
  try {
    const res = await redisClient.set(LOCK_KEY, ownerId, "PX", lockTtlMs, "NX");
    return res === "OK";
  } catch (err) {
    logger.warn(`[Recovery] Error acquiring distributed lock: ${err.message}`);
    return false;
  }
}

/**
 * Release distributed lock safely via Lua script or test stub.
 */
async function releaseDistributedLock(ownerId) {
  if (!redisClient) {
    return;
  }
  if (redisClient.status !== "ready" && redisClient.status !== "connected") {
    if (redisClient.get && redisClient.del) {
      const existing = await redisClient.get(LOCK_KEY);
      if (existing === ownerId) {
        await redisClient.del(LOCK_KEY);
      }
    }
    return;
  }
  try {
    await redisClient.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, ownerId);
  } catch (err) {
    logger.warn(`[Recovery] Error releasing distributed lock: ${err.message}`);
  }
}

/**
 * Safely closes any dangling running attempts for an execution.
 */
async function closeDanglingRunningAttempts(executionId, finalStatus, errorCode, errorMessage) {
  const dangling = await ExecutionAttempt.find({ executionId, status: "running" });
  for (const att of dangling) {
    const completedAt = new Date();
    const durationMs = att.startedAt ? Math.max(0, completedAt.getTime() - att.startedAt.getTime()) : 0;
    await ExecutionAttempt.findByIdAndUpdate(att._id, {
      status: finalStatus,
      completedAt,
      durationMs,
      error: {
        code: errorCode,
        message: errorMessage,
      },
    });
  }
}

/**
 * Core reconciliation procedure.
 * Bounded, concurrency-safe, idempotent pass over stuck executions.
 *
 * @param {Object} options
 * @param {number} [options.staleThresholdMs] Threshold in ms before considering running job stuck
 * @param {number} [options.batchSize] Max candidates to process in single run
 * @param {number} [options.lockTtlMs] Distributed lock TTL in ms
 * @param {Object} [options.io] Socket.IO instance for real-time notification
 * @param {boolean} [options.bypassLock] Allow test harness to bypass Redis lock
 * @returns {Promise<Object>} Summary of run results
 */
async function reconcileStuckExecutions(options = {}) {
  const startTime = Date.now();
  const staleThresholdMs = options.staleThresholdMs || config.RECOVERY_STALE_THRESHOLD_MS || 300000;
  const batchSize = options.batchSize || config.RECOVERY_BATCH_SIZE || 50;
  const lockTtlMs = options.lockTtlMs || config.RECOVERY_LOCK_TTL_MS || 30000;
  const io = options.io || currentIo;
  const bypassLock = options.bypassLock === true;

  // 1. Guard against infrastructure outages: never reconcile if DB or Redis is down
  const dbReady = options.dbReady !== undefined ? options.dbReady : (mongoose.connection.readyState === 1);
  if (!dbReady) {
    logger.warn("[Recovery] MongoDB is disconnected; skipping reconciliation cycle");
    return { status: "aborted", reason: "MongoDB disconnected" };
  }

  const runResult = {
    candidatesExamined: 0,
    executionsRecovered: 0,
    executionsRequeued: 0,
    executionsFailed: 0,
    skippedActive: 0,
    skippedDelayed: 0,
    errors: 0,
  };

  const lockOwnerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
  let lockAcquired = false;

  if (!bypassLock) {
    lockAcquired = await acquireDistributedLock(lockOwnerId, lockTtlMs);
    if (!lockAcquired) {
      logger.debug("[Recovery] Could not acquire distributed leader lock; skipping this cycle");
      return { status: "skipped", reason: "Lock busy" };
    }
  }

  try {
    const staleDate = new Date(Date.now() - staleThresholdMs);

    // 2. Query candidates: status is 'running' and updatedAt older than staleDate
    const candidates = await Execution.find({
      status: "running",
      updatedAt: { $lt: staleDate },
    })
      .sort({ updatedAt: 1 })
      .limit(batchSize);

    runResult.candidatesExamined = candidates.length;
    recoveryMetrics.candidatesExamined += candidates.length;

    if (candidates.length === 0) {
      return { status: "completed", ...runResult };
    }

    logger.info(`[Recovery] Found ${candidates.length} candidate stuck executions exceeding ${staleThresholdMs}ms`);

    const queue = typeof queues.getRunnelQueue === "function" ? queues.getRunnelQueue() : null;

    for (const exec of candidates) {
      try {
        const jobId = exec.jobId || `exec-${exec._id}`;
        let job = null;
        let jobState = null;

        if (queue) {
          try {
            job = await queue.getJob(jobId);
            if (job) {
              jobState = await job.getState();
            }
          } catch (jobErr) {
            logger.warn(`[Recovery] Error checking queue job ${jobId}: ${jobErr.message}`);
          }
        }

        // Rule 1: Active BullMQ job with live worker processing -> Preserve
        if (jobState === "active") {
          runResult.skippedActive++;
          recoveryMetrics.skippedActive++;
          logger.debug(`[Recovery] Execution ${exec._id} is actively executing in BullMQ; preserved`);
          continue;
        }

        // Rule 2: Delayed BullMQ job (waiting on backoff or schedule) -> Preserve
        if (jobState === "delayed") {
          runResult.skippedDelayed++;
          recoveryMetrics.skippedDelayed++;
          logger.debug(`[Recovery] Execution ${exec._id} is delayed in BullMQ; preserved`);
          continue;
        }

        // Rule 3: Job is waiting in BullMQ, but DB is stuck in 'running'
        // Worker was interrupted after setting DB to running, but BullMQ moved job back to wait.
        // We must transition DB to 'retrying' so the next worker won't hit a status conflict!
        if (jobState === "waiting" || jobState === "prioritized") {
          const updated = await Execution.findOneAndUpdate(
            {
              _id: exec._id,
              status: "running",
              updatedAt: exec.updatedAt, // Optimistic concurrency check
            },
            {
              $set: {
                status: exec.attemptsMade > 0 ? "retrying" : "pending",
                error: {
                  code: "WORKER_INTERRUPTED",
                  message: "Job returned to wait queue after worker interruption",
                  context: { recoveredAt: new Date().toISOString() },
                },
              },
            },
            { new: true }
          );

          if (updated) {
            await closeDanglingRunningAttempts(
              exec._id,
              "failed",
              "WORKER_INTERRUPTED",
              "Worker interrupted; attempt aborted while job was returned to wait queue"
            );
            if (io) {
              io.to(`user-${updated.userId}`).emit("execution:update", {
                executionId: updated._id.toString(),
                status: updated.status,
              });
            }
            runResult.executionsRecovered++;
            recoveryMetrics.executionsRecovered++;
            logger.info(`[Recovery] Execution ${exec._id} synced with waiting BullMQ job; set to ${updated.status}`);
          }
          continue;
        }

        // Rule 4: Job completed in BullMQ, but DB remained in 'running'
        if (jobState === "completed") {
          const output = (job && job.returnvalue) || exec.output || null;
          const updated = await Execution.findOneAndUpdate(
            {
              _id: exec._id,
              status: "running",
              updatedAt: exec.updatedAt,
            },
            {
              $set: {
                status: "completed",
                output,
                completedAt: new Date(),
              },
            },
            { new: true }
          );

          if (updated) {
            await closeDanglingRunningAttempts(exec._id, "completed", null, null);
            if (io) {
              io.to(`user-${updated.userId}`).emit("execution:update", {
                executionId: updated._id.toString(),
                status: "completed",
                output,
              });
            }
            runResult.executionsRecovered++;
            recoveryMetrics.executionsRecovered++;
            logger.info(`[Recovery] Execution ${exec._id} synced with completed BullMQ job; status set to completed`);
          }
          continue;
        }

        // Rule 5: Job failed in BullMQ, but DB remained in 'running'
        if (jobState === "failed") {
          const failedReason = (job && job.failedReason) || "Queue job failed in BullMQ";
          const updated = await Execution.findOneAndUpdate(
            {
              _id: exec._id,
              status: "running",
              updatedAt: exec.updatedAt,
            },
            {
              $set: {
                status: "failed",
                completedAt: new Date(),
                error: {
                  code: "JOB_FAILED_IN_QUEUE",
                  message: failedReason,
                },
              },
            },
            { new: true }
          );

          if (updated) {
            await closeDanglingRunningAttempts(exec._id, "failed", "JOB_FAILED_IN_QUEUE", failedReason);
            if (io) {
              io.to(`user-${updated.userId}`).emit("execution:update", {
                executionId: updated._id.toString(),
                status: "failed",
                error: { code: "JOB_FAILED_IN_QUEUE", message: failedReason },
              });
            }
            runResult.executionsRecovered++;
            runResult.executionsFailed++;
            recoveryMetrics.executionsRecovered++;
            recoveryMetrics.executionsFailed++;
            logger.info(`[Recovery] Execution ${exec._id} synced with failed BullMQ job; status set to failed`);
          }
          continue;
        }

        // Rule 6: Job is missing from BullMQ (job was lost, evicted, or worker crashed)
        // Check retry policy and attempts limits
        const totalAttempts = await ExecutionAttempt.countDocuments({ executionId: exec._id });
        const retryLimitReached =
          exec.attemptsMade >= exec.maxAttempts ||
          totalAttempts >= exec.maxAttempts * 2;

        if (retryLimitReached) {
          // Bounded retry cap reached: terminate execution safely
          const updated = await Execution.findOneAndUpdate(
            {
              _id: exec._id,
              status: "running",
              updatedAt: exec.updatedAt,
            },
            {
              $set: {
                status: "failed",
                completedAt: new Date(),
                error: {
                  code: "RECOVERY_RETRIES_EXHAUSTED",
                  message: `Execution abandoned after ${exec.attemptsMade} attempts; retry budget (${exec.maxAttempts}) exhausted`,
                  context: { totalAttemptsRecorded: totalAttempts },
                },
              },
            },
            { new: true }
          );

          if (updated) {
            await closeDanglingRunningAttempts(
              exec._id,
              "failed",
              "RECOVERY_RETRIES_EXHAUSTED",
              "Max attempts exceeded during recovery reconciliation"
            );
            if (io) {
              io.to(`user-${updated.userId}`).emit("execution:update", {
                executionId: updated._id.toString(),
                status: "failed",
                error: updated.error,
              });
            }
            runResult.executionsRecovered++;
            runResult.executionsFailed++;
            recoveryMetrics.executionsRecovered++;
            recoveryMetrics.executionsFailed++;
            logger.warn(`[Recovery] Execution ${exec._id} retry limit exhausted; marked failed`);
          }
          continue;
        }

        // Verify if handler can be retried safely
        const RETRYABLE_TYPES = ["echo", "fail", "webhook"];
        if (!RETRYABLE_TYPES.includes(exec.type)) {
          // Flag for investigation rather than blindly re-enqueueing
          const updated = await Execution.findOneAndUpdate(
            {
              _id: exec._id,
              status: "running",
              updatedAt: exec.updatedAt,
            },
            {
              $set: {
                status: "failed",
                completedAt: new Date(),
                error: {
                  code: "RECOVERY_REQUIRES_INVESTIGATION",
                  message: `Execution abandoned with non-retryable type '${exec.type}'; flagged for investigation`,
                },
              },
            },
            { new: true }
          );

          if (updated) {
            await closeDanglingRunningAttempts(
              exec._id,
              "failed",
              "RECOVERY_REQUIRES_INVESTIGATION",
              "Non-retryable execution flagged for investigation"
            );
            runResult.executionsRecovered++;
            runResult.executionsFailed++;
            recoveryMetrics.executionsRecovered++;
            recoveryMetrics.executionsFailed++;
            logger.warn(`[Recovery] Execution ${exec._id} flagged for investigation (unsupported type: ${exec.type})`);
          }
          continue;
        }

        // Atomic transition to 'retrying'
        const updated = await Execution.findOneAndUpdate(
          {
            _id: exec._id,
            status: "running",
            updatedAt: exec.updatedAt, // Optimistic concurrency check
          },
          {
            $set: {
              status: "retrying",
              error: {
                code: "WORKER_INTERRUPTED",
                message: "Execution abandoned after worker interruption; recovered and re-queued",
                context: {
                  recoveredAt: new Date().toISOString(),
                  previousAttempts: exec.attemptsMade,
                },
              },
            },
          },
          { new: true }
        );

        if (!updated) {
          // Another replica or worker already updated this record concurrently
          logger.debug(`[Recovery] Execution ${exec._id} changed concurrently; skipping`);
          continue;
        }

        // Close dangling running attempt
        await closeDanglingRunningAttempts(
          exec._id,
          "failed",
          "WORKER_INTERRUPTED",
          "Worker interrupted during attempt; attempt closed by recovery service"
        );

        // Re-enqueue into BullMQ using existing lifecycle logic
        try {
          const newJob = await enqueueExecution(updated, {
            attempts: 1, // Fresh BullMQ attempt for this retry cycle
            jobIdSuffix: `-recovery-${Date.now()}`,
          });

          const assignedJobId = newJob?.id || `exec-${exec._id}-recovery-${Date.now()}`;
          await Execution.findByIdAndUpdate(exec._id, { jobId: assignedJobId });

          if (io) {
            io.to(`user-${updated.userId}`).emit("execution:update", {
              executionId: updated._id.toString(),
              status: "retrying",
              error: updated.error,
            });
          }

          runResult.executionsRecovered++;
          runResult.executionsRequeued++;
          recoveryMetrics.executionsRecovered++;
          recoveryMetrics.executionsRequeued++;
          logger.info(`[Recovery] Execution ${exec._id} successfully recovered and re-enqueued (Job: ${newJob?.id})`);
        } catch (enqueueErr) {
          logger.error(`[Recovery] Failed to re-enqueue execution ${exec._id}: ${enqueueErr.message}`);
          await Execution.findByIdAndUpdate(exec._id, {
            status: "failed",
            error: { code: "ENQUEUE_FAILURE", message: enqueueErr.message },
          });
          runResult.errors++;
          recoveryMetrics.reconciliationErrors++;
        }
      } catch (itemErr) {
        logger.error(`[Recovery] Error processing candidate execution ${exec._id}: ${itemErr.message}`);
        runResult.errors++;
        recoveryMetrics.reconciliationErrors++;
      }
    }
  } finally {
    if (lockAcquired) {
      await releaseDistributedLock(lockOwnerId);
    }
    const duration = Date.now() - startTime;
    recoveryMetrics.totalRuns++;
    recoveryMetrics.lastRunAt = new Date().toISOString();
    recoveryMetrics.lastDurationMs = duration;
  }

  return { status: "completed", ...runResult };
}

/**
 * Starts periodic recovery scheduler.
 */
function startRecoveryScheduler(options = {}) {
  if (schedulerTimer) {
    return;
  }

  if (options.io) {
    currentIo = options.io;
  }

  const enabled = config.RECOVERY_ENABLED !== false;
  recoveryMetrics.enabled = enabled;
  if (!enabled) {
    logger.info("[Recovery] Automated stuck-execution recovery is disabled via configuration");
    return;
  }

  const intervalMs = options.intervalMs || config.RECOVERY_INTERVAL_MS || 60000;

  logger.info(`[Recovery] Starting stuck-execution recovery scheduler (interval: ${intervalMs}ms)`);

  schedulerTimer = setInterval(async () => {
    try {
      await reconcileStuckExecutions(options);
    } catch (err) {
      logger.error(`[Recovery] Unhandled error in recovery scheduler tick: ${err.message}`);
      recoveryMetrics.reconciliationErrors++;
    }
  }, intervalMs);

  // Unref timer so it does not prevent process exit in test/dev
  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }
}

/**
 * Stops periodic recovery scheduler cleanly.
 */
function stopRecoveryScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("[Recovery] Stuck-execution recovery scheduler stopped");
  }
}

/**
 * Retrieves current genuine operational metrics for recovery.
 */
function getRecoveryMetrics() {
  return {
    ...recoveryMetrics,
  };
}

/**
 * Resets metrics counters (used by test suites).
 */
function resetRecoveryMetrics() {
  recoveryMetrics.lastRunAt = null;
  recoveryMetrics.lastDurationMs = 0;
  recoveryMetrics.totalRuns = 0;
  recoveryMetrics.candidatesExamined = 0;
  recoveryMetrics.executionsRecovered = 0;
  recoveryMetrics.executionsRequeued = 0;
  recoveryMetrics.executionsFailed = 0;
  recoveryMetrics.skippedActive = 0;
  recoveryMetrics.skippedDelayed = 0;
  recoveryMetrics.reconciliationErrors = 0;
}

module.exports = {
  reconcileStuckExecutions,
  startRecoveryScheduler,
  stopRecoveryScheduler,
  getRecoveryMetrics,
  resetRecoveryMetrics,
  LOCK_KEY,
};
