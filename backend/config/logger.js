const fs = require("fs");
const path = require("path");
const winston = require("winston");

const isProduction = process.env.NODE_ENV === "production";
const logDirectory = path.resolve(__dirname, "../logs");

if (isProduction && !fs.existsSync(logDirectory)) {
  try {
    fs.mkdirSync(logDirectory, { recursive: true });
  } catch (err) {
    // Gracefully handle read-only or restricted environments; console transport remains active
  }
}

const scrubSecrets = winston.format((info) => {
  const scrubString = (str) => {
    if (typeof str !== "string") return str;
    return str.replace(/:\/\/([^:@\s]+):([^@\s]+)@/g, "://$1:[REDACTED]@");
  };

  const scrubObject = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "string") {
        obj[key] = scrubString(obj[key]);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        scrubObject(obj[key]);
      }
    }
  };

  scrubObject(info);
  return info;
});

const timestamp = winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" });
const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction
    ? winston.format.combine(
        timestamp,
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        scrubSecrets(),
        winston.format.json()
      )
    : winston.format.combine(
        timestamp,
        winston.format.colorize(),
        winston.format.splat(),
        scrubSecrets(),
        winston.format.printf(({ level, message, timestamp: at, stack }) => `[${at}] ${level}: ${message}${stack ? `\n${stack}` : ""}`)
      ),
  transports: isProduction
    ? [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(logDirectory, "combined.log") }),
        new winston.transports.File({ filename: path.join(logDirectory, "error.log"), level: "error" }),
      ]
    : [new winston.transports.Console()],
});

logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = logger;
