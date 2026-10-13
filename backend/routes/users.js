const express = require("express");
const authMiddleware = require("../middleware/auth");
const User = require("../models/User");
const logger = require("../config/logger");

const router = express.Router();

const ALLOWED_SETTINGS = [
  "defaultPlants", "defaultHerbivores", "defaultCarnivores",
  "defaultSpeed", "autoRefreshInterval",
  "alertOnCollapseRisk", "alertOnExtinction",
  "showTickNumbers", "numberFormat",
  "defaultMaxAttempts", "defaultExecutionTimeoutMs", "retryBackoffMs",
];

router.get("/settings", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("settings");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, data: { settings: user.settings } });
  } catch (err) {
    logger.error("Settings fetch error: %s", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/settings", authMiddleware, async (req, res) => {
  try {
    const patch = {};
    for (const key of ALLOWED_SETTINGS) {
      if (key in req.body) {
        patch[`settings.${key}`] = req.body[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid settings provided" });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: patch },
      { new: true, runValidators: true }
    ).select("settings");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, data: { settings: user.settings } });
  } catch (err) {
    logger.error("Settings update error: %s", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
