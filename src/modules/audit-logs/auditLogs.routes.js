const { Router } = require("express");

const auditLogsController = require("./auditLogs.controller");

const router = Router();

router.get("/", auditLogsController.list);

module.exports = router;