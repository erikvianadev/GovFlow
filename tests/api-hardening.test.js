const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const appPath = path.join(__dirname, "../src/app.js");
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");
const authRoutesPath = path.join(
  __dirname,
  "../src/modules/auth/auth.routes.js"
);
const rateLimitMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/rate-limit.middleware.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../src/modules/users/users.repository.js"
);
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");
const workflowProcessingQueueServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
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

async function withTestServer(callback, { mocks = false } = {}) {
  [
    appPath,
    routesIndexPath,
    authRoutesPath,
    rateLimitMiddlewarePath,
    workflowProcessingQueueServicePath,
    workflowProcessingJobServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  // Avoid loading the real BullMQ queue (which opens a Redis connection that
  // keeps the process alive) since the queue is not under test here.
  mockModule(workflowProcessingQueueServicePath, {
    enqueueWorkflowExecutionProcessing: async () => ({}),
  });
  mockModule(workflowProcessingJobServicePath, {
    getWorkflowExecutionProcessingJobStatus: async () => ({}),
  });

  if (mocks) {
    mockModule(usersRepositoryPath, {
      findById: async () => undefined,
      findByEmail: async () => undefined,
    });
    mockModule(safeAuditLogPath, {
      safeRegisterAuditLog: async () => {},
    });
  }

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

test("helmet sets security headers and removes x-powered-by", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/__nonexistent__`);

    assert.strictEqual(response.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(response.headers.get("x-powered-by"), null);
  });
});

test("CORS reflects allowlisted origins", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/__nonexistent__`, {
      headers: { Origin: "http://localhost:3000" },
    });

    assert.strictEqual(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:3000"
    );
  });
});

test("CORS does not reflect non-allowlisted origins", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/__nonexistent__`, {
      headers: { Origin: "http://evil.example.com" },
    });

    assert.strictEqual(
      response.headers.get("access-control-allow-origin"),
      null
    );
  });
});

test("express.json rejects bodies larger than 100kb", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const oversizedPayload = JSON.stringify({
      email: "a".repeat(150 * 1024),
      password: "irrelevant",
    });

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedPayload,
    });

    assert.strictEqual(response.status, 413);
  });
});

test("login endpoint is rate limited per IP", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const credentials = JSON.stringify({
        email: "user@govflow.test",
        password: "wrongpassword1",
      });

      const statuses = [];

      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await fetch(`${baseUrl}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: credentials,
        });

        statuses.push(response.status);
      }

      // With LOGIN_RATE_LIMIT_MAX defaulting to 10, the 11th attempt is blocked.
      assert.ok(
        statuses.slice(0, 10).every((status) => status === 401),
        `expected first 10 attempts to be 401, got ${statuses}`
      );
      assert.strictEqual(statuses[10], 429);
    },
    { mocks: true }
  );
});
