const { Router } = require("express");

const workflowProcessorController = require("./workflowProcessor.controller");
const workflowProcessingQueueController = require("./workflowProcessingQueue.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.post(
  "/workflow-executions/:id/process",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessorController.process
);

router.post(
  "/workflow-executions/:id/enqueue",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessingQueueController.enqueue
);

module.exports = router;
