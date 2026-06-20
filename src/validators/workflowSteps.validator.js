const VALID_ACTION_TYPES = [
  "MANUAL",
  "JIRA_TRANSITION",
  "JIRA_COMMENT",
  "NOTIFICATION",
];
const JIRA_COMMENT_MAX_LENGTH = 5000;
const JIRA_ISSUE_KEY_MAX_LENGTH = 100;
const JIRA_TRANSITION_ID_MAX_LENGTH = 50;

// Standard Jira issue key format: an uppercase project key starting with a
// letter, followed by a hyphen and the issue number (e.g. ABC-123, DO-32).
const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/;

function validateCreateWorkflowStep(payload) {
  const errors = [];

  validateName(payload.name, errors);
  validateDescription(payload.description, errors);
  validateStepOrder(payload.stepOrder, errors);
  validateActionType(payload.actionType, errors);
  validateConfiguration(payload.configuration, errors);
  validateActionConfiguration(payload.actionType, payload.configuration, errors);

  return errors;
}

function validateJiraCommentConfiguration(configuration) {
  const errors = [];

  validateJiraCommentFields(configuration, errors);

  return errors;
}

function validateJiraTransitionConfiguration(configuration) {
  const errors = [];

  validateJiraTransitionFields(configuration, errors);

  return errors;
}

function validateWorkflowId(workflowId) {
  const errors = [];

  validateRequiredUuid(workflowId, "workflowId", "Workflow ID", errors);

  return errors;
}

function validateName(name, errors) {
  if (name === undefined || name === null) {
    errors.push({
      field: "name",
      message: "Name is required",
    });
    return;
  }

  if (typeof name !== "string") {
    errors.push({
      field: "name",
      message: "Name must be a string",
    });
    return;
  }

  if (name.trim().length === 0) {
    errors.push({
      field: "name",
      message: "Name cannot be empty",
    });
    return;
  }

  if (name.length > 150) {
    errors.push({
      field: "name",
      message: "Name must be at most 150 characters",
    });
  }
}

function validateDescription(description, errors) {
  if (description === undefined || description === null) {
    return;
  }

  if (typeof description !== "string") {
    errors.push({
      field: "description",
      message: "Description must be a string",
    });
    return;
  }

  if (description.length > 1000) {
    errors.push({
      field: "description",
      message: "Description must be at most 1000 characters",
    });
  }
}

function validateStepOrder(stepOrder, errors) {
  if (stepOrder === undefined || stepOrder === null) {
    errors.push({
      field: "stepOrder",
      message: "Step order is required",
    });
    return;
  }

  if (!Number.isInteger(stepOrder)) {
    errors.push({
      field: "stepOrder",
      message: "Step order must be an integer",
    });
    return;
  }

  if (stepOrder <= 0) {
    errors.push({
      field: "stepOrder",
      message: "Step order must be greater than 0",
    });
  }
}

function validateActionType(actionType, errors) {
  if (actionType === undefined || actionType === null) {
    errors.push({
      field: "actionType",
      message: "Action type is required",
    });
    return;
  }

  if (typeof actionType !== "string") {
    errors.push({
      field: "actionType",
      message: "Action type must be a string",
    });
    return;
  }

  if (!VALID_ACTION_TYPES.includes(actionType)) {
    errors.push({
      field: "actionType",
      message:
        "Action type must be one of: MANUAL, JIRA_TRANSITION, JIRA_COMMENT, NOTIFICATION",
    });
  }
}

function validateConfiguration(configuration, errors) {
  if (configuration === undefined || configuration === null) {
    return;
  }

  if (typeof configuration !== "object" || Array.isArray(configuration)) {
    errors.push({
      field: "configuration",
      message: "Configuration must be an object",
    });
  }
}

function validateActionConfiguration(actionType, configuration, errors) {
  if (actionType === "JIRA_COMMENT") {
    validateJiraCommentFields(configuration, errors);
  }

  if (actionType === "JIRA_TRANSITION") {
    validateJiraTransitionFields(configuration, errors);
  }
}

function validateJiraCommentFields(configuration, errors) {
  if (configuration === undefined || configuration === null) {
    errors.push({
      field: "configuration",
      message: "JIRA_COMMENT configuration is required",
    });
    return;
  }

  if (typeof configuration !== "object" || Array.isArray(configuration)) {
    return;
  }

  validateJiraIssueKey(configuration.issueKey, errors);

  validateRequiredNonEmptyString(
    configuration.comment,
    "configuration.comment",
    "Jira comment",
    errors
  );

  if (
    typeof configuration.comment === "string" &&
    configuration.comment.length > JIRA_COMMENT_MAX_LENGTH
  ) {
    errors.push({
      field: "configuration.comment",
      message: `Jira comment must be at most ${JIRA_COMMENT_MAX_LENGTH} characters`,
    });
  }
}

function validateJiraTransitionFields(configuration, errors) {
  if (configuration === undefined || configuration === null) {
    errors.push({
      field: "configuration",
      message: "JIRA_TRANSITION configuration is required",
    });
    return;
  }

  if (typeof configuration !== "object" || Array.isArray(configuration)) {
    return;
  }

  validateJiraIssueKey(configuration.issueKey, errors);

  validateRequiredNonEmptyString(
    configuration.transitionId,
    "configuration.transitionId",
    "Jira transition ID",
    errors
  );

  if (
    typeof configuration.transitionId === "string" &&
    configuration.transitionId.length > JIRA_TRANSITION_ID_MAX_LENGTH
  ) {
    errors.push({
      field: "configuration.transitionId",
      message: `Jira transition ID must be at most ${JIRA_TRANSITION_ID_MAX_LENGTH} characters`,
    });
  }

  if (
    typeof configuration.transitionId === "string" &&
    configuration.transitionId.trim().length > 0 &&
    !/^\d+$/.test(configuration.transitionId.trim())
  ) {
    errors.push({
      field: "configuration.transitionId",
      message: "Jira transition ID must be numeric",
    });
  }
}

function validateJiraIssueKey(value, errors) {
  const field = "configuration.issueKey";

  if (value === undefined || value === null) {
    errors.push({
      field,
      message: "Jira issue key is required",
    });
    return;
  }

  if (typeof value !== "string") {
    errors.push({
      field,
      message: "Jira issue key must be a string",
    });
    return;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    errors.push({
      field,
      message: "Jira issue key cannot be empty",
    });
    return;
  }

  if (trimmedValue.length > JIRA_ISSUE_KEY_MAX_LENGTH) {
    errors.push({
      field,
      message: `Jira issue key must be at most ${JIRA_ISSUE_KEY_MAX_LENGTH} characters`,
    });
    return;
  }

  if (!JIRA_ISSUE_KEY_REGEX.test(trimmedValue)) {
    errors.push({
      field,
      message: "Jira issue key must be a valid Jira issue key (e.g. ABC-123)",
    });
  }
}

function validateRequiredNonEmptyString(value, field, label, errors) {
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

  if (value.trim().length === 0) {
    errors.push({
      field,
      message: `${label} cannot be empty`,
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

function isValidUuid(value) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
}

module.exports = {
  validateCreateWorkflowStep,
  validateJiraCommentConfiguration,
  validateJiraTransitionConfiguration,
  validateWorkflowId,
  JIRA_COMMENT_MAX_LENGTH,
  JIRA_TRANSITION_ID_MAX_LENGTH,
  JIRA_ISSUE_KEY_MAX_LENGTH,
  VALID_ACTION_TYPES,
};
