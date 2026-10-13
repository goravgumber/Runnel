/**
 * executionController.js
 *
 * Handles the lifecycle of Execution records:
 *   submit, list, get, stats, retry, cancel, hardDelete.
 *
 * Concurrency-safe retry uses an atomic findOneAndUpdate with a
 * status precondition so two simultaneous retry requests cannot both
 * succeed and double-enqueue the same execution.
 *
 * Queue-enqueue failure recovery: if addJob throws after the MongoDB
 * record is created, the execution is immediately marked `failed` with
 * an ENQUEUE_FAILURE error so it is visible in the inbox and can be
 * manually retried once the queue recovers.
 */

const Execution        = require("../models/Execution");
const ExecutionAttempt = require("../models/ExecutionAttempt");
const queues           = require("../queues");
const AppError         = require("../middleware/AppError");
const { sendSuccess }  = require("../utils/responseFormatter");
const logger           = require("../utils/logger");
const cache            = require("../utils/cache");

// ── Helpers ──────────────────────────────────────────────────────────

const STATS_CACHE_KEY = (userId) => `runnel:stats:${userId}`;
const STATS_TTL_S = 5;

async function enqueueExecution(exec, overrides = {}) {
  const delayMs =
    exec.scheduledAt && exec.scheduledAt > new Date()
      ? Math.max(0, exec.scheduledAt - Date.now())
      : 0;

  const job = await queues.addJob(
    "runnel-executions",
    "run-execution",
    { executionId: exec._id.toString() },
    {
      delay: delayMs,
      attempts: exec.maxAttempts,
      backoff: { type: "exponential", delay: 5000 },
      // Stable jobId prevents double-enqueue if the HTTP request is retried
      // by the caller before the first job completes.
      jobId: `exec-${exec._id}${overrides.jobIdSuffix || ""}`,
      ...overrides,
    }
  );
  return job;
}

// ── Controllers ──────────────────────────────────────────────────────

/**
 * POST /executions
 *
 * Idempotency rules:
 *   - No key:         always create a new execution.
 *   - Key + same payload hash: return existing execution (200).
 *   - Key + different payload hash: 409 Conflict.
 */
const submitExecution = async (req, res) => {
  const {
    name,
    description,
    type = "echo",
    input,
    maxAttempts = 3,
    tags = [],
    idempotencyKey,
    scheduledAt,
  } = req.body;
  const userId = req.user.id;

  // ── Idempotency check ──────────────────────────────────────────────
  if (idempotencyKey) {
    const incomingHash = Execution.hashInput(input);
    const existing = await Execution
      .findOne({ userId, idempotencyKey })
      .select("+inputHash");

    if (existing) {
      if (existing.inputHash !== incomingHash) {
        throw new AppError(
          "An execution with this idempotencyKey already exists with a different payload",
          409,
          { existingId: existing._id }
        );
      }
      // Same payload — return the existing execution (omit inputHash)
      const safe = existing.toObject();
      delete safe.inputHash;
      return sendSuccess(res, safe, 200, "Duplicate submission — existing execution returned");
    }
  }

  // ── Create record ──────────────────────────────────────────────────
  const exec = await Execution.create({
    userId,
    name,
    description,
    type,
    input,
    inputHash: Execution.hashInput(input),
    maxAttempts: Number(maxAttempts),
    tags,
    idempotencyKey: idempotencyKey || undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
  });

  // ── Enqueue (with failure recovery) ───────────────────────────────
  try {
    const job = await enqueueExecution(exec);
    if (job?.id) {
      await Execution.findByIdAndUpdate(exec._id, { jobId: job.id });
    }
  } catch (enqueueErr) {
    logger.error(
      `[ExecCtrl] Failed to enqueue execution ${exec._id}: ${enqueueErr.message}`
    );
    // Mark the execution as failed so it appears in the inbox and can be retried
    await Execution.findByIdAndUpdate(exec._id, {
      status: "failed",
      error: {
        code:    "ENQUEUE_FAILURE",
        message: `Failed to enqueue job: ${enqueueErr.message}`,
      },
    });
    // Still return the execution — the caller can inspect it and retry
    const failed = await Execution.findById(exec._id);
    return sendSuccess(res, failed, 202, "Execution created but could not be enqueued — see status");
  }

  // Return fresh doc (with jobId populated)
  const result = await Execution.findById(exec._id);
  return sendSuccess(res, result, 202, "Execution submitted");
};

/**
 * GET /executions
 *
 * Paginated, filtered list. Strict per-user isolation.
 */
const listExecutions = async (req, res) => {
  const userId = req.user.id;
  const {
    status,
    type,
    tag,
    page = 1,
    limit = 20,
    search,
  } = req.query;

  const query = { userId };
  if (status) query.status = status;
  if (type)   query.type   = type;
  if (tag)    query.tags   = tag;
  if (search) query.name   = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip     = (pageNum - 1) * pageSize;

  const [executions, total] = await Promise.all([
    Execution.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Execution.countDocuments(query),
  ]);

  return sendSuccess(res, {
    executions,
    total,
    page:  pageNum,
    limit: pageSize,
    pages: Math.ceil(total / pageSize),
  });
};

/**
 * GET /executions/stats
 *
 * Cached (5 s) per-user inbox counts.
 */
