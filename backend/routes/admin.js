const express = require("express");
const mongoose = require("mongoose");
const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const userRepository = require("../repositories/userRepository");
const Execution = require("../models/Execution");
const ExecutionAttempt = require("../models/ExecutionAttempt");
const { sendSuccess } = require("../utils/responseFormatter");
const AppError = require("../middleware/AppError");

const router = express.Router();

router.use(authMiddleware, requireRole("admin"));

router.get("/overview", async (_req, res) => {
  const [userCount, executionCount, failedExecutions, recentExecutions] = await Promise.all([
    userRepository.count(),
    Execution.countDocuments(),
    Execution.countDocuments({ status: { $in: ["failed", "retrying"] } }),
    Execution.find().sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return sendSuccess(
    res,
    {
      overview: {
        users: userCount,
        executions: executionCount,
        failedExecutions,
        databaseState: mongoose.connection.readyState,
        uptime: process.uptime(),
      },
      recentExecutions,
    },
    200,
    "Admin overview fetched successfully"
  );
});

router.get("/users", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    userRepository.list({ limit, skip }),
    userRepository.count(),
  ]);

  return sendSuccess(
    res,
    {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
    200,
    "Users fetched successfully"
  );
});

router.patch("/users/:userId/role", async (req, res) => {
  const role = req.body.role;
  if (!["user", "admin"].includes(role)) {
    throw new AppError("role must be either user or admin", 400);
  }

  const user = await userRepository.updateById(req.params.userId, { role });
  return sendSuccess(res, { user }, 200, "User role updated successfully");
});

module.exports = router;
