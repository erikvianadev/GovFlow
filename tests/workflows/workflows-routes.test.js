// Set BEFORE any module that reads it (src/config/env.js) is required, so the
// mutating rate limiter below is cheap and deterministic to exercise. node
// --test runs each test file in its own process, so this assignment doesn't
// leak into other suites (same convention as tests/infra/rate-limit-middleware.test.js).
process.env.MUTATING_RATE_LIMIT_MAX = "2";

const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../../src/utils/jwt");

const workflowsRoutesPath = path.join(
  __dirname,
  "../../src/modules/workflows/workflows.routes.js"
);
const workflowsControllerPath = path.join(
  __dirname,
  "../../src/modules/workflows/workflows.controller.js"
);
const appPath = path.join(__dirname, "../../src/app.js");
const routesIndexPath = path.join(__dirname, "../../src/routes/index.js");
const workflowsServicePath = path.join(
  __dirname,
  "../../src/modules/workflows/workflows.service.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../../src/modules/users/users.repository.js"
);
const workflowProcessorRoutesPath = path.join(
  __dirname,
  "../../src/modules/workflow-processing/workflowProcessor.routes.js"
);
const workflowProcessingQueueServicePath = path.join(
  __dirname,
  "../../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../../src/modules/workflow-processing/workflowProcessingJob.service.js"
);
const adminQueueServicePath = path.join(
  __dirname,
  "../../src/modules/admin/adminQueue.service.js"
);

const adminUser = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Admin User",
  email: "admin-ratelimit@govflow.test",
  role: "ADMIN",
  department_id: null,
  is_active: true,
};

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

// Boots the real app with the workflows.service and users.repository layers
// mocked out (no DB/Redis needed) so POST /workflows can be hit repeatedly
// through the REAL middleware chain (authMiddleware -> roleMiddleware ->
// mutatingRateLimiter -> controller) to observe actual rate-limit behavior.
async function withWorkflowsTestServer(callback) {
  [
    appPath,
    routesIndexPath,
    workflowsRoutesPath,
    workflowsControllerPath,
    workflowsServicePath,
    usersRepositoryPath,
    workflowProcessorRoutesPath,
    workflowProcessingQueueServicePath,
    workflowProcessingJobServicePath,
    adminQueueServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => (id === adminUser.id ? adminUser : undefined),
  });
  mockModule(workflowsServicePath, {
    listWorkflows: async () => ({ items: [], pagination: {} }),
    getWorkflowById: async () => ({}),
    createWorkflow: async () => ({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Rate limit probe",
    }),
    updateWorkflow: async () => ({}),
    duplicateWorkflow: async () => ({}),
  });
  // The workflow-processing routes/queues open a real Redis connection at
  // require time; stub them out since they are unrelated to this route.
  mockModule(workflowProcessorRoutesPath, require("express").Router());
  mockModule(workflowProcessingQueueServicePath, {
    enqueueWorkflowExecutionProcessing: async () => ({}),
  });
  mockModule(workflowProcessingJobServicePath, {
    getWorkflowExecutionProcessingJobStatus: async () => ({}),
  });
  mockModule(adminQueueServicePath, {
    getQueueStats: async () => ({}),
    listJobs: async () => ({}),
    retryJob: async () => ({}),
    deleteJob: async () => ({}),
  });

  const app = require(appPath);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({ baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

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

test("POST /workflows enforces the mutating rate limit for authenticated ADMIN requests (429 after the limit)", async () => {
  await withWorkflowsTestServer(async ({ baseUrl }) => {
    const token = signAccessToken(adminUser);
    const statuses = [];

    // MUTATING_RATE_LIMIT_MAX is set to 2 at the top of this file, so with 3
    // requests the first two must pass and the third must be rate limited.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${baseUrl}/workflows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `Workflow ${attempt}` }),
      });

      statuses.push(response.status);
    }

    assert.deepStrictEqual(
      statuses.slice(0, 2),
      [201, 201],
      `expected first two authenticated requests to pass, got ${statuses}`
    );
    assert.strictEqual(
      statuses[2],
      429,
      `expected the third authenticated request to be rate limited, got ${statuses}`
    );
  });
});

test("POST /workflows rejects unauthenticated requests with 401, never 429 (authMiddleware runs before mutatingRateLimiter)", async () => {
  await withWorkflowsTestServer(async ({ baseUrl }) => {
    const statuses = [];

    // Same 3-request budget as the authenticated case above. If the rate
    // limiter ran before authMiddleware, the 3rd unauthenticated request
    // would return 429 instead of 401, letting an unauthenticated attacker
    // exhaust the per-IP limit and lock out legitimate ADMIN/MANAGER users.
    // This is the regression test for the Sprint 6 security hotfix.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${baseUrl}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Workflow ${attempt}` }),
      });

      statuses.push(response.status);
    }

    assert.ok(
      statuses.every((status) => status === 401),
      `expected all 3 unauthenticated attempts to be 401, got ${statuses}`
    );
  });
});
