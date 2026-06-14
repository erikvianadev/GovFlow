function validateCreateWorkflowExecution(payload) {
  const errors = [];

  validateInput(payload.input, errors);

  return errors;
}

function validateWorkflowId(workflowId) {
  const errors = [];

  validateRequiredUuid(workflowId, "workflowId", "Workflow ID", errors);

  return errors;
}

function validateWorkflowExecutionId(id) {
  const errors = [];

  validateRequiredUuid(id, "id", "Workflow execution ID", errors);

  return errors;
}

function validateListWorkflowExecutionsFilters(filters) {
  const errors = [];

  validateOptionalUuid(filters.workflowId, "workflowId", "Workflow ID", errors);
  validateOptionalUuid(filters.startedBy, "startedBy", "Started by", errors);
  validateOptionalStatus(filters.status, errors);

  return errors;
}

const MAX_RECOVERY_LIMIT = 100;

function validateRecoverStaleRunning({ timeoutMinutes, limit } = {}) {
  const errors = [];

  validateOptionalPositiveInteger(
    timeoutMinutes,
    "timeoutMinutes",
    "Timeout minutes",
    errors
  );
  validateOptionalPositiveInteger(limit, "limit", "Limit", errors, {
    max: MAX_RECOVERY_LIMIT,
  });

  return errors;
}

function validateOptionalPositiveInteger(
  value,
  field,
  label,
  errors,
  { max } = {}
) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.push({
      field,
      message: `${label} must be a positive integer`,
    });
    return;
  }

  if (max !== undefined && value > max) {
    errors.push({
      field,
      message: `${label} must be at most ${max}`,
    });
  }
}

function validateInput(input, errors) {
  if (input === undefined || input === null) {
    return;
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    errors.push({
      field: "input",
      message: "Input must be an object",
    });
  }
}

function validateOptionalStatus(status, errors) {
  if (status === undefined || status === null || status === "") {
    return;
  }

  const validStatuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELED"];

  if (!validStatuses.includes(status)) {
    errors.push({
      field: "status",
      message: "Status must be one of: PENDING, RUNNING, COMPLETED, FAILED, CANCELED",
    });
  }
}

function validateRequiredUuid(value, field, label, errors) {
  if (value === undefined || value === null) {
    errors.push({
      field,
      message: `${label} is required`,
    });
    return;
  }

  if (typeof value !== "string") {
    errors.push({
      field,
      message: `${label} must be a string`,
    });
    return;
  }

  if (!isValidUuid(value)) {
    errors.push({
      field,
      message: `${label} must be a valid UUID`,
    });
  }
}

function validateOptionalUuid(value, field, label, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (typeof value !== "string") {
    errors.push({
      field,
      message: `${label} must be a string`,
    });
    return;
  }

  if (!isValidUuid(value)) {
    errors.push({
      field,
      message: `${label} must be a valid UUID`,
    });
  }
}

function isValidUuid(value) {
  if (value === "00000000-0000-0000-0000-000000000000") {
    return true;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
}

module.exports = {
  validateCreateWorkflowExecution,
  validateWorkflowId,
  validateWorkflowExecutionId,
  validateListWorkflowExecutionsFilters,
  validateRecoverStaleRunning,
  MAX_RECOVERY_LIMIT,
};
