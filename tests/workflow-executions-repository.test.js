const assert = require("node:assert");
const test = require("node:test");

const {
  buildWorkflowExecutionsFiltersQuery,
  claimPendingExecution,
  updateStatus,
} = require("../src/modules/workflow-executions/workflowExecutions.repository");

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

test("updateStatus updates workflow execution lifecycle fields", async () => {
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
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  const completedAt = new Date("2026-01-01T00:01:00.000Z");
  const result = { stepsProcessed: 2 };

  const updated = await updateStatus(
    {
      id: "execution-1",
      status: "COMPLETED",
      startedAt,
      completedAt,
      result,
    },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_executions set status = \$2, started_at = coalesce\(\$3, started_at\), completed_at = coalesce\(\$4, completed_at\), result = coalesce\(\$5, result\), updated_at = now\(\) where id = \$1 returning/
  );
  assert.deepStrictEqual(capturedValues, [
    "execution-1",
    "COMPLETED",
    startedAt,
    completedAt,
    result,
  ]);
  assert.strictEqual(updated.status, "COMPLETED");
});
