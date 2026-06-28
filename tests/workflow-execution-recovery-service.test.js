const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowExecutionRecovery.service.js"
);
const databasePath = path.join(__dirname, "../src/config/database.js");
const envPath = path.join(__dirname, "../src/config/env.js");
const workflowExecutionsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.repository.js"
);
const workflowExecutionStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.repository.js"
);
const jiraServicePath = path.join(__dirname, "../src/modules/jira/jira.service.js");
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");
const loggerPath = path.join(__dirname, "../src/config/logger.js");

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadService({
  staleExecutions = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      workflow_id: "workflow-1",
      status: "RUNNING",
      result: null,
      started_at: "2026-06-14T10:00:00.000Z",
    },
  ],
  failExecutionImpl,
  failRunningStepsImpl,
  executionSteps = [],
  findCommentImpl,
} = {}) {
  const trx = {
    query: async () => ({ rows: [] }),
  };
  const calls = {
    findStale: [],
    transactions: 0,
    failedSteps: [],
    failedExecutions: [],
    findByExecutionId: [],
    completedSteps: [],
    findComment: [],
    audit: [],
  };

  [
    servicePath,
    databasePath,
    envPath,
    workflowExecutionsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
    jiraServicePath,
    safeAuditLogPath,
    loggerPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(loggerPath, {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: () => {},
  });
  mockModule(envPath, {
    workflowExecution: {
      runningTimeoutMinutes: 30,
    },
  });
  mockModule(databasePath, {
    transaction: async (callback) => {
      calls.transactions += 1;
      return callback(trx);
    },
  });
  mockModule(workflowExecutionsRepositoryPath, {
    findStaleRunning: async (payload) => {
      calls.findStale.push(payload);
      return staleExecutions;
    },
    failStaleRunning:
      failExecutionImpl ||
      (async (payload, db) => {
        assert.strictEqual(db, trx);
        calls.failedExecutions.push(payload);
        return {
          id: payload.id,
          workflow_id: "workflow-1",
          status: "FAILED",
          started_at: "2026-06-14T10:00:00.000Z",
          completed_at: "2026-06-14T10:40:00.000Z",
          result: payload.result,
        };
      }),
  });
  mockModule(workflowExecutionStepsRepositoryPath, {
    findByExecutionId: async (executionId) => {
      calls.findByExecutionId.push(executionId);
      return executionSteps;
    },
    failRunningByExecutionId:
      failRunningStepsImpl ||
      (async (payload, db) => {
        assert.strictEqual(db, trx);
        calls.failedSteps.push(payload);
        return [
          {
            id: "execution-step-1",
            step_id: "step-1",
            status: "FAILED",
          },
        ];
      }),
    updateStatus: async (payload, db) => {
      assert.strictEqual(db, trx);
      calls.completedSteps.push(payload);
      return {
        id: payload.id,
        step_id: "step-1",
        status: payload.status,
        output: payload.output,
      };
    },
  });
  mockModule(jiraServicePath, {
    findCommentByExecutionStepMarker: async (payload) => {
      calls.findComment.push(payload);
      return findCommentImpl ? findCommentImpl(payload) : null;
    },
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      calls.audit.push(payload);
    },
  });

  return {
    service: require(servicePath),
    calls,
  };
}

// A stale execution carrying a single RUNNING JIRA_COMMENT step that the Jira
// lookup can confirm. Both the bulk fail update and findByExecutionId expose
// the same step id so the recovery can correlate them.
function loadServiceWithRecoverableStep({ findCommentImpl } = {}) {
  return loadService({
    executionSteps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        status: "RUNNING",
        action_type: "JIRA_COMMENT",
        configuration: { issueKey: "DO-32", comment: "Processed by GovFlow" },
      },
    ],
    findCommentImpl:
      findCommentImpl ||
      (() => ({
        commentId: "10235",
        issueKey: "DO-32",
        created: "2026-06-16T10:00:00.000Z",
      })),
  });
}

