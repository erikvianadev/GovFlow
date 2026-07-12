const assert = require("node:assert");
const test = require("node:test");

const {
  validateCreateManualAuditLog,
  MANUAL_AUDIT_LOG_ACTIONS,
} = require("../../src/validators/auditLogs.validator");

const validActorId = "22222222-2222-4222-8222-222222222222";

test("validateCreateManualAuditLog accepts a controlled manual action", () => {
  const errors = validateCreateManualAuditLog({
    action: "MANUAL_NOTE",
    entity: "user",
    entityId: "user-1",
    actorId: validActorId,
    metadata: { note: "reviewed" },
  });

  assert.deepStrictEqual(errors, []);
});

test("validateCreateManualAuditLog rejects actions outside the allowlist", () => {
  const errors = validateCreateManualAuditLog({
    action: "LOGIN_SUCCESS",
    entity: "auth",
    actorId: validActorId,
  });

  assert.ok(errors.some((error) => error.field === "action"));
});

test("validateCreateManualAuditLog requires a valid UUID actorId", () => {
  const missing = validateCreateManualAuditLog({
    action: "MANUAL_NOTE",
    entity: "user",
  });
  assert.ok(missing.some((error) => error.field === "actorId"));

  const invalid = validateCreateManualAuditLog({
    action: "MANUAL_NOTE",
    entity: "user",
    actorId: "not-a-uuid",
  });
  assert.ok(invalid.some((error) => error.field === "actorId"));
});

test("MANUAL_AUDIT_LOG_ACTIONS does not include system event actions", () => {
  assert.ok(!MANUAL_AUDIT_LOG_ACTIONS.includes("LOGIN_SUCCESS"));
  assert.ok(!MANUAL_AUDIT_LOG_ACTIONS.includes("USER_CREATED"));
  assert.ok(MANUAL_AUDIT_LOG_ACTIONS.length > 0);
});
