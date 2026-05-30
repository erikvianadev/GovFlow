const database = require("../../config/database");

function buildAuditLogsFiltersQuery(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.action) {
    values.push(filters.action);
    conditions.push(`action = $${values.length}`);
  }

  if (filters.entity) {
    values.push(filters.entity);
    conditions.push(`entity = $${values.length}`);
  }

  if (filters.startDate) {
    values.push(filters.startDate);
    conditions.push(`created_at >= $${values.length}`);
  }

  if (filters.endDate) {
    values.push(filters.endDate);
    conditions.push(`created_at <= $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    values,
  };
}

async function findAll({ limit, offset, filters }) {
  const { whereClause, values } = buildAuditLogsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT
        id,
        action,
        entity,
        entity_id,
        actor_id,
        metadata,
        created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function countAll({ filters }) {
  const { whereClause, values } = buildAuditLogsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT COUNT(*)::int AS total
      FROM audit_logs
      ${whereClause}
    `,
    values
  );

  return result.rows[0].total;
}

async function create({
  action,
  entity,
  entityId = null,
  actorId = null,
  metadata = null,
}) {
  const result = await database.query(
    `
    INSERT INTO audit_logs (
        action,
        entity,
        entity_id,
        actor_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        action,
        entity,
        entity_id,
        actor_id,
        metadata,
        created_at
    `,
    [action, entity, entityId, actorId, metadata]
  );

  return result.rows[0];
}

module.exports = {
  findAll,
  countAll,
  create,
};
