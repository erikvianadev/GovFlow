const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../src/utils/jwt");

const healthRoutesPath = path.join(
  __dirname,
  "../src/modules/health/health.routes.js"
);
const healthControllerPath = path.join(
  __dirname,
  "../src/modules/health/health.controller.js"
);
const healthServicePath = path.join(
  __dirname,
  "../src/modules/health/health.service.js"
);
const authMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/auth.middleware.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../src/modules/users/users.repository.js"
);
const auditLogsServicePath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.service.js"
);
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");
const errorMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/error.middleware.js"
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

async function withTestServer(callback, { deepStatus } = {}) {
  const auditCalls = [];
  const usersById = new Map(
    [adminUser, managerUser, operatorUser].map((user) => [user.id, user])
  );

  [
    healthRoutesPath,
    healthControllerPath,
    healthServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
    auditLogsServicePath,
    safeAuditLogPath,
    errorMiddlewarePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(auditLogsServicePath, {
    register: async (payload) => {
      auditCalls.push(payload);
    },
  });
  mockModule(healthServicePath, {
    getStatus: async () => ({ status: "ok" }),
    getDeepStatus: async () =>
      deepStatus || {
        status: "ok",
        service: "GovFlow API",
        timestamp: "2026-06-19T00:00:00.000Z",
        services: {
          database: { status: "ok" },
          redis: { status: "ok" },
        },
      },
  });

  const app = express();

  app.use(express.json());
  app.use("/health", require(healthRoutesPath));
  app.use(require(errorMiddlewarePath));

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      auditCalls,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("GET /health is public and returns 200", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.strictEqual(response.status, 200);
  });
});

test("GET /health returns exactly data: { status }", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, "Health status retrieved successfully");
    assert.deepStrictEqual(body.data, { status: "ok" });
    assert.deepStrictEqual(Object.keys(body.data), ["status"]);
  });
});

test("GET /health does not leak services, timestamp, service or error", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.strictEqual(body.data.services, undefined);
    assert.strictEqual(body.data.timestamp, undefined);
    assert.strictEqual(body.data.service, undefined);
    assert.strictEqual(body.data.error, undefined);
  });
});

test("GET /health does not register an audit log", async () => {
  await withTestServer(async ({ baseUrl, auditCalls }) => {
    await fetch(`${baseUrl}/health`);

    assert.deepStrictEqual(auditCalls, []);
  });
});

test("GET /health/deep without a token returns 401", async () => {
  await withTestServer(async ({ baseUrl, auditCalls }) => {
    const response = await fetch(`${baseUrl}/health/deep`);
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.message, "Authentication token is required");
    assert.deepStrictEqual(auditCalls, []);
  });
});

test("GET /health/deep blocks MANAGER users with 403", async () => {
  await withTestServer(async ({ baseUrl, auditCalls }) => {
    const response = await fetch(`${baseUrl}/health/deep`, {
      headers: { Authorization: `Bearer ${signAccessToken(managerUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 403);
    assert.strictEqual(
      body.message,
      "You do not have permission to access this resource"
    );
    assert.deepStrictEqual(auditCalls, []);
  });
});

test("GET /health/deep blocks OPERATOR users with 403", async () => {
  await withTestServer(async ({ baseUrl, auditCalls }) => {
    const response = await fetch(`${baseUrl}/health/deep`, {
      headers: { Authorization: `Bearer ${signAccessToken(operatorUser)}` },
    });

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(auditCalls, []);
  });
});

test("GET /health/deep returns detailed status with status-only dependencies for ADMIN", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health/deep`, {
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(
      body.message,
      "Deep health status retrieved successfully"
    );
    assert.strictEqual(body.data.status, "ok");
    assert.strictEqual(body.data.service, "GovFlow API");
    assert.strictEqual(typeof body.data.timestamp, "string");
    assert.deepStrictEqual(body.data.services.database, { status: "ok" });
    assert.deepStrictEqual(body.data.services.redis, { status: "ok" });
  });
});

test("GET /health/deep never exposes a driver error message", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/health/deep`, {
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.data.status, "degraded");
      assert.deepStrictEqual(body.data.services.redis, { status: "error" });
      assert.strictEqual(body.data.services.redis.error, undefined);
    },
    {
      deepStatus: {
        status: "degraded",
        service: "GovFlow API",
        timestamp: "2026-06-19T00:00:00.000Z",
        services: {
          database: { status: "ok" },
          redis: { status: "error" },
        },
      },
    }
  );
});

test("GET /health/deep registers an audit log with the admin actor id", async () => {
  await withTestServer(async ({ baseUrl, auditCalls }) => {
    const response = await fetch(`${baseUrl}/health/deep`, {
      headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].action, "HEALTH_CHECK_DEEP_EXECUTED");
    assert.strictEqual(auditCalls[0].actorId, adminUser.id);
    assert.deepStrictEqual(auditCalls[0].metadata, {
      status: "ok",
      databaseStatus: "ok",
      redisStatus: "ok",
    });
  });
});

test("GET /health/deep degraded status produces audit metadata without driver details", async () => {
  await withTestServer(
    async ({ baseUrl, auditCalls }) => {
      await fetch(`${baseUrl}/health/deep`, {
        headers: { Authorization: `Bearer ${signAccessToken(adminUser)}` },
      });

      assert.strictEqual(auditCalls.length, 1);
      assert.deepStrictEqual(auditCalls[0].metadata, {
        status: "degraded",
        databaseStatus: "ok",
        redisStatus: "error",
      });
    },
    {
      deepStatus: {
        status: "degraded",
        service: "GovFlow API",
        timestamp: "2026-06-19T00:00:00.000Z",
        services: {
          database: { status: "ok" },
          redis: { status: "error" },
        },
      },
    }
  );
});
