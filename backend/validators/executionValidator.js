const { body, param, query } = require("express-validator");

/**
 * Validation rules for POST /executions (submit).
 */
const validateSubmit = [
  body("name")
    .notEmpty().withMessage("name is required")
    .isString()
    .trim()
    .isLength({ max: 200 }).withMessage("name must be at most 200 characters"),

  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 }).withMessage("description must be at most 1000 characters"),

  body("type")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 64 }).withMessage("type must be at most 64 characters"),

  body("maxAttempts")
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage("maxAttempts must be an integer between 1 and 10"),

  body("idempotencyKey")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 128 }).withMessage("idempotencyKey must be 1–128 characters"),

  body("scheduledAt")
    .optional()
    .isISO8601().withMessage("scheduledAt must be a valid ISO-8601 date"),

  body("tags")
    .optional()
    .isArray({ max: 20 }).withMessage("tags must be an array of at most 20 items"),

  body("tags.*")
    .optional()
    .isString().isLength({ max: 64 }).withMessage("each tag must be at most 64 characters"),
];

/**
 * Validation rules for list/filter query-string params.
 */
const validateList = [
  query("status")
    .optional()
    .isIn(["pending", "running", "completed", "failed", "retrying", "cancelled"])
    .withMessage("invalid status value"),

  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),

  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 }),
];

/**
 * Validate that :id is a valid ObjectId.
 */
const validateId = [
  param("id")
    .isMongoId().withMessage("id must be a valid ObjectId"),
];

module.exports = { validateSubmit, validateList, validateId };
