const express = require("express");
const authMiddleware = require("../middleware/auth");
const requireRole    = require("../middleware/requireRole");
const { validate }   = require("../middleware/validate");
const {
  validateSubmit,
  validateList,
  validateId,
} = require("../validators/executionValidator");
const { executionSubmitLimiter } = require("../middleware/rateLimiter");
const asyncHandler = require("../middleware/asyncHandler");
const {
  submitExecution,
  listExecutions,
  getStats,
  getExecution,
  retryExecution,
  cancelExecution,
  hardDeleteExecution,
} = require("../controllers/executionController");

const router = express.Router();

// All execution routes require authentication.
// Per-user isolation is enforced inside each controller.
router.use(authMiddleware);

/**
 * POST /api/v1/executions
 * Submit a new execution (or return an existing one via idempotency key).
 */
router.post("/", executionSubmitLimiter, validate(validateSubmit), asyncHandler(submitExecution));

/**
 * GET /api/v1/executions/stats
 * Per-user status counts (cached 5 s).
 * NOTE: must be declared before /:id so "stats" is not treated as an ObjectId.
 */
router.get("/stats", asyncHandler(getStats));

/**
 * GET /api/v1/executions
 * Paginated, filtered list of this user's executions.
 */
router.get("/", validate(validateList), asyncHandler(listExecutions));

/**
 * GET /api/v1/executions/:id
 * Execution detail + full attempt history.
 */
router.get("/:id", validate(validateId), asyncHandler(getExecution));

/**
 * POST /api/v1/executions/:id/retry
 * Manually retry a failed or cancelled execution.
 */
router.post("/:id/retry", validate(validateId), asyncHandler(retryExecution));

/**
 * POST /api/v1/executions/:id/cancel
 * Cancel a pending, retrying, or running execution.
 */
router.post("/:id/cancel", validate(validateId), asyncHandler(cancelExecution));

/**
 * DELETE /api/v1/executions/:id
 * Hard delete — admin only.
 */
router.delete("/:id", validate(validateId), requireRole("admin"), asyncHandler(hardDeleteExecution));

module.exports = router;