test("recoverStaleRunningExecutions fails stale executions and running steps", async () => {
  const { service, calls } = loadService();
  const recoveredBy = "22222222-2222-4222-8222-222222222222";

  const result = await service.recoverStaleRunningExecutions({
    recoveredBy,
    timeoutMinutes: 45,
    limit: 5,
  });

  assert.deepStrictEqual(calls.findStale, [
    {
      timeoutMinutes: 45,
      limit: 5,
    },
  ]);
  assert.strictEqual(calls.transactions, 1);
  assert.deepStrictEqual(calls.failedSteps, [
    {
      executionId: "11111111-1111-4111-8111-111111111111",
      errorMessage: "Execution timed out while running",
    },
  ]);
  assert.strictEqual(calls.failedExecutions.length, 1);
  assert.strictEqual(
    calls.failedExecutions[0].result.recoveryReason,
    "Execution timed out while running"
  );
  assert.strictEqual(calls.failedExecutions[0].result.recoveredBy, recoveredBy);
  assert.strictEqual(calls.failedExecutions[0].result.timeoutMinutes, 45);
  // The complete recovery result (including failed RUNNING steps) is written in
  // a single guarded execution update, not a second unguarded one.
  assert.deepStrictEqual(
    calls.failedExecutions[0].result.failedRunningSteps,
    [
      {
        executionStepId: "execution-step-1",
        stepId: "step-1",
        error: "Execution timed out while running",
      },
    ]
  );
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    ["WORKFLOW_EXECUTION_RECOVERY_FAILED"]
  );
  assert.strictEqual(result.recoveredCount, 1);
  assert.strictEqual(result.scannedCount, 1);
  assert.strictEqual(result.recoveredExecutions[0].status, "FAILED");
  assert.strictEqual(result.recoveredExecutions[0].failedRunningStepsCount, 1);
});

test("recoverStaleRunningExecutions rejects invalid timeoutMinutes and limit", async () => {
  const { service, calls } = loadService();

  await assert.rejects(
    service.recoverStaleRunningExecutions({ timeoutMinutes: -5 }),
    (error) =>
      error.statusCode === 400 && error.message === "Validation failed"
  );

  await assert.rejects(
    service.recoverStaleRunningExecutions({ limit: 1000 }),
    (error) =>
      error.statusCode === 400 && error.message === "Validation failed"
  );

  await assert.rejects(
    service.recoverStaleRunningExecutions({ timeoutMinutes: 10.5 }),
    (error) =>
      error.statusCode === 400 && error.message === "Validation failed"
  );

  // Invalid input is rejected before any scan happens.
  assert.strictEqual(calls.findStale.length, 0);
});

test("recoverStaleRunningExecutions falls back to env timeout and default limit", async () => {
  const { service, calls } = loadService({
    staleExecutions: [],
  });

  const result = await service.recoverStaleRunningExecutions();

  assert.deepStrictEqual(calls.findStale, [
    {
      timeoutMinutes: 30,
      limit: 100,
    },
  ]);
  assert.strictEqual(result.recoveredCount, 0);
});

test("recoverStaleRunningExecutions skips rows that are no longer stale", async () => {
  const { service, calls } = loadService({
    failExecutionImpl: async (payload) => {
      calls.failedExecutions.push(payload);
      return undefined;
    },
  });

  const result = await service.recoverStaleRunningExecutions();

  assert.strictEqual(calls.transactions, 1);
  // Steps are failed first, but the guarded execution update matches nothing,
  // so the transaction is rolled back and the execution is not recovered.
  assert.strictEqual(calls.failedSteps.length, 1);
  assert.strictEqual(calls.audit.length, 0);
  assert.strictEqual(result.scannedCount, 1);
  assert.strictEqual(result.recoveredCount, 0);
});

