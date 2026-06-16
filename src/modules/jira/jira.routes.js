const { Router } = require("express");

const jiraController = require("./jira.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.get(
  "/test-connection",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  jiraController.testConnection
);

module.exports = router;
