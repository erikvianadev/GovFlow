type ValidationError = {
  field: string;
  message: string;
};

type CreateWorkflowExecutionPayload = {
  input?: unknown;
};

type ListWorkflowExecutionsFilters = {
  workflowId?: unknown;
  startedBy?: unknown;
  status?: unknown;
};

type RecoverStaleRunningPayload = {
  timeoutMinutes?: unknown;
  limit?: unknown;
};

type PositiveIntegerOptions = {
  max?: number;
};

function validateCreateWorkflowExecution(payload: CreateWorkflowExecutionPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  validateInput(payload.input, errors);

  return errors;
}

function validateWorkflowId(workflowId: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  validateRequiredUuid(workflowId, "workflowId", "Workflow ID", errors);

  return errors;
}

function validateWorkflowExecutionId(id: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  validateRequiredUuid(id, "id", "Workflow execution ID", errors);

  return errors;
}

function validateListWorkflowExecutionsFilters(
  filters: ListWorkflowExecutionsFilters
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateOptionalUuid(filters.workflowId, "workflowId", "Workflow ID", errors);
  validateOptionalUuid(filters.startedBy, "startedBy", "Started by", errors);
  validateOptionalStatus(filters.status, errors);

  return errors;
}

const MAX_RECOVERY_LIMIT = 100;

function validateRecoverStaleRunning(
  { timeoutMinutes, limit }: RecoverStaleRunningPayload = {}
): ValidationError[] {
  const errors: ValidationError[] = [];

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
  value: unknown,
  field: string,
  label: string,
  errors: ValidationError[],
  { max }: PositiveIntegerOptions = {}
): void {
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

function validateInput(input: unknown, errors: ValidationError[]): void {
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

const VALID_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELED"] as const;

type ValidStatusesString = typeof VALID_STATUSES[number]

function isValidStatusString(value: unknown): value is ValidStatusesString {
  return typeof value === 'string' && 
  (VALID_STATUSES as readonly string[]).includes(value)
}

function validateOptionalStatus(status: unknown, errors: ValidationError[]): void {
  if (status === undefined || status === null || status === "") {
    return;
  }
  if (!isValidStatusString(status)) {
    errors.push({
      field: "status",
      message: "Status must be one of: PENDING, RUNNING, COMPLETED, FAILED, CANCELED",
    });
  }
}

function validateRequiredUuid(value: unknown, field: string, label: string, errors: ValidationError[]): void {
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

function validateOptionalUuid(value: unknown, field: string, label: string, errors: ValidationError[]): void {
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

function isValidUuid(value: unknown): boolean {
  if (value === "00000000-0000-0000-0000-000000000000") {
    return true;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return typeof value === 'string' && uuidRegex.test(value);
}

export = {
  validateCreateWorkflowExecution,
  validateWorkflowId,
  validateWorkflowExecutionId,
  validateListWorkflowExecutionsFilters,
  validateRecoverStaleRunning,
  MAX_RECOVERY_LIMIT,
};
