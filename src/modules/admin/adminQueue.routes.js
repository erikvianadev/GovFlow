const { Router } = require("express");

const adminQueueController = require("./adminQueue.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const {
  adminOperationsRateLimiter,
} = require("../../middlewares/rate-limit.middleware");

const router = Router();

// Order on mutating routes is deliberate: authenticate -> authorize -> rate
// limit. Rate-limiting before auth (the pattern used for /auth/login, where
// the caller is anonymous by definition) would let an unauthenticated
// attacker exhaust the limiter for this IP and lock out the legitimate ADMIN.
// Here the caller must already be a verified ADMIN before the limiter
// applies, so the limiter only throttles real admin traffic, not noise.

router.get(
  "/queue/stats",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  adminQueueController.getStats
);

router.get(
  "/queue/jobs",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  adminQueueController.listJobs
);

router.post(
  "/queue/jobs/:jobId/retry",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  adminOperationsRateLimiter,
  adminQueueController.retryJob
);

router.delete(
  "/queue/jobs/:jobId",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  adminOperationsRateLimiter,
  adminQueueController.deleteJob
);

module.exports = router;
