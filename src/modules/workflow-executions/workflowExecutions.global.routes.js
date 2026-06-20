const { Router } = require("express");

const workflowExecutionsController = require("./workflowExecutions.controller");
const workflowExecutionStepsRoutes = require("../workflow-execution-steps/workflowExecutionSteps.routes");
const workflowProcessingJobController = require("../workflow-processing/workflowProcessingJob.controller");
const workflowExecutionRecoveryController = require("../workflow-processing/workflowExecutionRecovery.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const {
  adminOperationsRateLimiter,
} = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowExecutionsController.list
);

router.use("/:executionId/steps", workflowExecutionStepsRoutes);

router.post(
  "/recovery/stale-running",
  adminOperationsRateLimiter,
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  workflowExecutionRecoveryController.recoverStaleRunning
);

router.get(
  "/:id/job",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowProcessingJobController.getByExecutionId
);

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowExecutionsController.getById
);

module.exports = router;
