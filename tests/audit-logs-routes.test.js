const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../src/utils/jwt");

const appPath = path.join(__dirname, "../src/app.js");
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");
const auditLogsRoutesPath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.routes.js"
);
const auditLogsControllerPath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.controller.js"
);
const auditLogsServicePath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.service.js"
);
const auditLogsRepositoryPath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.repository.js"
);
const authMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/auth.middleware.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../src/modules/users/users.repository.js"
);
const workflowProcessingQueueServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingQueue.service.js"
);
const workflowProcessingJobServicePath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessingJob.service.js"
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
const spoofedActorId = "99999999-9999-4999-8999-999999999999";

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
  const creates = [];
  const usersById = new Map(
    [adminUser, managerUser].map((user) => [user.id, user])
  );

  [
    appPath,
    routesIndexPath,
    auditLogsRoutesPath,
    auditLogsControllerPath,
    auditLogsServicePath,
    auditLogsRepositoryPath,
    authMiddlewarePath,
    usersRepositoryPath,
    workflowProcessingQueueServicePath,
    workflowProcessingJobServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(auditLogsRepositoryPath, {
    create: async (payload) => {
      creates.push(payload);
      return { id: "audit-1", ...payload, created_at: new Date().toISOString() };
    },
  });
  mockModule(workflowProcessingQueueServicePath, {
    enqueueWorkflowExecutionProcessing: async () => ({}),
  });
  mockModule(workflowProcessingJobServicePath, {
    getWorkflowExecutionProcessingJobStatus: async () => ({}),
  });

  const app = require(appPath);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({ baseUrl: `http://127.0.0.1:${port}`, creates });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("POST /audit-logs requires authentication", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/audit-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MANUAL_NOTE", entity: "user" }),
    });

    assert.strictEqual(response.status, 401);
  });
});

test("POST /audit-logs blocks non-ADMIN users", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signAccessToken(managerUser)}`,
      },
      body: JSON.stringify({ action: "MANUAL_NOTE", entity: "user" }),
    });

    assert.strictEqual(response.status, 403);
  });
});

test("POST /audit-logs uses the authenticated user as actor and ignores body actorId", async () => {
  await withTestServer(async ({ baseUrl, creates }) => {
    const response = await fetch(`${baseUrl}/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signAccessToken(adminUser)}`,
      },
      body: JSON.stringify({
        action: "MANUAL_NOTE",
        entity: "user",
        entityId: "user-1",
        actorId: spoofedActorId,
        metadata: { note: "reviewed" },
      }),
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(creates.length, 1);
    assert.strictEqual(creates[0].actorId, adminUser.id);
    assert.notStrictEqual(creates[0].actorId, spoofedActorId);
    assert.strictEqual(creates[0].action, "MANUAL_NOTE");
    assert.strictEqual(creates[0].metadata.manual, true);
    assert.strictEqual(creates[0].metadata.note, "reviewed");
  });
});

test("POST /audit-logs rejects actions outside the manual allowlist", async () => {
  await withTestServer(async ({ baseUrl, creates }) => {
    const response = await fetch(`${baseUrl}/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signAccessToken(adminUser)}`,
      },
      body: JSON.stringify({ action: "LOGIN_SUCCESS", entity: "auth" }),
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(creates.length, 0);
  });
});
