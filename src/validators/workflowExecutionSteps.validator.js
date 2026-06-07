function validateExecutionId(executionId) {
  const errors = [];

  validateRequiredUuid(
    executionId,
    "executionId",
    "Workflow execution ID",
    errors
  );

  return errors;
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

function isValidUuid(value) {
  if (value === "00000000-0000-0000-0000-000000000000") {
    return true;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
}

module.exports = {
  validateExecutionId,
};
