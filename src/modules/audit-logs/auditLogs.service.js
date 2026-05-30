const auditLogsRepository = require('./auditLogs.repository');

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

module.exports = {
  listAuditLogs,
}
