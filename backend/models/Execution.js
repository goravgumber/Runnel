const mongoose = require("mongoose");
const crypto = require("crypto");

const { Schema } = mongoose;

const executionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    /** Execution type — maps to a handler in the worker registry */
    type: {
      type: String,
      default: "echo",
      trim: true,
    },

    // ── Lifecycle ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "retrying", "cancelled"],
      default: "pending",
      index: true,
    },

    // ── Payload ──────────────────────────────────────────────────────
    /** Caller-supplied input — any JSON-serialisable value */
    input: {
      type: Schema.Types.Mixed,
    },

    /**
     * SHA-256 of canonical JSON of `input`.
     * Used to detect payload conflicts on idempotency-key re-submission.
     * Never returned by default (select: false).
     */
    inputHash: {
      type: String,
      select: false,
    },

    /** Handler output on success */
    output: {
      type: Schema.Types.Mixed,
    },

    /** Structured error on failure */
    error: {
      code:    { type: String },
      message: { type: String },
      /** Stack written only in non-production environments */
      stack:   { type: String },
      context: { type: Schema.Types.Mixed },
    },

    // ── Retry policy ─────────────────────────────────────────────────
    /** Max automatic + manual attempts combined */
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },

    /** Monotonically increasing counter updated by the worker */
    attemptsMade: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Timing ───────────────────────────────────────────────────────
    scheduledAt: { type: Date, default: Date.now },
    startedAt:   { type: Date },
    completedAt: { type: Date },

    // ── Idempotency ──────────────────────────────────────────────────
    /**
     * Caller-supplied opaque string.
     * Per-user scope enforced by the compound unique index below.
     */
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
    },

    // ── BullMQ correlation ───────────────────────────────────────────
    jobId: {
      type: String,
      index: true,
    },

    // ── Classification ───────────────────────────────────────────────
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──────────────────────────────────────────────────────────

/**
 * Unique idempotency per user.
 * sparse: true excludes documents without an idempotencyKey.
 */
executionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "idx_execution_user_idempotency",
  }
);

/** Fast inbox listing: user + status + reverse-chron */
executionSchema.index(
  { userId: 1, status: 1, createdAt: -1 },
  { name: "idx_execution_inbox" }
);

// ── Statics ──────────────────────────────────────────────────────────

/**
 * Compute canonical SHA-256 hash of an input value.
 * Callers should pass normalised objects (insertion-order keys).
 */
executionSchema.statics.hashInput = function (input) {
  const canonical = JSON.stringify(input !== undefined ? input : null);
  return crypto.createHash("sha256").update(canonical).digest("hex");
};

module.exports = mongoose.model("Execution", executionSchema);
