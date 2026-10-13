const mongoose = require("mongoose");

const { Schema } = mongoose;

const executionAttemptSchema = new Schema(
  {
    executionId: {
      type: Schema.Types.ObjectId,
      ref: "Execution",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** 1-based counter: first attempt = 1 */
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
    },

    startedAt:   { type: Date, default: Date.now },
    completedAt: { type: Date },

    /** Wall-clock milliseconds for this attempt */
    durationMs: {
      type: Number,
      min: 0,
    },

    /** Structured error captured from the handler */
    error: {
      code:    { type: String },
      message: { type: String },
      context: { type: Schema.Types.Mixed },
    },

    /** Snapshot of BullMQ job metadata at the time of this attempt */
    workerMeta: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

/** Efficient retrieval of all attempts for a given execution */
executionAttemptSchema.index(
  { executionId: 1, attemptNumber: 1 },
  { name: "idx_attempt_exec_number" }
);

module.exports = mongoose.model("ExecutionAttempt", executionAttemptSchema);
