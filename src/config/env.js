const dotenv = require("dotenv"); // Load environment variables from .env file

dotenv.config(); // Initialize dotenv to read the .env file and set process.env variables

const VALID_NODE_ENVS = ["development", "test", "production"];

// Return a required environment variable or fail fast when it is missing.
// Missing means undefined, null, or an empty/whitespace-only string.
function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || value === null || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Minimum length (in characters) accepted for a cryptographic secret.
// 32 chars is the floor; a 256-bit key encoded as base64 yields ~44+ chars,
// which is the recommended way to provision JWT_SECRET (openssl rand -base64 48).
const MIN_SECRET_LENGTH = 32;

// Return a required secret, failing fast when it is missing or too weak.
// This blocks deploys with placeholder/short secrets (e.g. "your_jwt_secret").
function requireStrongSecret(name) {
  const value = requireEnv(name);

  if (value.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Environment variable ${name} is too weak: it must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Generate a strong value with: openssl rand -base64 48`
    );
  }

  return value;
}

// Parse a comma-separated environment variable into a trimmed, non-empty list.
function parseList(value, fallback = []) {
  if (value === undefined || value === null || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveNumber(value, fallback) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

// Resolve the Express "trust proxy" hop count. This is intentionally an integer
// (number of trusted reverse proxies in front of the API), never the boolean
// `true`: trusting every proxy would let clients spoof X-Forwarded-For and
// bypass per-IP rate limiting. Anything non-numeric, negative or the literal
// "true" falls back to the safe default 0 (API exposed directly, no proxy).
function parseTrustProxyHops(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallback;
  }

  return parsedValue;
}

// Resolve and validate NODE_ENV. Defaults to "production" (the safe default),
// so a misconfigured deployment never silently leaks development error details.
function resolveNodeEnv() {
  const nodeEnv = process.env.NODE_ENV || "production";

  if (!VALID_NODE_ENVS.includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${nodeEnv}". Must be one of: ${VALID_NODE_ENVS.join(", ")}`
    );
  }

  return nodeEnv;
}

// Resolve the Redis password. In production a non-empty REDIS_PASSWORD is
// mandatory (backing services must never run unauthenticated in a deployed
// environment); the boot fails fast otherwise. In development/test it is
// optional, so a local Redis without auth keeps working.
function resolveRedisPassword(nodeEnv) {
  const password = process.env.REDIS_PASSWORD;
  const hasPassword = !(
    password === undefined ||
    password === null ||
    password.trim() === ""
  );

  if (nodeEnv === "production" && !hasPassword) {
    throw new Error(
      "Missing required environment variable in production: REDIS_PASSWORD"
    );
  }

  return hasPassword ? password : undefined;
}

// When Jira integration is enabled, the base URL, account email, and API
// token are mandatory (the client cannot authenticate without them). Boot
// fails fast citing exactly which variable is missing, the same way
// resolveRedisPassword fails fast when a conditionally-required setting is
// absent. When Jira is disabled, these variables remain optional.
function validateJiraConfig() {
  const jiraEnabled = process.env.JIRA_ENABLED === "true";

  if (!jiraEnabled) {
    return;
  }

  requireEnv("JIRA_BASE_URL");
  requireEnv("JIRA_EMAIL");
  requireEnv("JIRA_API_TOKEN");
}

const nodeEnv = resolveNodeEnv(); // Validated NODE_ENV with a safe default

validateJiraConfig(); // Fails fast if Jira is enabled but misconfigured

// Export the environment configuration as an object
const env = {
  app: {
    port: Number(process.env.PORT) || 3000, // Use PORT from environment variables or default to 3000
    nodeEnv, // Validated NODE_ENV with a safe default
    corsOrigins: parseList(process.env.CORS_ORIGINS, ["http://localhost:3000"]), // Allowlisted CORS origins
    // Number of trusted reverse proxies in front of the API. Safe default 0
    // (API exposed directly). Set to the exact number of trusted proxies; never
    // a boolean (see parseTrustProxyHops).
    trustProxyHops: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS, 0),
  },

  rateLimit: { // Rate limiting configuration with safe defaults
    login: {
      windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
    },
    mutating: {
      windowMs:
        Number(process.env.MUTATING_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.MUTATING_RATE_LIMIT_MAX) || 50,
    },
    processing: {
      windowMs:
        Number(process.env.PROCESSING_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.PROCESSING_RATE_LIMIT_MAX) || 60,
    },
    jira: {
      windowMs: Number(process.env.JIRA_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.JIRA_RATE_LIMIT_MAX) || 30,
    },
    adminOperations: {
      windowMs: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.ADMIN_RATE_LIMIT_MAX) || 20,
    },
  },

  database: { // database configuration, all values are required
    host: requireEnv("DB_HOST"),
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    name: requireEnv("DB_NAME"),
  },

  jwt: { // JWT configuration, the secret is required, has no fallback, and must be strong
    secret: requireStrongSecret("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    // Issuer/audience are bound into every token and enforced on verification.
    // They have safe defaults so existing deployments keep working without new
    // configuration.
    issuer: process.env.JWT_ISSUER || "govflow",
    audience: process.env.JWT_AUDIENCE || "govflow-api",
  },

  redis: { // Redis configuration; password required in production, optional in dev/test
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: resolveRedisPassword(nodeEnv),
  },

  workflowExecution: {
    runningTimeoutMinutes: parsePositiveNumber(
      process.env.WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES,
      30
    ),
  },

  jira: {
    enabled: process.env.JIRA_ENABLED === "true",
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    timeoutMs: Number(process.env.JIRA_TIMEOUT_MS) || 10000,
  },

  log: {
    // Valid pino levels: fatal, error, warn, info, debug, trace, silent.
    // An explicit LOG_LEVEL always wins. Otherwise: "info" in production (no
    // debug noise in real traffic), "silent" under test (so pino-http request
    // logging never interleaves with the test runner output), and "debug" in
    // development so nothing is missed locally.
    level:
      process.env.LOG_LEVEL ||
      (nodeEnv === "production"
        ? "info"
        : nodeEnv === "test"
          ? "silent"
          : "debug"),
  },
};

module.exports = env;
