const database = require("../../config/database");

function buildWorkflowsFiltersQuery(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.departmentId) {
    values.push(filters.departmentId);
    conditions.push(`workflows.department_id = $${values.length}`);
  }

  if (filters.createdBy) {
    values.push(filters.createdBy);
    conditions.push(`workflows.created_by = $${values.length}`);
  }

  if (filters.isActive !== null && filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`workflows.is_active = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    values,
  };
}

async function findAll({ limit, offset, filters }) {
  const { whereClause, values } = buildWorkflowsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT
        workflows.id,
        workflows.name,
        workflows.description,
        workflows.department_id,
        departments.name AS department_name,
        workflows.created_by,
        users.email AS created_by_email,
        workflows.is_active,
        workflows.created_at,
        workflows.updated_at
      FROM workflows
      LEFT JOIN departments
        ON departments.id = workflows.department_id
      LEFT JOIN users
        ON users.id = workflows.created_by
      ${whereClause}
      ORDER BY workflows.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function countAll({ filters }) {
  const { whereClause, values } = buildWorkflowsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT COUNT(*)::int AS total
      FROM workflows
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
        workflows.id,
        workflows.name,
        workflows.description,
        workflows.department_id,
        departments.name AS department_name,
        workflows.created_by,
        users.email AS created_by_email,
        workflows.is_active,
        workflows.created_at,
        workflows.updated_at
      FROM workflows
      LEFT JOIN departments
        ON departments.id = workflows.department_id
      LEFT JOIN users
        ON users.id = workflows.created_by
      WHERE workflows.id = $1
    `,
    [id]
  );

  return result.rows[0];
}

async function create({
  name,
  description = null,
  departmentId = null,
  createdBy,
}) {
  const result = await database.query(
    `
      INSERT INTO workflows (
        name,
        description,
        department_id,
        created_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        description,
        department_id,
        created_by,
        is_active,
        created_at,
        updated_at
    `,
    [name, description, departmentId, createdBy]
  );

  return result.rows[0];
}

module.exports = {
  findAll,
  countAll,
  findById,
  create,
  buildWorkflowsFiltersQuery,
};
