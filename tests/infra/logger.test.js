const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");
const { Writable } = require("node:stream");
const pino = require("pino");

const loggerPath = path.join(__dirname, "../../src/config/logger.js");
const envPath = path.join(__dirname, "../../src/config/env.js");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

// Load the real logger with config/env mocked. nodeEnv is kept off
// "development" so no pino-pretty transport worker thread is spawned during
// the test run.
function loadLogger({ level, nodeEnv = "test" }) {
  [loggerPath, envPath].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(envPath, { app: { nodeEnv }, log: { level } });

  return require(loggerPath);
}

test("logger level reflects env.log.level", () => {
  assert.strictEqual(loadLogger({ level: "warn" }).level, "warn");
  assert.strictEqual(loadLogger({ level: "error" }).level, "error");
});

test("logger redact paths mask the request Authorization header and cookies", () => {
  const logger = loadLogger({ level: "info" });

  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  // Rebuild a pino instance writing to an in-memory stream, using the exact
  // redact paths the real logger is configured with, so the assertion captures
  // output deterministically without touching stdout.
  const capture = pino(
    { redact: { paths: logger.redactPaths, censor: "[REDACTED]" } },
    stream
  );

  capture.info(
    {
      req: {
        headers: {
          authorization: "Bearer super-secret-jwt",
          cookie: "session=do-not-leak",
        },
      },
    },
    "incoming request"
  );

  const output = lines.join("");

  assert.ok(output.includes("[REDACTED]"), "expected redaction marker");
  assert.ok(
    !output.includes("super-secret-jwt"),
    "Authorization value must not be logged in plain text"
  );
  assert.ok(
    !output.includes("do-not-leak"),
    "cookie value must not be logged in plain text"
  );
});
