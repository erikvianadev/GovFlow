const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const {
  buildWorkflowsFiltersQuery,
} = require("../src/modules/workflows/workflows.repository");

test("buildWorkflowsFiltersQuery builds no WHERE clause without filters", () => {
  const result = buildWorkflowsFiltersQuery({});

  assert.deepStrictEqual(result, {
    whereClause: "",
    values: [],
  });
});

test("buildWorkflowsFiltersQuery builds ordered parameterized filters", () => {
  const result = buildWorkflowsFiltersQuery({
    departmentId: "department-id",
    createdBy: "user-id",
    isActive: true,
  });

  assert.deepStrictEqual(result, {
    whereClause:
      "WHERE workflows.department_id = $1 AND workflows.created_by = $2 AND workflows.is_active = $3",
    values: ["department-id", "user-id", true],
  });
});

// --- duplicate() ---------------------------------------------------------
//
// duplicate() opens its own database.transaction internally (unlike the
// other repository functions here, which take `db` as a parameter), so
// these tests mock config/database.js and the workflow-steps repository via
// require.cache — the same technique already used in
// tests/workflow-executions-service.test.js for transaction-orchestrated
// flows.

const repositoryPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.repository.js"
);
const databasePath = path.join(__dirname, "../src/config/database.js");
const workflowStepsRepositoryPath = path.join(
  __dirname,
  "../src/modules/workflow-steps/workflowSteps.repository.js"
);

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadRepository({ sourceSteps = [], createImpl } = {}) {
  let capturedInsertSql;
  let capturedInsertValues;
  const createdSteps = [];
  const calls = {
    findByWorkflowIdArgs: null,
  };

  const trx = {
    query: async (sql, values) => {
      capturedInsertSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      capturedInsertValues = values;

      return {
        rows: [
          {
            id: "new-workflow-1",
            name: values[0],
            description: values[1],
            department_id: values[2],
            created_by: values[3],
            is_active: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
    },
  };

  [repositoryPath, databasePath, workflowStepsRepositoryPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(databasePath, {
    transaction: async (callback) => callback(trx),
  });
  mockModule(workflowStepsRepositoryPath, {
    findByWorkflowId: async (workflowId, db) => {
      assert.strictEqual(db, trx);
      calls.findByWorkflowIdArgs = workflowId;
      return sourceSteps;
    },
    create: async (payload, db) => {
      assert.strictEqual(db, trx);
      createdSteps.push(payload);

      if (createImpl) {
        return createImpl(payload);
      }

      return { ...payload, id: `new-step-${createdSteps.length}` };
    },
  });

  return {
    repository: require(repositoryPath),
    getCapturedInsert: () => ({
      sql: capturedInsertSql,
      values: capturedInsertValues,
    }),
    createdSteps,
    calls,
  };
}

test("duplicate inserts the new workflow with is_active=false inside the transaction", async () => {
  const { repository, getCapturedInsert } = loadRepository();

  const result = await repository.duplicate({
    sourceWorkflowId: "source-1",
    name: "Original (copy)",
    description: "Original description",
    departmentId: "department-1",
    createdBy: "user-1",
  });

  const { sql, values } = getCapturedInsert();

  assert.match(
    sql,
    /insert into workflows \( name, description, department_id, created_by, is_active \) values \(\$1, \$2, \$3, \$4, false\) returning/
  );
  assert.deepStrictEqual(values, [
    "Original (copy)",
    "Original description",
    "department-1",
    "user-1",
  ]);
  assert.strictEqual(result.is_active, false);
  assert.strictEqual(result.id, "new-workflow-1");
});

test("duplicate copies every source step (including inactive ones) onto the new workflow, inside the same transaction", async () => {
  const sourceSteps = [
    {
      id: "step-active",
      name: "Step 1",
      description: "First step",
      step_order: 1,
      action_type: "MANUAL",
      configuration: { foo: "bar" },
      is_active: true,
    },
    {
      id: "step-inactive",
      name: "Step 2",
      description: null,
      step_order: 2,
      action_type: "NOTIFICATION",
      configuration: null,
      is_active: false,
    },
  ];

  const { repository, createdSteps, calls } = loadRepository({ sourceSteps });

  const result = await repository.duplicate({
    sourceWorkflowId: "source-1",
    name: "Original (copy)",
    description: null,
    departmentId: null,
    createdBy: "user-1",
  });

  assert.strictEqual(calls.findByWorkflowIdArgs, "source-1");
  assert.deepStrictEqual(createdSteps, [
    {
      workflowId: "new-workflow-1",
      name: "Step 1",
      description: "First step",
      stepOrder: 1,
      actionType: "MANUAL",
      configuration: { foo: "bar" },
      isActive: true,
    },
    {
      workflowId: "new-workflow-1",
      name: "Step 2",
      description: null,
      stepOrder: 2,
      actionType: "NOTIFICATION",
      configuration: null,
      isActive: false,
    },
  ]);
  assert.strictEqual(result.id, "new-workflow-1");
});

test("duplicate propagates a step-creation failure so the outer transaction rolls back the whole workflow", async () => {
  const sourceSteps = [
    {
      id: "step-1",
      name: "Step 1",
      description: null,
      step_order: 1,
      action_type: "MANUAL",
      configuration: null,
      is_active: true,
    },
  ];

  const { repository } = loadRepository({
    sourceSteps,
    createImpl: async () => {
      throw new Error("step insert failed");
    },
  });

  await assert.rejects(
    repository.duplicate({
      sourceWorkflowId: "source-1",
      name: "Original (copy)",
      description: null,
      departmentId: null,
      createdBy: "user-1",
    }),
    /step insert failed/
  );
});