const getStats = async (req, res) => {
  const userId = req.user.id;
  const cacheKey = STATS_CACHE_KEY(userId);

  const cached = await cache.get(cacheKey);
  if (cached) return sendSuccess(res, cached);

  const counts = await Execution.aggregate([
    { $match: { userId: req.user._id || new (require("mongoose").Types.ObjectId)(userId) } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const stats = {
    pending:   0,
    running:   0,
    completed: 0,
    failed:    0,
    retrying:  0,
    cancelled: 0,
    total:     0,
  };
  for (const row of counts) {
    if (row._id in stats) stats[row._id] = row.count;
    stats.total += row.count;
  }

  await cache.set(cacheKey, stats, STATS_TTL_S);
  return sendSuccess(res, stats);
};

/**
 * GET /executions/:id
 *
 * Returns the execution + all attempt records.
 * Returns 404 if not found OR belongs to a different user (no info leak).
 */
const getExecution = async (req, res) => {
  const exec = await Execution
    .findOne({ _id: req.params.id, userId: req.user.id })
    .lean();

  if (!exec) throw new AppError("Execution not found", 404);

  const attempts = await ExecutionAttempt
    .find({ executionId: exec._id })
    .sort({ attemptNumber: 1 })
    .lean();

  return sendSuccess(res, { ...exec, attempts });
};

/**
 * POST /executions/:id/retry
 *
 * Concurrency-safe:
 *   - Uses atomic findOneAndUpdate with status precondition.
 *   - Total attempt cap: maxAttempts * 2 (automatic + manual combined).
 *   - Returns 409 if execution is not in a retryable state.
 *   - Returns 429 if the retry cap is reached.
 */
const retryExecution = async (req, res) => {
  // Atomically transition status from failed/cancelled → pending.
  // If another request beats us to it, findOneAndUpdate returns null.
  const exec = await Execution.findOneAndUpdate(
    {
      _id:    req.params.id,
      userId: req.user.id,
      status: { $in: ["failed", "cancelled"] },
    },
    { $set: { status: "pending" }, $unset: { error: 1 } },
    { new: true }
  );

  if (!exec) {
    // Check whether the execution exists (or belongs to this user) at all
    const exists = await Execution.exists({ _id: req.params.id, userId: req.user.id });
    if (!exists) throw new AppError("Execution not found", 404);
    throw new AppError("Only failed or cancelled executions can be retried", 409);
  }

  // Enforce hard cap on total attempts (auto + manual)
  const totalAttempts = await ExecutionAttempt.countDocuments({ executionId: exec._id });
  if (totalAttempts >= exec.maxAttempts * 2) {
    // Roll the status back — we optimistically set it to pending above
    await Execution.findByIdAndUpdate(exec._id, { status: "failed" });
    throw new AppError(
      `Manual retry limit reached (cap: ${exec.maxAttempts * 2} total attempts)`,
      429
    );
  }

  // Enqueue a single-attempt job (BullMQ handles its own retry budget
  // separately; this manual retry is intentionally a fresh job).
  let jobId = null;
  try {
    const job = await enqueueExecution(exec, {
      attempts: 1,
      jobIdSuffix: `-manual-${Date.now()}`,
    });
    jobId = job?.id;
  } catch (enqueueErr) {
    logger.error(`[ExecCtrl] Failed to enqueue retry for ${exec._id}: ${enqueueErr.message}`);
    await Execution.findByIdAndUpdate(exec._id, {
      status: "failed",
      error: { code: "ENQUEUE_FAILURE", message: enqueueErr.message },
    });
    throw new AppError(`Retry queuing failed: ${enqueueErr.message}`, 503);
  }

  return sendSuccess(res, { message: "Execution queued for retry", jobId }, 202);
};

/**
 * POST /executions/:id/cancel
 *
 * Cancels a pending or retrying execution.
 * Completed or already-cancelled executions return 409.
 */
const cancelExecution = async (req, res) => {
  const exec = await Execution.findOneAndUpdate(
    {
      _id:    req.params.id,
      userId: req.user.id,
      status: { $in: ["pending", "retrying", "running"] },
    },
    { $set: { status: "cancelled" } },
    { new: true }
  );

  if (!exec) {
    const exists = await Execution.exists({ _id: req.params.id, userId: req.user.id });
    if (!exists) throw new AppError("Execution not found", 404);
    throw new AppError(
      "Only pending, retrying, or running executions can be cancelled",
      409
    );
  }

  return sendSuccess(res, { message: "Execution cancelled" });
};

/**
 * DELETE /executions/:id
 *
 * Hard delete — admin-only, audit use.
 * Per-user isolation applies: deletes only the calling user's executions.
 * (Future cross-user admin access requires a dedicated permission + audit trail.)
 */
const hardDeleteExecution = async (req, res) => {
  const exec = await Execution.findOneAndDelete({
    _id:    req.params.id,
    userId: req.user.id,
  });

  if (!exec) throw new AppError("Execution not found", 404);

  // Clean up attempt records
  await ExecutionAttempt.deleteMany({ executionId: exec._id });

  return sendSuccess(res, { message: "Execution permanently deleted" });
};

module.exports = {
  submitExecution,
  listExecutions,
  getStats,
  getExecution,
  retryExecution,
  cancelExecution,
  hardDeleteExecution,
};
