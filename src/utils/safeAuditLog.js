const auditLogsService = require("../modules/audit-logs/auditLogs.service");
const logger = require("../config/logger");

async function safeRegisterAuditLog(payload) {
  try {
    await auditLogsService.register(payload);
  } catch (error) {
    logger.error({ err: error }, "Failed to register audit log");
  }
}

module.exports = {
  safeRegisterAuditLog,
};
