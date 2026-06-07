const { Router } = require("express");

const workflowProcessorController = require("./workflowProcessor.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.post(
  "/workflow-executions/:id/process",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessorController.process
);

module.exports = router;
