const { Router } = require('express');

const healthRoutes = require('../modules/health/health.routes');
const auditLogsRoutes = require('../modules/audit-logs/auditLogs.routes');
const departmentsRoutes = require('../modules/departments/departments.routes');


const router = Router();

router.use('/health', healthRoutes);
router.use("/audit-logs", auditLogsRoutes);
router.use("/departments", departmentsRoutes);

module.exports = router;
