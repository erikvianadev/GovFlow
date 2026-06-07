const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowExecutionStepsRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-execution-steps/workflowExecutionSteps.routes.js"
);
const workflowExecutionsGlobalRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.global.routes.js"
);

test("workflow execution steps routes are configured as nested global execution routes", () => {
  const workflowExecutionStepsRoutes = fs.readFileSync(
    workflowExecutionStepsRoutesPath,
    "utf8"
  );
  const workflowExecutionsGlobalRoutes = fs.readFileSync(
    workflowExecutionsGlobalRoutesPath,
    "utf8"
  );

  assert.match(
    workflowExecutionStepsRoutes,
    /Router\(\{\s*mergeParams:\s*true\s*\}\)/
  );
  assert.match(workflowExecutionStepsRoutes, /router\.get\(\s*"\/"/);
  assert.match(
    workflowExecutionStepsRoutes,
    /roleMiddleware\(\["ADMIN", "MANAGER"\]\)/
  );
  assert.match(
    workflowExecutionsGlobalRoutes,
    /router\.use\("\/:executionId\/steps", workflowExecutionStepsRoutes\);/
  );

  const stepsRouteIndex = workflowExecutionsGlobalRoutes.indexOf(
    'router.use("/:executionId/steps", workflowExecutionStepsRoutes);'
  );
  const getByIdRouteIndex = workflowExecutionsGlobalRoutes.indexOf(
    'router.get(\n  "/:id"'
  );

  assert.notStrictEqual(stepsRouteIndex, -1);
  assert.notStrictEqual(getByIdRouteIndex, -1);
  assert.ok(stepsRouteIndex < getByIdRouteIndex);
});
