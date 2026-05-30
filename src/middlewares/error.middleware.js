const env = require("../config/env");
const { errorResponse } = require("../utils/apiResponse");

function errorMiddleware(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  const message =
    error.isOperational === true
      ? error.message
      : "Internal server error";

  const details =
    env.app.nodeEnv === "development"
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined;

  console.error(error);

  return errorResponse(res, {
    statusCode,
    message,
    details,
  });
}

module.exports = errorMiddleware;