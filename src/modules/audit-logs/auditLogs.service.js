const auditLogsRepository = require("./auditLogs.repository");
const AppError = require("../../errors/AppError");
const {
  validateCreateAuditLog,
} = require("../../validators/auditLogs.validator");

async function listAuditLogs({ page = 1, limit = 20 }) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    auditLogsRepository.findAll({
      limit: safeLimit,
      offset,
    }),
    auditLogsRepository.countAll(),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

async function register({
  action,
  entity,
  entityId = null,
  actorId = null,
  metadata = null,
}) {
  const validationErrors = validateCreateAuditLog({
    action,
    entity,
    entityId,
    actorId,
    metadata,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  return auditLogsRepository.create({
    action: action.trim(),
    entity: entity.trim(),
    entityId,
    actorId,
    metadata,
  });
}

module.exports = {
  listAuditLogs,
  register,
};
