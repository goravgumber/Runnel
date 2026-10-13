const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");
const helmet = require("helmet");
const compression = require("compression");
const http = require("http");
const { Server } = require("socket.io");
const swaggerUi = require("swagger-ui-express");
const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

require("./middleware/autoAsyncRouter");
const config = require("./config/env");
const logger = require("./config/logger");
const requestLogger = require("./middleware/requestLogger");
const socketAuth = require("./sockets/socketAuth");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { startExecutionWorker, stopExecutionWorker } = require("./workers/executionWorker");
const { getRunnelQueue } = require("./queues");
const requireRole = require("./middleware/requireRole");

const authRoutes = require("./routes/auth");
const executionsRoutes = require("./routes/executions");
const usersRoutes = require("./routes/users");
const queuesRoutes = require("./routes/queues");
const adminRoutes = require("./routes/admin");
const healthRoutes = require("./routes/health");
const swaggerSpec = require("./docs/swaggerSpec");

const app = express();
const server = http.createServer(app);
let isShuttingDown = false;
const io = new Server(server, {
  cors: {
    origin: config.NODE_ENV === "production" ? config.FRONTEND_URL : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

const traceMiddleware = require("./middleware/traceMiddleware");
const RedisStore = require("rate-limit-redis").default;
const redisClient = require("./config/redis");

app.use(requestLogger);
app.use(traceMiddleware);
app.disable("x-powered-by");
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }) : undefined,
  message: {
    status: "fail",
    message: "Too many requests from this IP, please try again later.",
  },
});

app.use(cors({ origin: config.NODE_ENV === "production" ? config.FRONTEND_URL : true, credentials: true }));
app.use(apiLimiter);
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(compression());

app.set("io", io);
io.use(socketAuth);

const configureRoutes = () => {
  const apiRouter = express.Router();

  apiRouter.use("/auth", authRoutes);
  apiRouter.use("/users", usersRoutes);
  apiRouter.use("/executions", executionsRoutes);
  apiRouter.use("/queues", queuesRoutes);
  apiRouter.use("/admin", adminRoutes);
  apiRouter.use("/health", healthRoutes);

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.use("/api/v1", apiRouter);
  app.use("/api", apiRouter);
  app.use("/health", healthRoutes);

  // Bull Board for Runnel Executions
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");
  createBullBoard({
    queues: [
      new BullMQAdapter(getRunnelQueue()),
    ],
    serverAdapter,
  });
  app.use("/admin/queues", requireRole("admin"), serverAdapter.getRouter());

  app.get("/", (req, res) => {
    res.json({
      status: "OK",
      service: "Runnel Execution Recovery Backend",
      version: "1.0.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
};

const ensureUserIndexes = async () => {
  try {
    const collection = mongoose.connection.collection("users");
    const indexes = await collection.indexes();
    const hasUsernameIndex = indexes.some((idx) => idx.name === "username_1");
    if (!hasUsernameIndex) {
      await collection.createIndex({ username: 1 }, { unique: true, background: true });
      logger.info("Created username_1 unique index on users collection");
    }
  } catch (err) {
    logger.warn("User index verification warning: %s", err.message);
  }
};

const startServer = async () => {
  try {
    try {
      await mongoose.connect(config.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 2000,
      });
      logger.info("MongoDB connected successfully");
    } catch (dbErr) {
      if (process.env.NODE_ENV !== "production") {
        logger.warn(`Could not connect to external MongoDB at ${config.MONGO_URI}: ${dbErr.message}. Starting embedded MongoMemoryServer for development...`);
        const { MongoMemoryServer } = require("mongodb-memory-server");
        const mongod = await MongoMemoryServer.create();
        const memUri = mongod.getUri();
        await mongoose.connect(memUri);
        logger.info(`Connected to embedded development MongoDB at ${memUri}`);
      } else {
        throw dbErr;
      }
    }
    await ensureUserIndexes();

    // Start BullMQ execution worker
    startExecutionWorker(io);

    configureRoutes();

    io.on("connection", (socket) => {
      logger.info("Socket connected", { socketId: socket.id, userId: socket.user?.id });
      if (socket.user?.id) {
        socket.join(socket.user.id);
        socket.join(`user-${socket.user.id}`);
      }
      socket.emit("connection-success", { socketId: socket.id, userId: socket.user?.id });

      socket.on("request-metrics", async () => {
        try {
          const { getSystemMetrics } = require("./utils/systemMetrics");
          const metrics = await getSystemMetrics();
          socket.emit("metrics-update", metrics);
        } catch (error) {
          socket.emit("metrics-error", { message: error.message });
        }
      });

      socket.on("disconnect", (reason) => {
        logger.info("Socket disconnected", { socketId: socket.id, reason });
      });
    });

    const port = config.PORT;
    server.listen(port, () => {
      logger.info("Runnel Backend Server started", { port, nodeEnv: config.NODE_ENV });
    });
  } catch (error) {
    logger.error("Server startup failed", error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    logger.info("Shutdown initiated", { signal });
    await stopExecutionWorker();
    if (redisClient && redisClient.status !== "end") {
      await redisClient.quit();
      logger.info("Redis client closed");
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");

    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  } catch (error) {
    logger.error("Shutdown error", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection detected", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception detected", error);
});

if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, startServer, shutdown };
