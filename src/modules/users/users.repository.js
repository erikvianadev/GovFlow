const database = require("../../config/database");

function buildUsersFiltersQuery(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.role) {
    values.push(filters.role);
    conditions.push(`users.role = $${values.length}`);
  }

  if (filters.departmentId) {
    values.push(filters.departmentId);
    conditions.push(`users.department_id = $${values.length}`);
  }

  if (filters.isActive !== null && filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`users.is_active = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    values,
  };
}

async function findAll({ limit, offset, filters }) {
  const { whereClause, values } = buildUsersFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.role,
        users.department_id,
        departments.name AS department_name,
        users.is_active,
        users.created_at,
        users.updated_at
      FROM users
      LEFT JOIN departments
        ON departments.id = users.department_id
      ${whereClause}
      ORDER BY users.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function countAll({ filters }) {
  const { whereClause, values } = buildUsersFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT COUNT(*)::int AS total
      FROM users
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
        users.id,
        users.name,
        users.email,
        users.role,
        users.department_id,
        departments.name AS department_name,
        users.is_active,
        users.created_at,
        users.updated_at
      FROM users
      LEFT JOIN departments
        ON departments.id = users.department_id
      WHERE users.id = $1
    `,
    [id]
  );

  return result.rows[0];
}

async function findByEmail(email) {
  const result = await database.query(
    `
      SELECT
        id,
        name,
        email,
        password_hash,
        role,
        department_id,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
    `,
    [email]
  );

  return result.rows[0];
}

async function create({
  name,
  email,
  passwordHash,
  role,
  departmentId = null,
}) {
  const result = await database.query(
    `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        department_id
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        name,
        email,
        role,
        department_id,
        is_active,
        created_at,
        updated_at
    `,
    [name, email, passwordHash, role, departmentId]
  );

  return result.rows[0];
}

module.exports = {
  findAll,
  countAll,
  findById,
  findByEmail,
  create,
};
