class AppError extends Error {
  constructor(message, statusCode = 400, errors = null) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
