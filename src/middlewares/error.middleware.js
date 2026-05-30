const env = require('../config/env');

function errorMiddleware(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  const response = {
    status: 'error',
    message: err.isOperational === true
      ? err.message
      : "Internal Server Error",
  };

  if (env.app.nodeEnv === 'development') {
    response.details = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  console.error(err);

  return res.status(statusCode).json(response);
}

module.exports = errorMiddleware;