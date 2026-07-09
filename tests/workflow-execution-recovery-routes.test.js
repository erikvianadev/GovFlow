const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../src/utils/jwt");

const appPath = path.join(__dirname, "../src/app.js");
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");
const workflowProcessorRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessor.routes.js"
);
const workflowExecutionsGlobalRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.global.routes.js"
);
const workflowExecutionRecoveryControllerPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowExecutionRecovery.controller.js"
);
const workflowExecutionRecoveryServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowExecutionRecovery.service.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
);
const adminQueueServicePath = path.join(
  __dirname,
  "../src/modules/admin/adminQueue.service.js"
);
const authMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/auth.middleware.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../src/modules/users/users.repository.js"
);

const adminUser = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Admin User",
  email: "admin@govflow.test",
  role: "ADMIN",
  department_id: null,
  is_active: true,
};
const managerUser = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Manager User",
  email: "manager@govflow.test",
  role: "MANAGER",
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

async function withTestServer(callback) {
  const recoveryCalls = [];
  const usersById = new Map(
    [adminUser, managerUser].map((user) => [user.id, user])
  );

  [
    appPath,
    routesIndexPath,
    workflowProcessorRoutesPath,
    workflowExecutionsGlobalRoutesPath,
    workflowExecutionRecoveryControllerPath,
    workflowExecutionRecoveryServicePath,
    workflowProcessingJobServicePath,
    adminQueueServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(workflowProcessorRoutesPath, require("express").Router());
  mockModule(workflowExecutionRecoveryServicePath, {
    recoverStaleRunningExecutions: async (payload) => {
      recoveryCalls.push(payload);
      return {
        timeoutMinutes: payload.timeoutMinutes,
        scannedCount: 1,
        recoveredCount: 1,
        recoveredExecutions: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            status: "FAILED",
            failedRunningStepsCount: 1,
            recoveryReason: "Execution timed out while running",
          },
        ],
      };
    },
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
    await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      recoveryCalls,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("POST /workflow-executions/recovery/stale-running requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/recovery/stale-running`,
      { method: "POST" }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.message, "Authentication token is required");
  });
});

test("POST /workflow-executions/recovery/stale-running blocks MANAGER users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/recovery/stale-running`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken(managerUser)}`,
        },
      }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 403);
    assert.strictEqual(
      body.message,
      "You do not have permission to access this resource"
    );
  });
});

test("POST /workflow-executions/recovery/stale-running accepts ADMIN users", async () => {
  await withTestServer(async ({ baseUrl, recoveryCalls }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/recovery/stale-running`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeoutMinutes: 45,
          limit: 5,
        }),
      }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      body.message,
      "Stale running workflow executions recovered successfully"
    );
    assert.strictEqual(body.data.recoveredCount, 1);
    assert.deepStrictEqual(recoveryCalls, [
      {
        recoveredBy: adminUser.id,
        timeoutMinutes: 45,
        limit: 5,
      },
    ]);
  });
});
