const { Router } = require("express");

const workflowExecutionsController = require("./workflowExecutions.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const { mutatingRateLimiter } = require("../../middlewares/rate-limit.middleware");

const router = Router({ mergeParams: true });

router.post(
  "/",
  mutatingRateLimiter,
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER", "OPERATOR"]),
  workflowExecutionsController.create
);

module.exports = router;
