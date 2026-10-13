const mongoose = require("mongoose");
const config = require("../config/env");
const redisClient = require("../config/redis");
const { getSystemMetrics } = require("../utils/systemMetrics");
const { getRunnelQueue } = require("../queues");
const { sendSuccess, sendError } = require("../utils/responseFormatter");
const errorCodes = require("../utils/errorCodes");

const healthCheck = async (req, res, next) => {
  try {
    const mongodbStart = Date.now();
    let mongodbStatus = "disconnected";
    let mongodbLatency = 0;
    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        mongodbLatency = Date.now() - mongodbStart;
        mongodbStatus = "connected";
      } catch {
        mongodbStatus = "error";
        mongodbLatency = Date.now() - mongodbStart;
      }
    }

    let redisStatus = "disconnected";
    let redisLatency = 0;
    if (redisClient && redisClient.status === "ready") {
      const redisStart = Date.now();
      try {
        await redisClient.ping();
        redisLatency = Date.now() - redisStart;
        redisStatus = "connected";
      } catch {
        redisStatus = "error";
        redisLatency = Date.now() - redisStart;
      }
    }

    // Check Runnel BullMQ Queue
    let queueStatus = "inactive";
    let queueCounts = null;
    const runnelQueue = getRunnelQueue();
    if (runnelQueue) {
      try {
        queueCounts = await runnelQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
        queueStatus = "operational";
      } catch (_) {
        queueStatus = "degraded";
      }
    }

    const metrics = await getSystemMetrics();
    const allHealthy = mongodbStatus === "connected" && (redisStatus === "connected" || config.NODE_ENV !== "production");
    const overallStatus = allHealthy ? "pass" : "fail";

    const payload = {
      status: overallStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: { status: mongodbStatus, latency_ms: mongodbLatency },
        redis: { status: redisStatus, latency_ms: redisLatency },
        queue: { name: "runnel-executions", status: queueStatus, counts: queueCounts },
      },
      checks: {
        websocket: { enabled: !!req.app.get("io") },
        memoryUsage: {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
        },
      },
      metrics,
    };

    if (overallStatus === "pass") {
      return sendSuccess(res, payload, 200, "Health check passed");
    }
    return sendError(res, "Service health degraded", 503, errorCodes.SERVICE_UNAVAILABLE, payload);
  } catch (error) {
    next(error);
  }
};

const livenessCheck = async (_req, res) => {
  return sendSuccess(res, {
    status: "alive",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }, 200, "Service is alive");
};

const readinessCheck = async (req, res, next) => {
  try {
    const mongodbReady = mongoose.connection.readyState === 1;
    const ioReady = !!req.app.get("io");
    const ready = mongodbReady && ioReady;
    const payload = {
      status: ready ? "ready" : "not_ready",
      checks: { mongodb: mongodbReady, websocket: ioReady },
      timestamp: new Date().toISOString(),
    };
    if (!ready) {
      return sendError(res, "Service is not ready", 503, errorCodes.SERVICE_UNAVAILABLE, payload);
    }
    return sendSuccess(res, payload, 200, "Service is ready");
  } catch (error) {
    next(error);
  }
};

module.exports = { healthCheck, livenessCheck, readinessCheck };