test("recoverStaleRunningExecutions recovers a stale JIRA_COMMENT step confirmed via Jira lookup, but still finalizes the execution as FAILED", async () => {
  const { service, calls } = loadServiceWithRecoverableStep();

  const result = await service.recoverStaleRunningExecutions();

  // Remote lookup ran before the transaction for the RUNNING JIRA_COMMENT step.
  assert.strictEqual(calls.findComment.length, 1);
  assert.deepStrictEqual(calls.findComment[0], {
    issueKey: "DO-32",
    executionStepId: "execution-step-1",
  });

  // The confirmed step is corrected from FAILED to COMPLETED inside the same
  // transaction, with the reconstructed remote-recovered output.
  assert.strictEqual(calls.completedSteps.length, 1);
  assert.strictEqual(calls.completedSteps[0].id, "execution-step-1");
  assert.strictEqual(calls.completedSteps[0].status, "COMPLETED");
  assert.strictEqual(calls.completedSteps[0].errorMessage, null);
  assert.deepStrictEqual(calls.completedSteps[0].output, {
    provider: "jira",
    operation: "comment",
    issueKey: "DO-32",
    commentId: "10235",
    status: "completed",
    idempotencyKey: "workflowExecutionStep:execution-step-1",
    recoveredViaRemoteLookup: true,
  });

  // The recovered step is no longer reported as a failed running step.
  assert.deepStrictEqual(
    calls.failedExecutions[0].result.failedRunningSteps,
    []
  );
  assert.deepStrictEqual(
    calls.failedExecutions[0].result.recoveredRunningSteps,
    [
      {
        executionStepId: "execution-step-1",
        stepId: "step-1",
        recoveredViaRemoteLookup: true,
      },
    ]
  );

  // The execution itself is still finalized FAILED.
  assert.strictEqual(result.recoveredExecutions[0].status, "FAILED");
  assert.strictEqual(result.recoveredExecutions[0].failedRunningStepsCount, 0);
  assert.strictEqual(result.recoveredExecutions[0].recoveredRunningStepsCount, 1);

  // Both the execution recovery audit and the per-step recovery audit fire.
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    [
      "WORKFLOW_EXECUTION_RECOVERY_FAILED",
      "WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP",
    ]
  );
});

test("recoverStaleRunningExecutions keeps the safe default (FAILED) when the Jira lookup finds nothing", async () => {
  const { service, calls } = loadServiceWithRecoverableStep({
    findCommentImpl: () => null,
  });

  const result = await service.recoverStaleRunningExecutions();

  // The lookup was attempted but found nothing.
  assert.strictEqual(calls.findComment.length, 1);
  // No step was corrected to COMPLETED.
  assert.strictEqual(calls.completedSteps.length, 0);
  // The step stays in the failed running steps list.
  assert.deepStrictEqual(
    calls.failedExecutions[0].result.failedRunningSteps,
    [
      {
        executionStepId: "execution-step-1",
        stepId: "step-1",
        error: "Execution timed out while running",
      },
    ]
  );
  assert.deepStrictEqual(
    calls.failedExecutions[0].result.recoveredRunningSteps,
    []
  );
  // Only the existing execution-level audit fires.
  assert.deepStrictEqual(
    calls.audit.map((entry) => entry.action),
    ["WORKFLOW_EXECUTION_RECOVERY_FAILED"]
  );
  assert.strictEqual(result.recoveredExecutions[0].failedRunningStepsCount, 1);
  assert.strictEqual(result.recoveredExecutions[0].recoveredRunningStepsCount, 0);
});

test("recoverStaleRunningExecutions does not attempt a Jira lookup for non-JIRA_COMMENT or unconfigured steps", async () => {
  const { service, calls } = loadService({
    executionSteps: [
      {
        id: "execution-step-1",
        step_id: "step-1",
        status: "RUNNING",
        action_type: "JIRA_TRANSITION",
        configuration: { issueKey: "DO-32", transitionId: "31" },
      },
      {
        id: "execution-step-2",
        step_id: "step-2",
        status: "RUNNING",
        action_type: "JIRA_COMMENT",
        configuration: { comment: "missing issue key" },
      },
      {
        id: "execution-step-3",
        step_id: "step-3",
        status: "COMPLETED",
        action_type: "JIRA_COMMENT",
        configuration: { issueKey: "DO-32", comment: "already done" },
      },
    ],
  });

  await service.recoverStaleRunningExecutions();

  assert.strictEqual(calls.findComment.length, 0);
  assert.strictEqual(calls.completedSteps.length, 0);
});
