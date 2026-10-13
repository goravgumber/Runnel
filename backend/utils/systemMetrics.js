const os = require("os");
const mongoose = require("mongoose");

const startTime = Date.now();

const getSystemMetrics = async () => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const dbStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";

  const memoryUsage = process.memoryUsage();
  const cpuLoad = parseFloat(os.loadavg()[0].toFixed(2));
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);

  return {
    uptime,
    dbStatus,
    cpuLoad,
    memoryUsagePercent,
    memoryUsage,
    freeMemory,
    totalMemory,
    platform: os.platform(),
    hostname: os.hostname(),
    cpuCores: os.cpus().length,
  };
};

module.exports = { getSystemMetrics };
