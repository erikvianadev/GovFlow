const env = require("../config/env");
const logger = require("../config/logger");
const { errorResponse } = require("../utils/apiResponse");

function errorMiddleware(error, req, res, next) {
  // Trust error metadata (status code, message) only when it is safe to expose:
  //  - operational errors raised intentionally by the app (AppError, JiraBusinessError); or
  //  - well-formed HTTP client errors (4xx) from the `http-errors` convention used
  //    by Express body-parser, which explicitly mark themselves `expose: true`
  //    (e.g. PayloadTooLargeError 413, malformed-JSON 400).
  // Everything else (driver/network/5xx/unflagged errors) is an unexpected
  // failure: forced to 500 with a generic body so it cannot dictate the HTTP
  // status or leak internal structure through the response.
  const isOperational = error.isOperational === true;

  const isExposableHttpClientError =
    error.expose === true &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500;

  const isClientSafe = isOperational || isExposableHttpClientError;

  const statusCode = isClientSafe ? error.statusCode || 500 : 500;

  const message = isClientSafe ? error.message : "Internal server error";

  // Validation error arrays are an application-specific concern; only ever
  // surface them for our own operational errors.
  const errors = isOperational ? error.errors : undefined;

  // Technical details (including the stack trace) are only ever exposed in
  // development to aid local debugging. In test and production the response
  // body carries no name/message/stack from the underlying error.
  const details =
    env.app.nodeEnv === "development"
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined;

  // Always log the full error server-side; this never reaches the client.
  // req.log is set by pino-http and is already correlated with this request's
  // req.id. Fall back to the shared logger if it is ever missing (e.g. an error
  // raised outside the normal middleware chain, or a direct unit-test call).
  const log = req.log || logger;

  log.error({ err: error }, "Unhandled error");

  return errorResponse(res, {
    statusCode,
    message,
    errors,
    details,
  });
}

module.exports = errorMiddleware;
