const database = require("../../config/database");

function buildWorkflowExecutionsFiltersQuery(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.workflowId) {
    values.push(filters.workflowId);
    conditions.push(`workflow_executions.workflow_id = $${values.length}`);
  }

  if (filters.startedBy) {
    values.push(filters.startedBy);
    conditions.push(`workflow_executions.started_by = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`workflow_executions.status = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    values,
  };
}

async function findAll({ limit, offset, filters }) {
  const { whereClause, values } = buildWorkflowExecutionsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT
        workflow_executions.id,
        workflow_executions.workflow_id,
        workflows.name AS workflow_name,
        workflow_executions.started_by,
        users.email AS started_by_email,
        workflow_executions.status,
        workflow_executions.input,
        workflow_executions.result,
        workflow_executions.started_at,
        workflow_executions.completed_at,
        workflow_executions.created_at,
        workflow_executions.updated_at
      FROM workflow_executions
      LEFT JOIN workflows
        ON workflows.id = workflow_executions.workflow_id
      LEFT JOIN users
        ON users.id = workflow_executions.started_by
      ${whereClause}
      ORDER BY workflow_executions.created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function countAll({ filters }) {
  const { whereClause, values } = buildWorkflowExecutionsFiltersQuery(filters);

  const result = await database.query(
    `
      SELECT COUNT(*)::int AS total
      FROM workflow_executions
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
        workflow_executions.id,
        workflow_executions.workflow_id,
        workflows.name AS workflow_name,
        workflow_executions.started_by,
        users.email AS started_by_email,
        workflow_executions.status,
        workflow_executions.input,
        workflow_executions.result,
        workflow_executions.started_at,
        workflow_executions.completed_at,
        workflow_executions.created_at,
        workflow_executions.updated_at
      FROM workflow_executions
      LEFT JOIN workflows
        ON workflows.id = workflow_executions.workflow_id
      LEFT JOIN users
        ON users.id = workflow_executions.started_by
      WHERE workflow_executions.id = $1
    `,
    [id]
  );

  return result.rows[0];
}

async function create({ workflowId, startedBy, input = null }, db = database) {
  const result = await db.query(
    `
      INSERT INTO workflow_executions (
        workflow_id,
        started_by,
        input
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        workflow_id,
        started_by,
        status,
        input,
        result,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [workflowId, startedBy, input]
  );

  return result.rows[0];
}

async function claimPendingExecution({ id }, db = database) {
  const result = await db.query(
    `
      UPDATE workflow_executions
      SET
        status = 'RUNNING',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'PENDING'
      RETURNING
        id,
        workflow_id,
        started_by,
        status,
        input,
        result,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [id]
  );

  return result.rows[0];
}

// Finalize a workflow execution into a terminal state, but only while it is
// still RUNNING. The status guard prevents a slow-but-alive worker from
// overwriting a state already set by the stale-running recovery (or vice
// versa): once an execution leaves RUNNING, this update matches no rows.
async function finalizeRunningExecution(
  { id, status, result = null },
  db = database
) {
  const resultQuery = await db.query(
    `
      UPDATE workflow_executions
      SET
        status = $2,
        completed_at = NOW(),
        result = COALESCE($3, result),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'RUNNING'
      RETURNING
        id,
        workflow_id,
        started_by,
        status,
        input,
        result,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [id, status, result]
  );

  return resultQuery.rows[0];
}

async function findStaleRunning({ timeoutMinutes, limit = 100 }, db = database) {
  const result = await db.query(
    `
      SELECT
        id,
        workflow_id,
        started_by,
        status,
        input,
        result,
        started_at,
        completed_at,
        created_at,
        updated_at
      FROM workflow_executions
      WHERE status = 'RUNNING'
        AND started_at IS NOT NULL
        AND started_at <= NOW() - ($1::numeric * INTERVAL '1 minute')
      ORDER BY started_at ASC
      LIMIT $2
    `,
    [timeoutMinutes, limit]
  );

  return result.rows;
}

async function failStaleRunning(
  { id, timeoutMinutes, result },
  db = database
) {
  const queryResult = await db.query(
    `
      UPDATE workflow_executions
      SET
        status = 'FAILED',
        completed_at = NOW(),
        result = $3,
        updated_at = NOW()
      WHERE id = $1
        AND status = 'RUNNING'
        AND started_at IS NOT NULL
        AND started_at <= NOW() - ($2::numeric * INTERVAL '1 minute')
      RETURNING
        id,
        workflow_id,
        started_by,
        status,
        input,
        result,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [id, timeoutMinutes, result]
  );

  return queryResult.rows[0];
}

module.exports = {
  findAll,
  countAll,
  findById,
  create,
  claimPendingExecution,
  finalizeRunningExecution,
  findStaleRunning,
  failStaleRunning,
  buildWorkflowExecutionsFiltersQuery,
};
