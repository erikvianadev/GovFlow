const database = require("../../config/database");

function buildDepartmentsFiltersQuery(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.isActive !== null && filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    values,
  };
}

async function findAll({ limit, offset, filters }) {
  const { whereClause, values } = buildDepartmentsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM departments
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function countAll({ filters }) {
  const { whereClause, values } = buildDepartmentsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT COUNT(*)::int AS total
      FROM departments
      ${whereClause}
    `,
    values
  );

  return result.rows[0].total;
}

async function findById(id) {
  const result = await database.query(
    `
      SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM departments
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0];
}

async function findByName(name) {
  const result = await database.query(
    `
      SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM departments
      WHERE LOWER(name) = LOWER($1)
    `,
    [name]
  );

  return result.rows[0];
}

async function create({ name, description = null }) {
  const result = await database.query(
    `
      INSERT INTO departments (
        name,
        description
      )
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
    `,
    [name, description]
  );

  return result.rows[0];
}

module.exports = {
  findAll,
  countAll,
  findById,
  findByName,
  create,
};
