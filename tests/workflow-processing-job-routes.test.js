const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../src/utils/jwt");
const AppError = require("../src/errors/AppError");

const appPath = path.join(__dirname, "../src/app.js");
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");
const workflowExecutionsGlobalRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutions.global.routes.js"
);
const workflowProcessingJobControllerPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.controller.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
);
const workflowProcessorRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessor.routes.js"
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

async function withTestServer(callback, { serviceImpl } = {}) {
  const statusCalls = [];
  const usersById = new Map(
    [adminUser, managerUser, operatorUser].map((user) => [user.id, user])
  );

  [
    appPath,
    routesIndexPath,
    workflowExecutionsGlobalRoutesPath,
    workflowProcessingJobControllerPath,
    workflowProcessingJobServicePath,
    workflowProcessorRoutesPath,
    workflowProcessingQueueServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(workflowProcessingQueueServicePath, {
    enqueueWorkflowExecutionProcessing: async () => ({}),
  });
  mockModule(workflowProcessingJobServicePath, {
    getWorkflowExecutionProcessingJobStatus: async (id) => {
      statusCalls.push(id);

      if (serviceImpl) {
        return serviceImpl(id);
      }

      return {
        executionId: id,
        jobId: `workflow-execution-${id}`,
        queueName: "workflow-processing",
        state: "not_found",
        attemptsMade: 0,
        attemptsStarted: 0,
        maxAttempts: null,
        failedReason: null,
        processedOn: null,
        finishedOn: null,
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
      statusCalls,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("GET /workflow-executions/:id/job requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/job`
    );
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.message, "Authentication token is required");
  });
});

test("GET /workflow-executions/:id/job blocks OPERATOR users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/job`,
      {
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

test("GET /workflow-executions/:id/job returns 400 for invalid UUIDs", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/workflow-executions/not-a-uuid/job`,
        {
          headers: {
            Authorization: `Bearer ${signAccessToken(adminUser)}`,
          },
        }
      );
      const body = await response.json();

      assert.strictEqual(response.status, 400);
      assert.strictEqual(body.message, "Validation failed");
    },
    {
      serviceImpl: async () => {
        throw new AppError("Validation failed", 400, [
          {
            field: "id",
            message: "Id must be a valid UUID",
          },
        ]);
      },
    }
  );
});

test("GET /workflow-executions/:id/job returns 404 for missing executions", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/workflow-executions/${executionId}/job`,
        {
          headers: {
            Authorization: `Bearer ${signAccessToken(adminUser)}`,
          },
        }
      );
      const body = await response.json();

      assert.strictEqual(response.status, 404);
      assert.strictEqual(body.message, "Workflow execution not found");
    },
    {
      serviceImpl: async () => {
        throw new AppError("Workflow execution not found", 404);
      },
    }
  );
});

test("GET /workflow-executions/:id/job returns not_found when no job exists", async () => {
  await withTestServer(async ({ baseUrl, statusCalls }) => {
    const response = await fetch(
      `${baseUrl}/workflow-executions/${executionId}/job`,
      {
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
        },
      }
    );
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      body.message,
      "Workflow execution job status retrieved successfully"
    );
    assert.deepStrictEqual(statusCalls, [executionId]);
    assert.deepStrictEqual(body.data, {
      executionId,
      jobId: `workflow-execution-${executionId}`,
      queueName: "workflow-processing",
      state: "not_found",
      attemptsMade: 0,
      attemptsStarted: 0,
      maxAttempts: null,
      failedReason: null,
      processedOn: null,
      finishedOn: null,
    });
  });
});

test("GET /workflow-executions/:id/job returns waiting job status for MANAGER users", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/workflow-executions/${executionId}/job`,
        {
          headers: {
            Authorization: `Bearer ${signAccessToken(managerUser)}`,
          },
        }
      );
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.data.state, "waiting");
      assert.strictEqual(body.data.attemptsMade, 0);
      assert.strictEqual(body.data.attemptsStarted, 0);
      assert.strictEqual(body.data.maxAttempts, 3);
    },
    {
      serviceImpl: async (id) => ({
        executionId: id,
        jobId: `workflow-execution-${id}`,
        queueName: "workflow-processing",
        state: "waiting",
        attemptsMade: 0,
        attemptsStarted: 0,
        maxAttempts: 3,
        failedReason: null,
        processedOn: null,
        finishedOn: null,
      }),
    }
  );
});

test("GET /workflow-executions/:id/job returns completed job status", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/workflow-executions/${executionId}/job`,
        {
          headers: {
            Authorization: `Bearer ${signAccessToken(adminUser)}`,
          },
        }
      );
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.data.state, "completed");
      assert.strictEqual(body.data.maxAttempts, 3);
      assert.strictEqual(body.data.finishedOn, "2026-06-14T00:00:03.000Z");
    },
    {
      serviceImpl: async (id) => ({
        executionId: id,
        jobId: `workflow-execution-${id}`,
        queueName: "workflow-processing",
        state: "completed",
        attemptsMade: 1,
        attemptsStarted: 1,
        maxAttempts: 3,
        failedReason: null,
        processedOn: "2026-06-14T00:00:00.000Z",
        finishedOn: "2026-06-14T00:00:03.000Z",
      }),
    }
  );
});

test("GET /workflow-executions/:id/job returns failed job status", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/workflow-executions/${executionId}/job`,
        {
          headers: {
            Authorization: `Bearer ${signAccessToken(adminUser)}`,
          },
        }
      );
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.data.state, "failed");
      assert.strictEqual(body.data.attemptsStarted, 1);
      assert.strictEqual(body.data.maxAttempts, 3);
      assert.strictEqual(body.data.failedReason, "processor failed");
    },
    {
      serviceImpl: async (id) => ({
        executionId: id,
        jobId: `workflow-execution-${id}`,
        queueName: "workflow-processing",
        state: "failed",
        attemptsMade: 1,
        attemptsStarted: 1,
        maxAttempts: 3,
        failedReason: "processor failed",
        processedOn: "2026-06-14T00:00:00.000Z",
        finishedOn: "2026-06-14T00:00:03.000Z",
      }),
    }
  );
});
