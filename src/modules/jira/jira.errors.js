class JiraBusinessError extends Error {
  constructor(message, statusCode = 400) {
    super(message);

    this.name = "JiraBusinessError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.isBusinessFailure = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class JiraTechnicalError extends Error {
  constructor(message, cause = null) {
    super(message);

    this.name = "JiraTechnicalError";
    this.cause = cause;
    this.isRetryable = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  JiraBusinessError,
  JiraTechnicalError,
};
