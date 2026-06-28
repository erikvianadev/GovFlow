const pino = require("pino");
const env = require("./env");

// Defense in depth: even though JiraTechnicalError no longer attaches the raw
// axios error (see jira.errors.js sanitizeAxiosError) and testConnection now
// normalizes its failures, these paths cover the other place secrets can leak
// through a logged object — the incoming request itself. pino-http logs
// req.headers by default, and that includes every authenticated request's JWT.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
];

const logger = pino({
  level: env.log.level,
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  // pino-pretty spawns a transport worker thread, so it is reserved for local
  // development. Production and test emit plain newline-delimited JSON: test
  // stays free of worker threads and interleaved output, production stays
  // machine-parseable for log shippers.
  transport:
    env.app.nodeEnv === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

// Exposed for tests so the redaction contract is verified against the exact
// paths the logger is built with (single source of truth), not a copy.
logger.redactPaths = REDACT_PATHS;

module.exports = logger;
