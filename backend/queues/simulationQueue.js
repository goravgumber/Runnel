const { Queue, Worker } = require("bullmq");
const axios = require("axios");
const Simulation = require("../models/Simulation");
const Log = require("../models/Log");
const Alert = require("../models/Alert");
const logger = require("../config/logger");
const redisClient = require("../config/redis");

const isTestWithoutRedis = process.env.NODE_ENV === "test" && !process.env.TEST_WITH_REDIS;

const connection = isTestWithoutRedis
  ? null
  : redisClient && redisClient.status !== "end"
    ? { connection: redisClient }
    : null;

const tickQueue = connection
  ? new Queue("simulation-tick", connection)
  : {
      add: async () => ({ id: "mock-tick-job" }),
      getJobCounts: async () => ({ active: 0, completed: 0, failed: 0 }),
      close: async () => {},
    };

let simRunning = false;
let simSpeed = 1000;

const createTickWorker = (io) => {
  const tickWorker = new Worker(
    "simulation-tick",
    async (job) => {
      const { simulationId, sessionId, userId, currentState, initialPopulations } = job.data;
      const ssUrl = process.env.SIMULATION_SERVICE_URL || "http://localhost:3001";

      try {
        const response = await axios.post(`${ssUrl}/tick`, currentState);
        const newState = response.data;
        const { plants, herbivores, carnivores } = newState;
        const step = (currentState.step || 0) + 1;

        const events = [];
        if (plants < 10) events.push({ message: "Plants near extinction", severity: "critical" });
        if (herbivores < 3) events.push({ message: "Herbivores near extinction", severity: "critical" });
        if (carnivores === 0) events.push({ message: "Carnivores extinct", severity: "critical" });
        if (carnivores > herbivores * 2 && herbivores > 0) {
          events.push({ message: "Predator overload", severity: "warning" });
        }

        const simulation = new Simulation({
          userId, step, plants, herbivores, carnivores, events,
          sessionId: sessionId || simulationId,
        });
        await simulation.save();

        if (io) {
          io.to(`user-${userId}`).emit("tick:update", {
            simulationId, step, plants, herbivores, carnivores, events,
            timestamp: new Date().toISOString(),
          });
        }

        const sessId = sessionId || simulationId;

        const lastAlert = await Alert.findOne({ userId, sessionId: sessId })
          .sort({ tick: -1 }).lean();

        const alertCandidates = [];

        if (plants < 50) {
          alertCandidates.push({ type: "critical", message: "Plant population near extinction" });
        }
        if (herbivores < (initialPopulations?.herbivores || 200) * 0.1 && herbivores > 0) {
          alertCandidates.push({ type: "warning", message: "Herbivore population critically low" });
        }
        if (plants < 10 && herbivores < 3) {
          alertCandidates.push({ type: "critical", message: "Collapse imminent" });
        }

        for (const ac of alertCandidates) {
          if (!lastAlert || step - lastAlert.tick >= 60) {
            await Alert.create({
              userId, simulationId, sessionId: sessId,
              type: ac.type, category: "ecosystem",
              message: ac.message, tick: step,
            });
          }
        }

        const logLevel = plants < 10 || herbivores < 3 ? "critical" :
                         plants < 50 || herbivores < (initialPopulations?.herbivores || 200) * 0.2 ? "warning" : "info";

        if (logLevel === "critical") {
          await Alert.create({
            userId, simulationId, sessionId: sessId,
            type: "critical", category: "ecosystem",
            message: `Tick ${step}: Plants=${Math.round(plants)}, Herbivores=${Math.round(herbivores)}, Carnivores=${Math.round(carnivores)}`,
            tick: step,
          });
        }

        await Log.create({
          userId, sessionId: sessId, simulationId,
          tick: step, level: logLevel,
          message: `Tick ${step}: Plants=${Math.round(plants)}, Herbivores=${Math.round(herbivores)}, Carnivores=${Math.round(carnivores)}`,
          data: { plants, herbivores, carnivores, initialPopulations },
        });

        if (plants <= 0 || herbivores <= 0) {
          logger.info("Simulation ended — population crashed");
          simRunning = false;

          await Simulation.updateMany(
            { userId, sessionId: sessionId || simulationId },
            { $set: { endedAt: new Date(), outcome: "collapsed" } }
          );

          return { ...newState, step, ended: true, outcome: "collapsed" };
        }

        await tickQueue.add("tick", {
          simulationId, sessionId: sessionId || simulationId, userId,
          currentState: { plants, herbivores, carnivores, step },
          initialPopulations,
        }, { delay: simSpeed });

        return { ...newState, step, ended: false };
      } catch (error) {
        logger.error("Tick worker error: %s", error.message);
        throw error;
      }
    },
    connection
  );

  return tickWorker;
};

const getQueueStats = async () => {
  const counts = await tickQueue.getJobCounts();
  return counts;
};

const setSimRunning = (running) => { simRunning = running; };
const setSimSpeed = (speed) => { simSpeed = speed; };

module.exports = { tickQueue, createTickWorker, getQueueStats, setSimRunning, setSimSpeed };
