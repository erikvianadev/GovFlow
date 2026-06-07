const { Router } = require("express");

const workflowExecutionStepsController = require("./workflowExecutionSteps.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router({ mergeParams: true });

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowExecutionStepsController.list
);

module.exports = router;
