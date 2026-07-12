const assert = require("node:assert");
const test = require("node:test");

const {
  buildWorkflowExecutionsFiltersQuery,
  claimPendingExecution,
  failStaleRunning,
  finalizeRunningExecution,
  findStaleRunning,
} = require("../../src/modules/workflow-executions/workflowExecutions.repository");

test("buildWorkflowExecutionsFiltersQuery builds no WHERE clause without filters", () => {
  const result = buildWorkflowExecutionsFiltersQuery({});

  assert.deepStrictEqual(result, {
    whereClause: "",
    values: [],
  });
});

test("buildWorkflowExecutionsFiltersQuery builds ordered parameterized filters", () => {
  const result = buildWorkflowExecutionsFiltersQuery({
    workflowId: "workflow-id",
    startedBy: "user-id",
    status: "PENDING",
  });

  assert.deepStrictEqual(result, {
    whereClause:
      "WHERE workflow_executions.workflow_id = $1 AND workflow_executions.started_by = $2 AND workflow_executions.status = $3",
    values: ["workflow-id", "user-id", "PENDING"],
  });
});

test("claimPendingExecution atomically transitions only PENDING executions to RUNNING", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-1",
            status: "RUNNING",
          },
        ],
      };
    },
  };

  const claimed = await claimPendingExecution({ id: "execution-1" }, db);

  assert.match(
    capturedSql,
    /update workflow_executions set status = 'running', started_at = coalesce\(started_at, now\(\)\), updated_at = now\(\) where id = \$1 and status = 'pending' returning/
  );
  assert.deepStrictEqual(capturedValues, ["execution-1"]);
  assert.strictEqual(claimed.status, "RUNNING");
});

test("claimPendingExecution returns undefined when no PENDING row matches", async () => {
  const db = {
    query: async () => ({ rows: [] }),
  };

  const claimed = await claimPendingExecution({ id: "execution-1" }, db);

  assert.strictEqual(claimed, undefined);
});

test("finalizeRunningExecution only updates executions still in RUNNING", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-1",
            status: "COMPLETED",
          },
        ],
      };
    },
  };
  const result = { stepsProcessed: 2 };

  const finalized = await finalizeRunningExecution(
    {
      id: "execution-1",
      status: "COMPLETED",
      result,
    },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_executions set status = \$2, completed_at = now\(\), result = coalesce\(\$3, result\), updated_at = now\(\) where id = \$1 and status = 'running' returning/
  );
  assert.deepStrictEqual(capturedValues, ["execution-1", "COMPLETED", result]);
  assert.strictEqual(finalized.status, "COMPLETED");
});

test("finalizeRunningExecution returns undefined when the execution left RUNNING", async () => {
  const db = {
    query: async () => ({ rows: [] }),
  };

  const finalized = await finalizeRunningExecution(
    {
      id: "execution-1",
      status: "COMPLETED",
      result: { stepsProcessed: 2 },
    },
    db
  );

  assert.strictEqual(finalized, undefined);
});

test("findStaleRunning selects RUNNING executions older than the timeout", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-1",
            status: "RUNNING",
          },
        ],
      };
    },
  };

  const result = await findStaleRunning(
    { timeoutMinutes: 30, limit: 10 },
    db
  );

  assert.match(
    capturedSql,
    /where status = 'running' and started_at is not null and started_at <= now\(\) - \(\$1::numeric \* interval '1 minute'\) order by started_at asc limit \$2/
  );
  assert.deepStrictEqual(capturedValues, [30, 10]);
  assert.strictEqual(result.length, 1);
});

test("failStaleRunning fails only stale RUNNING executions", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-1",
            status: "FAILED",
            result: values[2],
          },
        ],
      };
    },
  };
  const recoveryResult = { recoveryReason: "Execution timed out while running" };

  const result = await failStaleRunning(
    {
      id: "execution-1",
      timeoutMinutes: 30,
      result: recoveryResult,
    },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_executions set status = 'failed', completed_at = now\(\), result = \$3, updated_at = now\(\) where id = \$1 and status = 'running' and started_at is not null and started_at <= now\(\) - \(\$2::numeric \* interval '1 minute'\) returning/
  );
  assert.deepStrictEqual(capturedValues, ["execution-1", 30, recoveryResult]);
  assert.strictEqual(result.status, "FAILED");
});
