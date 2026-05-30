const database = require('../../config/database');

async function findAll({ limit, offset }) {
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
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    
    `,
    [limit, offset]
  );

  return result.rows;
}

async function countAll() {
  const result = await database.query(
    `
    SELECT COUNT(*)::int AS total
    FROM audit_logs 
    `
  );

  return result.rows[0].total;
}

module.exports = {
  findAll,
  countAll,
}