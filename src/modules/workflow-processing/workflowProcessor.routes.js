const { Router } = require("express");

const workflowProcessorController = require("./workflowProcessor.controller");
const workflowProcessingQueueController = require("./workflowProcessingQueue.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const {
  workflowProcessingRateLimiter,
} = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.post(
  "/workflow-executions/:id/process",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessingRateLimiter,
  workflowProcessorController.process
);

router.post(
  "/workflow-executions/:id/enqueue",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessingRateLimiter,
  workflowProcessingQueueController.enqueue
);

module.exports = router;
