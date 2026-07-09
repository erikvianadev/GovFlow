const { Router } = require("express");

const jiraController = require("./jira.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const { jiraRateLimiter } = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.get(
  "/test-connection",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  jiraRateLimiter,
  jiraController.testConnection
);

module.exports = router;
