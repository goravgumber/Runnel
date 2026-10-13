const express = require("express");
const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { getQueue, addJob } = require("../queues");
const { sendSuccess } = require("../utils/responseFormatter");
const AppError = require("../middleware/AppError");

const router = express.Router();

const KNOWN_QUEUES = ["runnel-executions"];
const ALLOWED_JOBS = new Set([
  "echo",
  "fail",
  "task",
]);

router.use(authMiddleware);

router.get("/", requireRole("admin"), async (_req, res) => {
  const queues = await Promise.all(
    KNOWN_QUEUES.map(async (name) => {
      const queue = getQueue(name);
      if (!queue) {
        return { name, available: false };
      }

      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused"
      );

      return { name, available: true, counts };
    })
  );

  return sendSuccess(res, { queues }, 200, "Queue overview fetched successfully");
});

router.get("/:queueName/jobs", requireRole("admin"), async (req, res) => {
  const queue = getQueue(req.params.queueName);
  if (!queue) throw new AppError("Queue is not available", 503);

  const status = req.query.status || "waiting";
  const start = parseInt(req.query.start, 10) || 0;
  const end = parseInt(req.query.end, 10) || 20;
  const jobs = await queue.getJobs([status], start, end, false);

  return sendSuccess(
    res,
    {
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
      })),
    },
    200,
    "Queue jobs fetched successfully"
  );
});

router.get("/:queueName/jobs/:jobId", requireRole("admin"), async (req, res) => {
  const queue = getQueue(req.params.queueName);
  if (!queue) throw new AppError("Queue is not available", 503);

  const job = await queue.getJob(req.params.jobId);
  if (!job) throw new AppError("Job not found", 404);

  const state = await job.getState();
  return sendSuccess(
    res,
    {
      job: {
        id: job.id,
        name: job.name,
        state,
        data: job.data,
        result: job.returnvalue,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
      },
    },
    200,
    "Job fetched successfully"
  );
});

router.post("/:queueName/jobs", requireRole("admin"), async (req, res) => {
  const { jobName, data = {}, options = {} } = req.body;
  if (!ALLOWED_JOBS.has(jobName)) {
    throw new AppError("Unsupported job type", 400, { allowedJobs: Array.from(ALLOWED_JOBS) });
  }

  const job = await addJob(req.params.queueName, jobName, data, options);
  if (!job) throw new AppError("Queue is not available", 503);

  return sendSuccess(
    res,
    {
      job: {
        id: job.id,
        name: job.name,
        queue: req.params.queueName,
      },
    },
    202,
    "Job queued successfully"
  );
});

module.exports = router;
