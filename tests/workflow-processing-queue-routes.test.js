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
const workflowProcessingQueueControllerPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.controller.js"
);
const workflowProcessingQueueServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.service.js"
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
const operatorUser = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Operator User",
  email: "operator@govflow.test",
  role: "OPERATOR",
  department_id: null,
  is_active: true,
};
const executionId = "11111111-1111-4111-8111-111111111111";

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
  const enqueueCalls = [];
  const usersById = new Map(
    [adminUser, managerUser, operatorUser].map((user) => [user.id, user])
  );

  [
    appPath,
    routesIndexPath,
    workflowProcessorRoutesPath,
    workflowProcessingQueueControllerPath,
    workflowProcessingQueueServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(workflowProcessingQueueServicePath, {
    enqueueWorkflowExecutionProcessing: async (payload) => {
      enqueueCalls.push(payload);

      return {
        jobId: `workflow-execution-${payload.executionId}`,
        queueName: "workflow-processing",
        executionId: payload.executionId,
        status: "QUEUED",
      };
    },
  });

  const app = require(appPath);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      enqueueCalls,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("POST /workflow-executions/:id/enqueue requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/enqueue`,
      { method: "POST" }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.message, "Authentication token is required");
  });
});

test("POST /workflow-executions/:id/enqueue blocks OPERATOR users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/enqueue`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken(operatorUser)}`,
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

test("POST /workflow-executions/:id/enqueue accepts ADMIN users", async () => {
  await withTestServer(async ({ baseUrl, enqueueCalls }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/enqueue`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
        },
      }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 202);
    assert.strictEqual(
      body.message,
      "Workflow execution processing job queued successfully"
    );
    assert.deepStrictEqual(body.data, {
      jobId: `workflow-execution-${executionId}`,
      queueName: "workflow-processing",
      executionId,
      status: "QUEUED",
    });
    assert.deepStrictEqual(enqueueCalls, [
      {
        executionId,
        requestedBy: adminUser.id,
      },
    ]);
  });
});

test("POST /workflow-executions/:id/enqueue accepts MANAGER users", async () => {
  await withTestServer(async ({ baseUrl, enqueueCalls }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/enqueue`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken(managerUser)}`,
        },
      }
    );

    assert.strictEqual(response.status, 202);
    assert.deepStrictEqual(enqueueCalls, [
      {
        executionId,
        requestedBy: managerUser.id,
      },
    ]);
  });
});
