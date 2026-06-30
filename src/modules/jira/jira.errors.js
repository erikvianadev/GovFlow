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

// Extracts only safe diagnostic fields from a raw axios error. Deliberately
// never touches `error.config` / `error.request`: that is exactly where the
// Authorization header (Jira Basic Auth) lives. response.data is kept because
// Jira's own error payloads are useful for debugging and never echo back our
// credentials.
function sanitizeAxiosError(error) {
  if (!error) {
    return null;
  }

  return {
    message: error.message,
    code: error.code,
    status: error.response?.status,
    responseData: error.response?.data,
  };
}

class JiraTechnicalError extends Error {
  constructor(message, cause = null) {
    super(message);

    this.name = "JiraTechnicalError";
    this.cause = sanitizeAxiosError(cause);
    this.isRetryable = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  JiraBusinessError,
  JiraTechnicalError,
};
