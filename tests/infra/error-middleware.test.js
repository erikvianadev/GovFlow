const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const AppError = require("../../src/errors/AppError");

const errorMiddlewarePath = path.join(
  __dirname,
  "../../src/middlewares/error.middleware.js"
);
const envPath = path.join(__dirname, "../../src/config/env.js");
const apiResponsePath = path.join(__dirname, "../../src/utils/apiResponse.js");
const loggerPath = path.join(__dirname, "../../src/config/logger.js");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

// Load the error middleware with config/env mocked to a specific NODE_ENV.
// The real apiResponse is kept so the response shaping is exercised end to end.
function loadErrorMiddleware(nodeEnv) {
  [errorMiddlewarePath, envPath, apiResponsePath, loggerPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(envPath, { app: { nodeEnv } });
  mockModule(loggerPath, { error: () => {} });

  return require(errorMiddlewarePath);
}

// Minimal Express-like response capturing status code and JSON body.
function createMockResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runMiddleware(nodeEnv, error) {
  const errorMiddleware = loadErrorMiddleware(nodeEnv);
  const res = createMockResponse();

  // req is {} here, so error.middleware falls back to the (mocked, silent)
  // shared logger instead of req.log — no console patching needed.
  errorMiddleware(error, {}, res, () => {});

  return res;
}

test("development + non-operational error returns 500 generic body with details", () => {
  const error = new Error("low level failure with secret detail");
  const res = runMiddleware("development", error);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, "Internal server error");
  assert.ok(res.body.details, "details should be present in development");
  assert.strictEqual(res.body.details.name, "Error");
  assert.strictEqual(
    res.body.details.message,
    "low level failure with secret detail"
  );
  assert.ok(
    typeof res.body.details.stack === "string" &&
      res.body.details.stack.length > 0,
    "stack should be present in development"
  );
  // Untrusted errors must not surface an errors array.
  assert.strictEqual(res.body.errors, undefined);
});

test("production + non-operational error returns 500 generic body without details", () => {
  const error = new Error("low level failure with secret detail");
  const res = runMiddleware("production", error);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.message, "Internal server error");
  assert.strictEqual(res.body.details, undefined);
  assert.strictEqual(res.body.errors, undefined);
});

test("production + operational error preserves status, message and errors without details", () => {
  const validationErrors = [{ field: "email", message: "Email is required" }];
  const error = new AppError("Validation failed", 400, validationErrors);
  const res = runMiddleware("production", error);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.message, "Validation failed");
  assert.deepStrictEqual(res.body.errors, validationErrors);
  assert.strictEqual(res.body.details, undefined);
});

test("development + operational error preserves message/errors and includes details", () => {
  const validationErrors = [{ field: "email", message: "Email is required" }];
  const error = new AppError("Validation failed", 400, validationErrors);
  const res = runMiddleware("development", error);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.message, "Validation failed");
  assert.deepStrictEqual(res.body.errors, validationErrors);
  assert.ok(res.body.details, "details should be present in development");
  assert.strictEqual(res.body.details.name, "AppError");
});

test("production + exposable http client error (4xx) passes through its status and message", () => {
  // Mirrors Express body-parser's PayloadTooLargeError (http-errors convention).
  const error = new Error("request entity too large");
  error.name = "PayloadTooLargeError";
  error.statusCode = 413;
  error.expose = true;

  const res = runMiddleware("production", error);

  assert.strictEqual(res.statusCode, 413);
  assert.strictEqual(res.body.message, "request entity too large");
  // No application validation errors and no debug details in production.
  assert.strictEqual(res.body.errors, undefined);
  assert.strictEqual(res.body.details, undefined);
});

test("production + error claiming expose on a 5xx status is still masked to 500", () => {
  // `expose` must never let a server-side (5xx) error through.
  const error = new Error("internal detail that must not leak");
  error.statusCode = 500;
  error.expose = true;

  const res = runMiddleware("production", error);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.message, "Internal server error");
  assert.strictEqual(res.body.details, undefined);
});

test("production + non-operational error with planted statusCode/errors is forced to 500 and stripped", () => {
  // Simulate a third-party/runtime error that carries attacker-influenced or
  // misleading metadata but is NOT flagged as operational.
  const error = new Error("teapot");
  error.statusCode = 418;
  error.errors = [{ field: "internal", message: "should never be exposed" }];

  const res = runMiddleware("production", error);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.message, "Internal server error");
  assert.strictEqual(res.body.errors, undefined);
  assert.strictEqual(res.body.details, undefined);
});
