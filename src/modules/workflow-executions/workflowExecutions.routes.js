const { Router } = require("express");

const workflowExecutionsController = require("./workflowExecutions.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router({ mergeParams: true });

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER", "OPERATOR"]),
  workflowExecutionsController.create
);

module.exports = router;
