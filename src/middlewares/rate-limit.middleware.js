const rateLimit = require("express-rate-limit");

const env = require("../config/env");

// Throttles authentication attempts per IP to slow down online brute-force
// and credential-stuffing attacks against the login endpoint.
const loginRateLimiter = rateLimit({
  windowMs: env.rateLimit.login.windowMs,
  max: env.rateLimit.login.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
  },
});

module.exports = {
  loginRateLimiter,
};
