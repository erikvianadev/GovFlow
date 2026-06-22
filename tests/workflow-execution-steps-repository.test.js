const assert = require("node:assert");
const test = require("node:test");

const repository = require("../src/modules/workflow-execution-steps/workflowExecutionSteps.repository");

test("createMany returns an empty list without querying for empty payloads", async () => {
  const db = {
    query: async () => {
      throw new Error("query should not be called");
    },
  };

  const result = await repository.createMany([], db);

  assert.deepStrictEqual(result, []);
});

test("createMany builds a bulk insert for execution steps", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-step-1",
            execution_id: "execution-1",
            step_id: "step-1",
            status: "PENDING",
          },
          {
            id: "execution-step-2",
            execution_id: "execution-1",
            step_id: "step-2",
            status: "PENDING",
          },
        ],
      };
    },
  };

  const result = await repository.createMany(
    [
      { executionId: "execution-1", stepId: "step-1" },
      { executionId: "execution-1", stepId: "step-2" },
    ],
    db
  );

  assert.match(
    capturedSql,
    /insert into workflow_execution_steps \( execution_id, step_id \) values \(\$1, \$2\), \(\$3, \$4\) returning/
  );
  assert.deepStrictEqual(capturedValues, [
    "execution-1",
    "step-1",
    "execution-1",
    "step-2",
  ]);
  assert.strictEqual(result.length, 2);
});

test("findByExecutionId returns execution steps ordered by workflow step order", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return { rows: [] };
    },
  };

  await repository.findByExecutionId("execution-1", db);

  assert.match(
    capturedSql,
    /workflow_steps.description as step_description.*workflow_steps.configuration.*from workflow_execution_steps inner join workflow_steps on workflow_steps.id = workflow_execution_steps.step_id where workflow_execution_steps.execution_id = \$1 order by workflow_steps.step_order asc/
  );
  assert.match(capturedSql, /workflow_execution_steps.output/);
  assert.deepStrictEqual(capturedValues, ["execution-1"]);
});

test("updateStatus updates workflow execution step lifecycle fields and clears errors", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-step-1",
            status: "COMPLETED",
            error_message: null,
          },
        ],
      };
    },
  };
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  const completedAt = new Date("2026-01-01T00:01:00.000Z");

  const output = { provider: "jira", operation: "comment", commentId: "10235" };
  const updated = await repository.updateStatus(
    {
      id: "execution-step-1",
      status: "COMPLETED",
      startedAt,
      completedAt,
      errorMessage: null,
      output,
    },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_execution_steps set status = \$2, started_at = coalesce\(\$3, started_at\), completed_at = coalesce\(\$4, completed_at\), error_message = \$5, output = coalesce\(\$6, output\), updated_at = now\(\) where id = \$1 returning/
  );
  assert.deepStrictEqual(capturedValues, [
    "execution-step-1",
    "COMPLETED",
    startedAt,
    completedAt,
    null,
    output,
  ]);
  assert.strictEqual(updated.status, "COMPLETED");
  assert.strictEqual(updated.error_message, null);
});

test("updateStatus preserves existing output when none is provided", async () => {
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedValues = values;
      return { rows: [{ id: "execution-step-1", status: "PENDING" }] };
    },
  };

  await repository.updateStatus(
    {
      id: "execution-step-1",
      status: "PENDING",
      errorMessage: "Temporary Jira failure",
    },
    db
  );

  // output defaults to null, and COALESCE(NULL, output) keeps the persisted
  // value untouched on reverts/failures.
  assert.strictEqual(capturedValues[5], null);
});

test("claimPendingStep atomically claims a PENDING step", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-step-1",
            execution_id: "execution-1",
            step_id: "step-1",
            status: "RUNNING",
          },
        ],
      };
    },
  };

  const claimed = await repository.claimPendingStep(
    { id: "execution-step-1" },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_execution_steps set status = 'running', started_at = coalesce\(started_at, now\(\)\), error_message = null, updated_at = now\(\) where id = \$1 and status = 'pending' returning/
  );
  assert.deepStrictEqual(capturedValues, ["execution-step-1"]);
  assert.strictEqual(claimed.status, "RUNNING");
});

test("claimPendingStep returns undefined when the step is not PENDING", async () => {
  const db = {
    query: async () => ({ rows: [] }),
  };

  const claimed = await repository.claimPendingStep(
    { id: "execution-step-1" },
    db
  );

  assert.strictEqual(claimed, undefined);
});

test("failRunningByExecutionId fails only RUNNING steps for an execution", async () => {
  let capturedSql;
  let capturedValues;
  const db = {
    query: async (sql, values) => {
      capturedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedValues = values;
      return {
        rows: [
          {
            id: "execution-step-1",
            execution_id: "execution-1",
            status: "FAILED",
            error_message: values[1],
          },
        ],
      };
    },
  };

  const result = await repository.failRunningByExecutionId(
    {
      executionId: "execution-1",
      errorMessage: "Execution timed out while running",
    },
    db
  );

  assert.match(
    capturedSql,
    /update workflow_execution_steps set status = 'failed', completed_at = now\(\), error_message = \$2, updated_at = now\(\) where execution_id = \$1 and status = 'running' returning/
  );
  assert.deepStrictEqual(capturedValues, [
    "execution-1",
    "Execution timed out while running",
  ]);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].status, "FAILED");
});
