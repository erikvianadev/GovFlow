const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { signAccessToken } = require("../../src/utils/jwt");

const jiraRoutesPath = path.join(__dirname, "../../src/modules/jira/jira.routes.js");
const jiraControllerPath = path.join(
  __dirname,
  "../../src/modules/jira/jira.controller.js"
);
const jiraServicePath = path.join(__dirname, "../../src/modules/jira/jira.service.js");
const authMiddlewarePath = path.join(
  __dirname,
  "../../src/middlewares/auth.middleware.js"
);
const usersRepositoryPath = path.join(
  __dirname,
  "../../src/modules/users/users.repository.js"
);
const errorMiddlewarePath = path.join(
  __dirname,
  "../../src/middlewares/error.middleware.js"
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
  const serviceCalls = [];
  const usersById = new Map([adminUser, managerUser].map((user) => [user.id, user]));

  [
    jiraRoutesPath,
    jiraControllerPath,
    jiraServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
    errorMiddlewarePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });
  mockModule(jiraServicePath, {
    testConnection: async () => {
      serviceCalls.push("testConnection");

      return {
        connected: true,
        accountId: "account-123",
        displayName: "Admin User",
        emailAddress: "admin@govflow.test",
      };
    },
  });

  const app = express();

  app.use(express.json());
  app.use("/jira", require(jiraRoutesPath));
  app.use(require(errorMiddlewarePath));

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({
      baseUrl: `http://127.0.0.1:${port}`,
      serviceCalls,
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("GET /jira/test-connection requires authentication", async () => {
  await withTestServer(async ({ baseUrl, serviceCalls }) => {
    const response = await fetch(`${baseUrl}/jira/test-connection`);
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.message, "Authentication token is required");
    assert.deepStrictEqual(serviceCalls, []);
  });
});

test("GET /jira/test-connection blocks non-admin users", async () => {
  await withTestServer(async ({ baseUrl, serviceCalls }) => {
    const response = await fetch(`${baseUrl}/jira/test-connection`, {
      headers: {
        Authorization: `Bearer ${signAccessToken(managerUser)}`,
      },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 403);
    assert.strictEqual(
      body.message,
      "You do not have permission to access this resource"
    );
    assert.deepStrictEqual(serviceCalls, []);
  });
});

test("GET /jira/test-connection returns successful Jira connection for admin", async () => {
  await withTestServer(async ({ baseUrl, serviceCalls }) => {
    const response = await fetch(`${baseUrl}/jira/test-connection`, {
      headers: {
        Authorization: `Bearer ${signAccessToken(adminUser)}`,
      },
    });
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, "Jira connection successful");
    assert.deepStrictEqual(serviceCalls, ["testConnection"]);
    assert.deepStrictEqual(body.data, {
      connected: true,
      accountId: "account-123",
      displayName: "Admin User",
      emailAddress: "admin@govflow.test",
    });
  });
});
