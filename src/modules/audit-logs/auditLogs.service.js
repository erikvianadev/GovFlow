const auditLogsRepository = require("./auditLogs.repository");
const AppError = require("../../errors/AppError");
const {
  validateCreateAuditLog,
  validateListAuditLogsFilters,
} = require("../../validators/auditLogs.validator");

async function listAuditLogs({
  page = 1,
  limit = 20,
  action,
  entity,
  startDate,
  endDate,
}) {
  const filters = {
    action,
    entity,
    startDate,
    endDate,
  };

  const validationErrors = validateListAuditLogsFilters(filters);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const normalizedFilters = {
    action: action ? action.trim() : null,
    entity: entity ? entity.trim() : null,
    startDate: startDate || null,
    endDate: endDate || null,
  };

  const [items, total] = await Promise.all([
    auditLogsRepository.findAll({
      limit: safeLimit,
      offset,
      filters: normalizedFilters,
    }),
    auditLogsRepository.countAll({
      filters: normalizedFilters,
    }),
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
