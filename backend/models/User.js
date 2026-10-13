const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, trim: true, lowercase: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["user", "admin", "member", "customer"],
      default: "user",
      index: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: Date,
    settings: {
      defaultMaxAttempts: { type: Number, default: 3, min: 1, max: 10 },
      defaultExecutionTimeoutMs: { type: Number, default: 30000, min: 1000, max: 300000 },
      retryBackoffMs: { type: Number, default: 1000, min: 100, max: 60000 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
