const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowsRoutesPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.routes.js"
);
const workflowsControllerPath = path.join(
  __dirname,
  "../src/modules/workflows/workflows.controller.js"
);

test("PATCH /:id is authenticated, role-gated to ADMIN/MANAGER, and wired to the update controller", () => {
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");

  assert.match(workflowsRoutes, /router\.patch\(\s*"\/:id"/);

  const patchRouteIndex = workflowsRoutes.indexOf('router.patch(\n  "/:id"');
  assert.notStrictEqual(patchRouteIndex, -1);

  const patchRouteBlock = workflowsRoutes.slice(
    patchRouteIndex,
    workflowsRoutes.indexOf(");", patchRouteIndex)
  );

  // Middleware order: authMiddleware -> roleMiddleware -> controller.
  const authIndex = patchRouteBlock.indexOf("authMiddleware");
  const roleIndex = patchRouteBlock.indexOf(
    'roleMiddleware(["ADMIN", "MANAGER"])'
  );
  const controllerIndex = patchRouteBlock.indexOf(
    "workflowsController.update"
  );

  assert.notStrictEqual(authIndex, -1);
  assert.notStrictEqual(roleIndex, -1);
  assert.notStrictEqual(controllerIndex, -1);
  assert.ok(authIndex < roleIndex);
  assert.ok(roleIndex < controllerIndex);

  // Scope is limited to ADMIN/MANAGER only, matching the other workflows routes.
  assert.doesNotMatch(patchRouteBlock, /OPERATOR/);
});

test("PATCH /:id is declared after the nested steps/executions routers, like GET /:id", () => {
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");

  const nestedStepsIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/steps", workflowStepsRoutes);'
  );
  const nestedExecutionsIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/executions", workflowExecutionsRoutes);'
  );
  const patchRouteIndex = workflowsRoutes.indexOf('router.patch(\n  "/:id"');

  assert.notStrictEqual(nestedStepsIndex, -1);
  assert.notStrictEqual(nestedExecutionsIndex, -1);
  assert.notStrictEqual(patchRouteIndex, -1);
  assert.ok(nestedStepsIndex < patchRouteIndex);
  assert.ok(nestedExecutionsIndex < patchRouteIndex);
});

test("workflows controller exposes an update handler wired to workflowsService.updateWorkflow", () => {
  const workflowsController = fs.readFileSync(workflowsControllerPath, "utf8");

  assert.match(workflowsController, /const update = asyncHandler/);
  assert.match(workflowsController, /workflowsService\.updateWorkflow/);
  assert.match(workflowsController, /req\.body\.is_active/);
  // `update` is exported from module.exports (position-agnostic: the
  // duplicate handler added below is exported after it).
  assert.match(workflowsController, /module\.exports = \{[^}]*\bupdate,?[^}]*\};/);
});

test("POST /:id/duplicate is authenticated, role-gated to ADMIN/MANAGER, and wired to the duplicate controller", () => {
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");

  assert.match(workflowsRoutes, /router\.post\(\s*"\/:id\/duplicate"/);

  const duplicateRouteIndex = workflowsRoutes.indexOf(
    'router.post(\n  "/:id/duplicate"'
  );
  assert.notStrictEqual(duplicateRouteIndex, -1);

  const duplicateRouteBlock = workflowsRoutes.slice(
    duplicateRouteIndex,
    workflowsRoutes.indexOf(");", duplicateRouteIndex)
  );

  // Middleware order: authMiddleware -> roleMiddleware -> controller.
  const authIndex = duplicateRouteBlock.indexOf("authMiddleware");
  const roleIndex = duplicateRouteBlock.indexOf(
    'roleMiddleware(["ADMIN", "MANAGER"])'
  );
  const controllerIndex = duplicateRouteBlock.indexOf(
    "workflowsController.duplicate"
  );

  assert.notStrictEqual(authIndex, -1);
  assert.notStrictEqual(roleIndex, -1);
  assert.notStrictEqual(controllerIndex, -1);
  assert.ok(authIndex < roleIndex);
  assert.ok(roleIndex < controllerIndex);

  // Scope is limited to ADMIN/MANAGER only, matching the other workflows routes.
  assert.doesNotMatch(duplicateRouteBlock, /OPERATOR/);
});

test("POST /:id/duplicate is declared after the nested steps/executions routers, like GET /:id and PATCH /:id", () => {
  const workflowsRoutes = fs.readFileSync(workflowsRoutesPath, "utf8");

  const nestedStepsIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/steps", workflowStepsRoutes);'
  );
  const nestedExecutionsIndex = workflowsRoutes.indexOf(
    'router.use("/:workflowId/executions", workflowExecutionsRoutes);'
  );
  const duplicateRouteIndex = workflowsRoutes.indexOf(
    'router.post(\n  "/:id/duplicate"'
  );

  assert.notStrictEqual(nestedStepsIndex, -1);
  assert.notStrictEqual(nestedExecutionsIndex, -1);
  assert.notStrictEqual(duplicateRouteIndex, -1);
  assert.ok(nestedStepsIndex < duplicateRouteIndex);
  assert.ok(nestedExecutionsIndex < duplicateRouteIndex);
});

test("workflows controller exposes a duplicate handler wired to workflowsService.duplicateWorkflow", () => {
  const workflowsController = fs.readFileSync(workflowsControllerPath, "utf8");

  assert.match(workflowsController, /const duplicate = asyncHandler/);
  assert.match(workflowsController, /workflowsService\.duplicateWorkflow/);
  // duplicate must tolerate a fully empty request body (no Content-Length at
  // all), unlike create/update which assume req.body is always an object.
  assert.match(workflowsController, /req\.body \|\| \{\}/);
  assert.match(workflowsController, /body\.name/);
  assert.match(workflowsController, /\bduplicate,?\s*\n?\};/);
});
