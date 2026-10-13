const { Queue } = require("bullmq");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");

const queues = {};

const RUNNEL_QUEUE = "runnel-executions";

const getQueue = (name) => {
  if (!redisClient || redisClient.status === "end" || !redisClient.status) {
    logger.warn(`Redis is not connected; cannot initialize queue: ${name}`);
    return null;
  }

  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: { age: 24 * 3600 }, // Keep completed jobs for 24h
        removeOnFail: { age: 7 * 24 * 3600 },  // Keep failed jobs for 7 days
      },
    });
    logger.info(`BullMQ Queue successfully initialized: ${name}`);
  }
  return queues[name];
};

const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.warn(`Skipped queueing job '${jobName}' on '${queueName}'; Queue unavailable`);
    return null;
  }

  try {
    const job = await queue.add(jobName, data, options);
    logger.info(`[Queue] Added job ${job.id} to '${queueName}' (Type: ${jobName})`);
    return job;
  } catch (error) {
    logger.error(`[Queue] Failed to append job to '${queueName}': %s`, error.message);
    throw error;
  }
};

const getRunnelQueue = () => getQueue(RUNNEL_QUEUE);

const closeQueues = async () => {
  for (const name of Object.keys(queues)) {
    try {
      await queues[name].close();
    } catch (_) {}
    delete queues[name];
  }
};

module.exports = {
  getQueue,
  addJob,
  getRunnelQueue,
  closeQueues,
  RUNNEL_QUEUE,
};
