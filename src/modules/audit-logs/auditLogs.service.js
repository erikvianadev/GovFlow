const auditLogsRepository = require('./auditLogs.repository');
const AppError = require('../../errors/AppError');

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

async function register({ action, entity, entityId = null, actorId = null, metadata = null }) {
  if (!action) {
    throw new AppError("Audit log action is required", 400);
  }

  if (!entity) {
    throw new AppError("Audit log entity is required", 400);
  }

  return auditLogsRepository.create({
    action,
    entity,
    entityId,
    actorId,
    metadata,
  });
}

module.exports = {
  listAuditLogs,
  register,
}
