const { Router } = require("express");

const auditLogsController = require("./auditLogs.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  auditLogsController.list
);
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  auditLogsController.create
);

module.exports = router;
