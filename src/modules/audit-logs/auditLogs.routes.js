const { Router } = require("express");

const auditLogsController = require("./auditLogs.controller");

const router = Router();

router.get("/", auditLogsController.list);
router.post("/", auditLogsController.create);

module.exports = router;