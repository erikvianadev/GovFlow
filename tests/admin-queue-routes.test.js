const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../src/utils/jwt");
const AppError = require("../src/errors/AppError");

const appPath = path.join(__dirname, "../src/app.js");
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");
const adminQueueRoutesPath = path.join(
  __dirname,
  "../src/modules/admin/adminQueue.routes.js"
);
const adminQueueControllerPath = path.join(
  __dirname,
  "../src/modules/admin/adminQueue.controller.js"
);
const adminQueueServicePath = path.join(
  __dirname,
  "../src/modules/admin/adminQueue.service.js"
);
const workflowProcessingQueueServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
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

function mockModule(modulePath, exports) {
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

async function withTestServer(callback, { serviceImpl = {} } = {}) {
  const usersById = new Map(
    [adminUser, managerUser, operatorUser].map((user) => [user.id, user])
  );

  [
    appPath,
    routesIndexPath,
    adminQueueRoutesPath,
    adminQueueControllerPath,
    adminQueueServicePath,
    workflowProcessingQueueServicePath,
    workflowProcessingJobServicePath,
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
    getWorkflowExecutionProcessingJobStatus: async () => ({}),
  });
  mockModule(adminQueueServicePath, {
    getQueueStats: async () => ({
      queueName: "workflow-processing",
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    }),
    listJobs: async () => ({
      queueName: "workflow-processing",
      state: "failed",
      page: 1,
      limit: 20,
      total: 0,
      jobs: [],
    }),
    retryJob: async () => ({
      jobId: "job-1",
      executionId: "11111111-1111-4111-8111-111111111111",
      previousState: "failed",
      newState: "waiting",
    }),
    deleteJob: async () => ({
      jobId: "job-1",
      executionId: "11111111-1111-4111-8111-111111111111",
      deletedState: "completed",
    }),
    ...serviceImpl,
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

// GET /admin/queue/stats

test("GET /admin/queue/stats requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/stats`);

    assert.strictEqual(response.status, 401);
  });
});

test("GET /admin/queue/stats blocks MANAGER users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${signAccessToken(managerUser)}` },
    });

    assert.strictEqual(response.status, 403);
  });
});

test("GET /admin/queue/stats blocks OPERATOR users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${signAccessToken(operatorUser)}` },
    });

    assert.strictEqual(response.status, 403);
  });
});

test("GET /admin/queue/stats returns 200 for ADMIN users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.data.queueName, "workflow-processing");
  });
});

// GET /admin/queue/jobs

test("GET /admin/queue/jobs requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs`);

    assert.strictEqual(response.status, 401);
  });
});

test("GET /admin/queue/jobs blocks MANAGER users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs`, {
      headers: { Authorization: `Bearer ${signAccessToken(managerUser)}` },
    });

    assert.strictEqual(response.status, 403);
  });
});

test("GET /admin/queue/jobs returns a paginated response for ADMIN users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs`, {
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.data.page, 1);
    assert.strictEqual(body.data.limit, 20);
    assert.deepStrictEqual(body.data.jobs, []);
  });
});

test("GET /admin/queue/jobs returns 400 for an invalid state", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/admin/queue/jobs?state=bogus`, {
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 400);
      assert.strictEqual(body.message, "Validation failed");
    },
    {
      serviceImpl: {
        listJobs: async () => {
          throw new AppError("Validation failed", 400, [
            { field: "state", message: "state must be one of: ..." },
          ]);
        },
      },
    }
  );
});

// POST /admin/queue/jobs/:jobId/retry

test("POST /admin/queue/jobs/:jobId/retry requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1/retry`, {
      method: "POST",
    });

    assert.strictEqual(response.status, 401);
  });
});

test("POST /admin/queue/jobs/:jobId/retry blocks MANAGER users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAccessToken(managerUser)}` },
    });

    assert.strictEqual(response.status, 403);
  });
});

test("POST /admin/queue/jobs/:jobId/retry returns 202 for ADMIN users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 202);
    assert.strictEqual(body.data.newState, "waiting");
  });
});

test("POST /admin/queue/jobs/:jobId/retry returns 404 when the service reports a missing job", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/admin/queue/jobs/missing/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 404);
      assert.strictEqual(body.message, "Job not found");
    },
    {
      serviceImpl: {
        retryJob: async () => {
          throw new AppError("Job not found", 404);
        },
      },
    }
  );
});

test("POST /admin/queue/jobs/:jobId/retry returns 409 when the job is not failed", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });

      assert.strictEqual(response.status, 409);
    },
    {
      serviceImpl: {
        retryJob: async () => {
          throw new AppError("Only failed jobs can be retried. Current state: active", 409);
        },
      },
    }
  );
});

// DELETE /admin/queue/jobs/:jobId

test("DELETE /admin/queue/jobs/:jobId requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1`, {
      method: "DELETE",
    });

    assert.strictEqual(response.status, 401);
  });
});

test("DELETE /admin/queue/jobs/:jobId blocks MANAGER users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${signAccessToken(managerUser)}` },
    });

    assert.strictEqual(response.status, 403);
  });
});

test("DELETE /admin/queue/jobs/:jobId returns 200 for ADMIN users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.data.deletedState, "completed");
  });
});

test("DELETE /admin/queue/jobs/:jobId returns 404 when the service reports a missing job", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/admin/queue/jobs/missing`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 404);
      assert.strictEqual(body.message, "Job not found");
    },
    {
      serviceImpl: {
        deleteJob: async () => {
          throw new AppError("Job not found", 404);
        },
      },
    }
  );
});

test("DELETE /admin/queue/jobs/:jobId returns 409 when the job is not in a deletable state", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/admin/queue/jobs/job-1`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });

      assert.strictEqual(response.status, 409);
    },
    {
      serviceImpl: {
        deleteJob: async () => {
          throw new AppError("Only completed or failed jobs can be deleted. Current state: active", 409);
        },
      },
    }
  );
});
