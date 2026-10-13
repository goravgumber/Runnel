process.env.NODE_ENV = "test";

require("../../middleware/autoAsyncRouter");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const executionsRoutes = require("../../routes/executions");
const authRoutes = require("../../routes/auth");
const { errorHandler } = require("../../middleware/errorHandler");
const config = require("../../config/env");

let mongod = null;

async function setupTestDb() {
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
  }
}

async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  try {
    const { closeQueues } = require("../../queues");
    await closeQueues();
  } catch (_) {}
  try {
    const redisClient = require("../../config/redis");
    if (redisClient && typeof redisClient.quit === "function" && redisClient.status === "ready") {
      await redisClient.quit();
    }
  } catch (_) {}
}

async function clearTestDb() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

function generateToken(payload = {}) {
  const defaultPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    username: "testuser_" + Math.random().toString(36).substring(7),
    role: "user",
  };
  const tokenPayload = { ...defaultPayload, ...payload };
  const token = jwt.sign(tokenPayload, config.JWT_SECRET || "development_fallback_secret_key_9999", {
    expiresIn: "1h",
  });
  return { token, user: tokenPayload };
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/executions", executionsRoutes);
  app.use("/api/v1/auth", authRoutes);
  const simulationRoutesFactory = require("../../routes/simulation");
  const mockIo = { emit: () => {}, to: () => ({ emit: () => {} }) };
  app.use("/api/v1/simulation", simulationRoutesFactory(mockIo));
  app.use(errorHandler);
  return app;
}

module.exports = {
  setupTestDb,
  teardownTestDb,
  clearTestDb,
  generateToken,
  createTestApp,
};
