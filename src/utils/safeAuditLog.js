const auditLogsService = require("../modules/audit-logs/auditLogs.service");

async function safeRegisterAuditLog(payload) {
  try {
    await auditLogsService.register(payload);
  } catch (error) {
    console.error("Failed to register audit log:", error);
  }
}

module.exports = {
  safeRegisterAuditLog,
};
