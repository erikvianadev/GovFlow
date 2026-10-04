type ListAuditLogsFiltersPayload = {
  action?: unknown;
  entity?: unknown;
  startDate?: unknown;
  endDate?: unknown
}

type CreateManualAuditLogPayload = {
  action?: unknown;
  entity?: unknown;
  entityId?: unknown;
  actorId?: unknown;
  metadata?: unknown
}

type CreateAuditLogPayload = {
  action?: unknown;
  entity?: unknown;
  entityId?: unknown;
  actorId?: unknown;
  metadata?: unknown
}

type ValidationError = {
  field: string;
  message: string;
}

// Controlled allowlist of actions that may be created through the manual
// POST /audit-logs endpoint. Manual entries cannot impersonate system events
// (e.g. LOGIN_SUCCESS, USER_CREATED); they use this dedicated namespace.
const MANUAL_AUDIT_LOG_ACTIONS = [
  "MANUAL_NOTE",
  "MANUAL_REVIEW",
  "MANUAL_CORRECTION",
  "MANUAL_OVERRIDE",
] as const;

type ManualAuditLogAction = typeof MANUAL_AUDIT_LOG_ACTIONS[number]

function validateCreateAuditLog(payload: CreateAuditLogPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  validateAction(payload.action, errors);
  validateEntity(payload.entity, errors);
  validateEntityId(payload.entityId, errors);
  validateActorId(payload.actorId, errors);
  validateMetadata(payload.metadata, errors);

  return errors;
}

function validateCreateManualAuditLog(payload: CreateManualAuditLogPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  validateManualAction(payload.action, errors);
  validateEntity(payload.entity, errors);
  validateEntityId(payload.entityId, errors);
  validateRequiredActorId(payload.actorId, errors);
  validateMetadata(payload.metadata, errors);

  return errors;
}

function validateListAuditLogsFilters(filters: ListAuditLogsFiltersPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  validateOptionalString(filters.action, "action", "Action", errors, 100);
  validateOptionalString(filters.entity, "entity", "Entity", errors, 100);
  validateOptionalDate(filters.startDate, "startDate", "Start date", errors);
  validateOptionalDate(filters.endDate, "endDate", "End date", errors);
  validateDateRange(filters.startDate, filters.endDate, errors);

  return errors;
}

function validateAction(action: unknown, errors: ValidationError[]): void {
  if (action === undefined || action === null) {
    errors.push({
      field: "action",
      message: "Action is required",
    });
    return;
  }

  if (typeof action !== "string") {
    errors.push({
      field: "action",
      message: "Action must be a string",
    });
    return;
  }

  if (action.trim().length === 0) {
    errors.push({
      field: "action",
      message: "Action cannot be empty",
    });
    return;
  }

  if (action.length > 100) {
    errors.push({
      field: "action",
      message: "Action must be at most 100 characters",
    });
  }
}

function validateEntity(entity: unknown, errors: ValidationError[]): void {
  if (entity === undefined || entity === null) {
    errors.push({
      field: "entity",
      message: "Entity is required",
    });
    return;
  }

  if (typeof entity !== "string") {
    errors.push({
      field: "entity",
      message: "Entity must be a string",
    });
    return;
  }

  if (entity.trim().length === 0) {
    errors.push({
      field: "entity",
      message: "Entity cannot be empty",
    });
    return;
  }

  if (entity.length > 100) {
    errors.push({
      field: "entity",
      message: "Entity must be at most 100 characters",
    });
  }
}

function validateEntityId(entityId: unknown, errors: ValidationError[]): void {
  if (entityId === undefined || entityId === null) {
    return;
  }

  if (typeof entityId !== "string") {
    errors.push({
      field: "entityId",
      message: "Entity ID must be a string",
    });
    return;
  }

  if (entityId.length > 100) {
    errors.push({
      field: "entityId",
      message: "Entity ID must be at most 100 characters",
    });
  }
}

function validateActorId(actorId: unknown, errors: ValidationError[]): void {
  if (actorId === undefined || actorId === null) {
    return;
  }

  if (typeof actorId !== "string") {
    errors.push({
      field: "actorId",
      message: "Actor ID must be a string",
    });
  }
}

function isValidAuditLogActions(value: unknown): value is ManualAuditLogAction {
  return typeof value === 'string' && 
  (MANUAL_AUDIT_LOG_ACTIONS as readonly string[]).includes(value) 
}

function validateManualAction(action: unknown, errors: ValidationError[]): void {
  if (action === undefined || action === null) {
    errors.push({
      field: "action",
      message: "Action is required",
    });
    return;
  }

  if (typeof action !== "string") {
    errors.push({
      field: "action",
      message: "Action must be a string",
    });
    return;
  }

  if (!isValidAuditLogActions(action)) {
    errors.push({
      field: "action",
      message: `Action must be one of: ${MANUAL_AUDIT_LOG_ACTIONS.join(", ")}`,
    });
  }
}

function validateRequiredActorId(actorId: unknown, errors: ValidationError[]): void {
  if (actorId === undefined || actorId === null) {
    errors.push({
      field: "actorId",
      message: "Actor ID is required",
    });
    return;
  }

  if (typeof actorId !== "string" || !isValidUuid(actorId)) {
    errors.push({
      field: "actorId",
      message: "Actor ID must be a valid UUID",
    });
  }
}

function isValidUuid(value: unknown): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return typeof value === 'string' && uuidRegex.test(value);
}

function validateMetadata(metadata: unknown, errors: ValidationError[]): void {
  if (metadata === undefined || metadata === null) {
    return;
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push({
      field: "metadata",
      message: "Metadata must be an object",
    });
  }
}

function validateOptionalString(
  value: unknown, 
  field: string, 
  label: string, 
  errors: ValidationError[], 
  maxLength: number
): void {
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

  if (value.trim().length === 0) {
    errors.push({
      field,
      message: `${label} cannot be empty`,
    });
    return;
  }

  if (value.length > maxLength) {
    errors.push({
      field,
      message: `${label} must be at most ${maxLength} characters`,
    });
  }
}

function validateOptionalDate(
  value: unknown, 
  field: string, 
  label: string, 
  errors: ValidationError[]
): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  const date = new Date(value as string);

  if (Number.isNaN(date.getTime())) {
    errors.push({
      field,
      message: `${label} must be a valid date`,
    });
  }
}

function validateDateRange(
  startDate: unknown, 
  endDate: unknown, 
  errors: ValidationError[]
): void {
  if (!startDate || !endDate) {
    return;
  }

  const parsedStartDate = new Date(startDate as string);
  const parsedEndDate = new Date(endDate as string);

  if (
    Number.isNaN(parsedStartDate.getTime()) ||
    Number.isNaN(parsedEndDate.getTime())
  ) {
    return;
  }

  if (parsedStartDate > parsedEndDate) {
    errors.push({
      field: "dateRange",
      message: "Start date must be before or equal to end date",
    });
  }
}

export = {
  validateCreateAuditLog,
  validateCreateManualAuditLog,
  validateListAuditLogsFilters,
  MANUAL_AUDIT_LOG_ACTIONS,
};
