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
const jiraClientPath = path.join(__dirname, "../../src/modules/jira/jira.client.js");
const envPath = path.join(__dirname, "../../src/config/env.js");
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

// The real (already-loaded, singleton) env module. Reused — never replaced —
// by withRealJiraServiceTestServer below: only its `jira` sub-object is
// temporarily mutated per test and restored in `finally`, so every other
// module that reads `env` (auth middleware, the Jira rate limiter, the error
// middleware) keeps working off the same real config it always did.
const env = require(envPath);

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

// Unlike withTestServer above (which mocks jira.service.js entirely, so
// testConnection's own logic never runs), this exercises the REAL
// jira.service.js so the checkJiraReadiness()-backed precondition logic in
// testConnection() is actually driven end to end. Only jira.client.js
// (when jiraClientAvailable is false) and env.jira (temporarily mutated,
// then restored) are touched.
async function withRealJiraServiceTestServer(
  { jiraClientAvailable = true, jiraEnvOverrides = {} },
  callback
) {
  const usersById = new Map([adminUser, managerUser].map((user) => [user.id, user]));
  const originalJiraEnv = { ...env.jira };

  const modulesToReset = [
    jiraRoutesPath,
    jiraControllerPath,
    jiraServicePath,
    authMiddlewarePath,
    usersRepositoryPath,
    errorMiddlewarePath,
  ];

  if (!jiraClientAvailable) {
    modulesToReset.push(jiraClientPath);
  }

  modulesToReset.forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findById: async (id) => usersById.get(id),
  });

  if (!jiraClientAvailable) {
    mockModule(jiraClientPath, null);
  }

  Object.assign(env.jira, jiraEnvOverrides);

  const app = express();

  app.use(express.json());
  app.use("/jira", require(jiraRoutesPath));
  app.use(require(errorMiddlewarePath));

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({ baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );

    Object.assign(env.jira, originalJiraEnv);

    if (!jiraClientAvailable) {
      delete require.cache[jiraClientPath];
    }
  }
}

// Contract tests for the 3 local preconditions testConnection() checks before
// ever calling Jira (client missing, JIRA_ENABLED=false, vars incomplete).
// These pin the exact status code and message the route has always returned
// for each case, so the H.3 extraction of checkJiraReadiness() out of
// testConnection()/assertJiraIntegrationReady() cannot silently change the
// GET /jira/test-connection HTTP contract.
test("GET /jira/test-connection returns 500 'Jira client not available' when the Jira client is unavailable", async () => {
  await withRealJiraServiceTestServer(
    { jiraClientAvailable: false },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/jira/test-connection`, {
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
        },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 500);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, "Jira client not available");
    }
  );
});

test("GET /jira/test-connection returns 400 'Jira integration is disabled' when JIRA_ENABLED is false", async () => {
  await withRealJiraServiceTestServer(
    { jiraEnvOverrides: { enabled: false } },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/jira/test-connection`, {
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
        },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 400);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, "Jira integration is disabled");
    }
  );
});

test("GET /jira/test-connection returns 500 'Jira integration is not configured' when Jira is enabled but vars are missing", async () => {
  await withRealJiraServiceTestServer(
    {
      jiraEnvOverrides: {
        enabled: true,
        baseUrl: undefined,
        email: undefined,
        apiToken: undefined,
      },
    },
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/jira/test-connection`, {
        headers: {
          Authorization: `Bearer ${signAccessToken(adminUser)}`,
        },
      });
      const body = await response.json();

      assert.strictEqual(response.status, 500);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.message, "Jira integration is not configured");
    }
  );
});

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
