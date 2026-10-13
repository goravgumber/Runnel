const AppError = require("./AppError");
const logger = require("../utils/logger");
const { sendError } = require("../utils/responseFormatter");
const errorCodes = require("../utils/errorCodes");

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "An unexpected error occurred";
  let details = err.details || null;
  const traceId = req.traceId || undefined;

  // Handle MongoDB duplicate key errors (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "username";
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already taken`;
  }

  let errorCode = errorCodes.INTERNAL_ERROR;
  if (statusCode === 400) errorCode = errorCodes.BAD_REQUEST;
  else if (statusCode === 401) errorCode = errorCodes.UNAUTHORIZED;
  else if (statusCode === 403) errorCode = errorCodes.FORBIDDEN;
  else if (statusCode === 404) errorCode = errorCodes.NOT_FOUND;
  else if (statusCode === 409) errorCode = errorCodes.CONFLICT;

  if (err.message && err.message.includes("Validation failed")) {
    errorCode = errorCodes.VALIDATION_ERROR;
  }

  logger.error("%s %s %s [TraceId: %s] %o", req.method, req.originalUrl, message, traceId, {
    statusCode,
    errorCode,
    stack: err.stack,
    details,
  });

  const responseDetails = process.env.NODE_ENV !== "production" ? {
    stack: err.stack,
    name: err.name,
    ...(details ? { validationErrors: details } : {})
  } : details;

  sendError(res, message, statusCode, errorCode, responseDetails);
};

module.exports = {
  AppError,
  asyncHandler: require("./asyncHandler"),
  notFoundHandler,
  errorHandler,
};
