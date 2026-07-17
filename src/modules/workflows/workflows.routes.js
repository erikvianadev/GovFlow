const { Router } = require("express");

const workflowsController = require("./workflows.controller");
const workflowStepsRoutes = require("../workflow-steps/workflowSteps.routes");
const workflowExecutionsRoutes = require("../workflow-executions/workflowExecutions.routes");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const { mutatingRateLimiter } = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowsController.list
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  mutatingRateLimiter,
  workflowsController.create
);

router.use("/:workflowId/steps", workflowStepsRoutes);
router.use("/:workflowId/executions", workflowExecutionsRoutes);

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowsController.getById
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  mutatingRateLimiter,
  workflowsController.update
);

router.post(
  "/:id/duplicate",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  mutatingRateLimiter,
  workflowsController.duplicate
);

module.exports = router;
