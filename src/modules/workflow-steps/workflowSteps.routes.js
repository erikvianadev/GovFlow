const { Router } = require("express");

const workflowStepsController = require("./workflowSteps.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router({ mergeParams: true });

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowStepsController.list
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  workflowStepsController.create
);

module.exports = router;
