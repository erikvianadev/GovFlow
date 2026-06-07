const database = require("../../config/database");

async function findByWorkflowId(workflowId, db = database) {
  const result = await db.query(
    `
      SELECT
        id,
        workflow_id,
        name,
        description,
        step_order,
        action_type,
        configuration,
        is_active,
        created_at,
        updated_at
      FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY step_order ASC
    `,
    [workflowId]
  );

  return result.rows;
}

async function findByWorkflowIdAndStepOrder(workflowId, stepOrder) {
  const result = await database.query(
    `
      SELECT
        id,
        workflow_id,
        name,
        description,
        step_order,
        action_type,
        configuration,
        is_active,
        created_at,
        updated_at
      FROM workflow_steps
      WHERE workflow_id = $1
        AND step_order = $2
    `,
    [workflowId, stepOrder]
  );

  return result.rows[0];
}

async function findActiveByWorkflowId(workflowId, db = database) {
  const result = await db.query(
    `
      SELECT
        id,
        workflow_id,
        name,
        description,
        step_order,
        action_type,
        configuration,
        is_active,
        created_at,
        updated_at
      FROM workflow_steps
      WHERE workflow_id = $1
        AND is_active = true
      ORDER BY step_order ASC
    `,
    [workflowId]
  );

  return result.rows;
}

async function create({
  workflowId,
  name,
  description = null,
  stepOrder,
  actionType,
  configuration = null,
}) {
  const result = await database.query(
    `
      INSERT INTO workflow_steps (
        workflow_id,
        name,
        description,
        step_order,
        action_type,
        configuration
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        workflow_id,
        name,
        description,
        step_order,
        action_type,
        configuration,
        is_active,
        created_at,
        updated_at
    `,
    [workflowId, name, description, stepOrder, actionType, configuration]
  );

  return result.rows[0];
}

module.exports = {
  findByWorkflowId,
  findByWorkflowIdAndStepOrder,
  findActiveByWorkflowId,
  create,
};
