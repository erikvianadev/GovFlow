class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errors: unknown;
  constructor(message: string, statusCode: number = 400, errors: unknown = null) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

export = AppError;
