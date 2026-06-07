const database = require("../../config/database");

async function createMany(executionSteps, db = database) {
  if (executionSteps.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = executionSteps.map((executionStep, index) => {
    const baseIndex = index * 2;

    values.push(executionStep.executionId);
    values.push(executionStep.stepId);

    return `($${baseIndex + 1}, $${baseIndex + 2})`;
  });

  const result = await db.query(
    `
      INSERT INTO workflow_execution_steps (
        execution_id,
        step_id
      )
      VALUES ${placeholders.join(", ")}
      RETURNING
        id,
        execution_id,
        step_id,
        status,
        started_at,
        completed_at,
        error_message,
        created_at,
        updated_at
    `,
    values
  );

  return result.rows;
}

async function findByExecutionId(executionId, db = database) {
  const result = await db.query(
    `
      SELECT
        workflow_execution_steps.id,
        workflow_execution_steps.execution_id,
        workflow_execution_steps.step_id,
        workflow_steps.name AS step_name,
        workflow_steps.description AS step_description,
        workflow_steps.step_order,
        workflow_steps.action_type,
        workflow_steps.configuration,
        workflow_execution_steps.status,
        workflow_execution_steps.started_at,
        workflow_execution_steps.completed_at,
        workflow_execution_steps.error_message,
        workflow_execution_steps.created_at,
        workflow_execution_steps.updated_at
      FROM workflow_execution_steps
      INNER JOIN workflow_steps
        ON workflow_steps.id = workflow_execution_steps.step_id
      WHERE workflow_execution_steps.execution_id = $1
      ORDER BY workflow_steps.step_order ASC
    `,
    [executionId]
  );

  return result.rows;
}

async function updateStatus(
  { id, status, startedAt = null, completedAt = null, errorMessage = null },
  db = database
) {
  const result = await db.query(
    `
      UPDATE workflow_execution_steps
      SET
        status = $2,
        started_at = COALESCE($3, started_at),
        completed_at = COALESCE($4, completed_at),
        error_message = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        execution_id,
        step_id,
        status,
        started_at,
        completed_at,
        error_message,
        created_at,
        updated_at
    `,
    [id, status, startedAt, completedAt, errorMessage]
  );

  return result.rows[0];
}

module.exports = {
  createMany,
  findByExecutionId,
  updateStatus,
};
