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
  assert.deepStrictEqual(capturedValues, ["execution-1"]);
});
