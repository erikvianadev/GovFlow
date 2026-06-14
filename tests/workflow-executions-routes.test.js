const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const nestedRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.routes.js"
);
const globalRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.global.routes.js"
);
const workflowsRoutesPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.routes.js"
);
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");

test("workflow executions routes are configured as nested and global routes", () => {
  const nestedRoutes = fs.readFileSync(nestedRoutesPath, "utf8");
  const globalRoutes = fs.readFileSync(globalRoutesPath, "utf8");
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");
  const routesIndex = fs.readFileSync(routesIndexPath, "utf8");

  assert.match(nestedRoutes, /Router\(\{\s*mergeParams:\s*true\s*\}\)/);
  assert.match(
    nestedRoutes,
    /roleMiddleware\(\["ADMIN", "MANAGER", "OPERATOR"\]\)/
  );
  assert.match(globalRoutes, /router\.get\(\s*"\/"/);
  assert.match(globalRoutes, /router\.get\(\s*"\/:id\/job"/);
  assert.match(
    globalRoutes,
    /workflowProcessingJobController\.getByExecutionId/
  );
  assert.match(globalRoutes, /router\.get\(\s*"\/:id"/);
  assert.match(globalRoutes, /roleMiddleware\(\["ADMIN", "MANAGER"\]\)/);
  assert.match(
    workflowsRoutes,
    /router\.use\("\/:workflowId\/executions", workflowExecutionsRoutes\);/
  );
  assert.match(
    routesIndex,
    /router\.use\("\/workflow-executions", workflowExecutionsGlobalRoutes\);/
  );

  const nestedRouteIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/executions", workflowExecutionsRoutes);'
  );
  const getByIdRouteIndex = workflowsRoutes.indexOf('router.get(\n  "/:id"');

  assert.notStrictEqual(nestedRouteIndex, -1);
  assert.notStrictEqual(getByIdRouteIndex, -1);
  assert.ok(nestedRouteIndex < getByIdRouteIndex);

  const jobRouteIndex = globalRoutes.indexOf('router.get(\n  "/:id/job"');
  const globalGetByIdRouteIndex = globalRoutes.indexOf('router.get(\n  "/:id"');

  assert.notStrictEqual(jobRouteIndex, -1);
  assert.notStrictEqual(globalGetByIdRouteIndex, -1);
  assert.ok(jobRouteIndex < globalGetByIdRouteIndex);
});
