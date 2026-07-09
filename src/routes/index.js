const { Router } = require('express');

const healthRoutes = require('../modules/health/health.routes');
const auditLogsRoutes = require('../modules/audit-logs/auditLogs.routes');
const departmentsRoutes = require('../modules/departments/departments.routes');
const usersRoutes = require('../modules/users/users.routes');
const authRoutes = require("../modules/auth/auth.routes");
const workflowsRoutes = require("../modules/workflows/workflows.routes");
const workflowExecutionsGlobalRoutes = require("../modules/workflow-executions/workflowExecutions.global.routes");
const workflowProcessorRoutes = require("../modules/workflow-processing/workflowProcessor.routes");
const jiraRoutes = require("../modules/jira/jira.routes");
const adminRoutes = require("../modules/admin/adminQueue.routes");

const router = Router();

router.use('/health', healthRoutes);
router.use("/audit-logs", auditLogsRoutes);
router.use("/departments", departmentsRoutes);
router.use("/users", usersRoutes);
router.use("/auth", authRoutes);
router.use("/workflows", workflowsRoutes);
router.use("/workflow-executions", workflowExecutionsGlobalRoutes);
router.use("/jira", jiraRoutes);
router.use("/", workflowProcessorRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
