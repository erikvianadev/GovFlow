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
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");

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
} = {}) {
  const trx = {
    query: async () => ({ rows: [] }),
  };
  const calls = {
    findStale: [],
    transactions: 0,
    failedSteps: [],
    failedExecutions: [],
    finalizedExecutions: [],
    audit: [],
  };

  [
    servicePath,
    databasePath,
    envPath,
    workflowExecutionsRepositoryPath,
    workflowExecutionStepsRepositoryPath,
    safeAuditLogPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

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
    updateStatus: async (payload, db) => {
      assert.strictEqual(db, trx);
      calls.finalizedExecutions.push(payload);
      return {
        id: payload.id,
        workflow_id: "workflow-1",
        status: payload.status,
        started_at: "2026-06-14T10:00:00.000Z",
        completed_at: "2026-06-14T10:40:00.000Z",
        result: payload.result,
      };
    },
  });
  mockModule(workflowExecutionStepsRepositoryPath, {
    failRunningByExecutionId: async (payload, db) => {
      assert.strictEqual(db, trx);
      calls.failedSteps.push(payload);
      return [
        {
          id: "execution-step-1",
          step_id: "step-1",
          status: "FAILED",
        },
      ];
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
  assert.strictEqual(calls.finalizedExecutions.length, 1);
  assert.deepStrictEqual(
    calls.finalizedExecutions[0].result.failedRunningSteps,
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

test("recoverStaleRunningExecutions uses env timeout and caps the limit", async () => {
  const { service, calls } = loadService({
    staleExecutions: [],
  });

  const result = await service.recoverStaleRunningExecutions({
    limit: 999,
  });

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
  assert.strictEqual(calls.failedSteps.length, 0);
  assert.strictEqual(calls.finalizedExecutions.length, 0);
  assert.strictEqual(calls.audit.length, 0);
  assert.strictEqual(result.scannedCount, 1);
  assert.strictEqual(result.recoveredCount, 0);
});
