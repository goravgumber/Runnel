const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: Date,
    settings: {
      defaultPlants:        { type: Number, default: 1000 },
      defaultHerbivores:    { type: Number, default: 200 },
      defaultCarnivores:    { type: Number, default:  50 },
      defaultSpeed:         { type: String, default: "normal", enum: ["slow","normal","fast","ultra"] },
      autoRefreshInterval:  { type: Number, default: 10 },
      alertOnCollapseRisk:  { type: Boolean, default: true },
      alertOnExtinction:    { type: Boolean, default: true },
      showTickNumbers:      { type: Boolean, default: true },
      numberFormat:         { type: String, default: "abbreviated", enum: ["abbreviated","full"] },
      defaultMaxAttempts:   { type: Number, default: 3 },
      defaultExecutionTimeoutMs: { type: Number, default: 30000 },
      retryBackoffMs:       { type: Number, default: 1000 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
