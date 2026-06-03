const { Router } = require("express");

const workflowsController = require("./workflows.controller");
const workflowStepsRoutes = require("../workflow-steps/workflowSteps.routes");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

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
  workflowsController.create
);

router.use("/:workflowId/steps", workflowStepsRoutes);

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowsController.getById
);

module.exports = router;
