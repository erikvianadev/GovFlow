const rateLimit = require("express-rate-limit");

const env = require("../config/env");

// Build a per-IP limiter with the shared GovFlow response shape. The message is
// always generic so the 429 never leaks internal details.
function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });
}

// Throttles authentication attempts per IP to slow down online brute-force
// and credential-stuffing attacks against the login endpoint.
const loginRateLimiter = createRateLimiter({
  windowMs: env.rateLimit.login.windowMs,
  max: env.rateLimit.login.max,
  message: "Too many login attempts, please try again later",
});

// Throttles state-changing endpoints (user creation, workflow execution
// creation) to limit abuse and accidental floods.
const mutatingRateLimiter = createRateLimiter({
  windowMs: env.rateLimit.mutating.windowMs,
  max: env.rateLimit.mutating.max,
  message: "Too many requests, please try again later",
});

// Throttles the workflow processing endpoints (process / enqueue) which trigger
// asynchronous work and external side effects.
const workflowProcessingRateLimiter = createRateLimiter({
  windowMs: env.rateLimit.processing.windowMs,
  max: env.rateLimit.processing.max,
  message: "Too many processing requests, please try again later",
});

// Throttles the Jira connectivity check, which performs an outbound call to the
// external Jira API.
const jiraRateLimiter = createRateLimiter({
  windowMs: env.rateLimit.jira.windowMs,
  max: env.rateLimit.jira.max,
  message: "Too many Jira requests, please try again later",
});

// Throttles privileged administrative operations (e.g. stale execution
// recovery) that perform bulk or sensitive changes.
const adminOperationsRateLimiter = createRateLimiter({
  windowMs: env.rateLimit.adminOperations.windowMs,
  max: env.rateLimit.adminOperations.max,
  message: "Too many administrative requests, please try again later",
});

module.exports = {
  loginRateLimiter,
  mutatingRateLimiter,
  workflowProcessingRateLimiter,
  jiraRateLimiter,
  adminOperationsRateLimiter,
};
