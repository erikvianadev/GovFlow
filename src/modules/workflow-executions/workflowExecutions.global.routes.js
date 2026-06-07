const { Router } = require("express");

const workflowExecutionsController = require("./workflowExecutions.controller");
const workflowExecutionStepsRoutes = require("../workflow-execution-steps/workflowExecutionSteps.routes");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowExecutionsController.list
);

router.use("/:executionId/steps", workflowExecutionStepsRoutes);

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowExecutionsController.getById
);

module.exports = router;
