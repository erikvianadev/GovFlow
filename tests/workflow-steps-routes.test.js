const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowStepsRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-steps/workflowSteps.routes.js"
);
const workflowsRoutesPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.routes.js"
);

test("workflow steps routes are configured as nested routes", () => {
  const workflowStepsRoutes = fs.readFileSync(workflowStepsRoutesPath, "utf8");
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");

  assert.match(workflowStepsRoutes, /Router\(\{\s*mergeParams:\s*true\s*\}\)/);
  assert.match(
    workflowsRoutes,
    /router\.use\("\/:workflowId\/steps", workflowStepsRoutes\);/
  );

  const nestedRouteIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/steps", workflowStepsRoutes);'
  );
  const getByIdRouteIndex = workflowsRoutes.indexOf('router.get(\n  "/:id"');

  assert.notStrictEqual(nestedRouteIndex, -1);
  assert.notStrictEqual(getByIdRouteIndex, -1);
  assert.ok(nestedRouteIndex < getByIdRouteIndex);
});
