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

// Export the environment configuration as an object
const env = {
  app: {
    port: Number(process.env.PORT) || 3000, // Use PORT from environment variables or default to 3000
    nodeEnv: resolveNodeEnv(), // Validated NODE_ENV with a safe default
    corsOrigins: parseList(process.env.CORS_ORIGINS, ["http://localhost:3000"]), // Allowlisted CORS origins
  },

  rateLimit: { // Rate limiting configuration with safe defaults
    login: {
      windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
    },
  },

  database: { // database configuration, all values are required
    host: requireEnv("DB_HOST"),
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    name: requireEnv("DB_NAME"),
  },

  jwt: { // JWT configuration, the secret is required and has no fallback
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  },

  redis: { // Redis configuration using environment variables with defaults
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
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
};

module.exports = env;
