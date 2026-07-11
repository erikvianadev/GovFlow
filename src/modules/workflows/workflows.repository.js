const database = require("../../config/database");
const workflowStepsRepository = require("../workflow-steps/workflowSteps.repository");

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

async function update({ id, isActive }) {
  const result = await database.query(
    `
      UPDATE workflows
      SET
        is_active = $2,
        updated_at = NOW()
      WHERE id = $1
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
    [id, isActive]
  );

  return result.rows[0];
}

// Duplicates a workflow and all of its steps (active and inactive alike) in a
// single atomic transaction: either the new workflow row and every copied
// step land together, or nothing is written at all. `sourceWorkflowId`,
// `name`, `description` and `departmentId` are supplied by the caller (the
// service already resolved and authorized the source workflow before
// invoking this method) so this function does not re-read the source
// workflow row itself; it only reads the source steps, inside the
// transaction, via workflowStepsRepository.findByWorkflowId.
async function duplicate({
  sourceWorkflowId,
  name,
  description,
  departmentId,
  createdBy,
}) {
  return database.transaction(async (trx) => {
    const insertResult = await trx.query(
      `
        INSERT INTO workflows (
          name,
          description,
          department_id,
          created_by,
          is_active
        )
        VALUES ($1, $2, $3, $4, false)
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

    const newWorkflow = insertResult.rows[0];

    // All steps, including inactive ones — a deactivated step in the source
    // must not be silently dropped from the copy.
    const sourceSteps = await workflowStepsRepository.findByWorkflowId(
      sourceWorkflowId,
      trx
    );

    for (const step of sourceSteps) {
      await workflowStepsRepository.create(
        {
          workflowId: newWorkflow.id,
          name: step.name,
          description: step.description,
          stepOrder: step.step_order,
          actionType: step.action_type,
          configuration: step.configuration,
          isActive: step.is_active,
        },
        trx
      );
    }

    return newWorkflow;
  });
}

module.exports = {
  findAll,
  countAll,
  findById,
  create,
  update,
  duplicate,
  buildWorkflowsFiltersQuery,
};
