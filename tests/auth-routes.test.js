const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const authRoutesPath = path.join(
  __dirname,
  "../src/modules/auth/auth.routes.js"
);
const authControllerPath = path.join(
  __dirname,
  "../src/modules/auth/auth.controller.js"
);
const authServicePath = path.join(__dirname, "../src/modules/auth/auth.service.js");
const usersRepositoryPath = path.join(
  __dirname,
  "../src/modules/users/users.repository.js"
);
const passwordPath = path.join(__dirname, "../src/utils/password.js");
const jwtPath = path.join(__dirname, "../src/utils/jwt.js");
const safeAuditLogPath = path.join(__dirname, "../src/utils/safeAuditLog.js");
const rateLimitMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/rate-limit.middleware.js"
);
const errorMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/error.middleware.js"
);

const DUMMY_HASH = "$2b$10$dummytestonlyhashvalueforunittests0000000000000000000";

const activeUser = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Active User",
  email: "active@govflow.test",
  role: "MANAGER",
  department_id: "dept-1",
  is_active: true,
  password_hash: "$2b$10$realhashforactiveuser",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const inactiveUser = {
  ...activeUser,
  id: "22222222-2222-4222-8222-222222222222",
  email: "inactive@govflow.test",
  is_active: false,
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

async function withTestServer(callback, { usersByEmail = new Map(), passwordMatches = false } = {}) {
  const auditCalls = [];

  [
    authRoutesPath,
    authControllerPath,
    authServicePath,
    usersRepositoryPath,
    passwordPath,
    jwtPath,
    safeAuditLogPath,
    rateLimitMiddlewarePath,
    errorMiddlewarePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  mockModule(usersRepositoryPath, {
    findByEmail: async (email) => usersByEmail.get(email),
  });
  mockModule(passwordPath, {
    DUMMY_PASSWORD_HASH: DUMMY_HASH,
    comparePassword: async () => passwordMatches,
    hashPassword: async () => "unused",
  });
  mockModule(jwtPath, {
    signAccessToken: () => "signed.access.token",
    verifyAccessToken: () => ({}),
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      auditCalls.push(payload);
    },
  });
  // Keep the login route, but make the limiter a no-op so it does not interfere
  // with these credential-shape assertions (rate limiting is covered elsewhere).
  mockModule(rateLimitMiddlewarePath, {
    loginRateLimiter: (req, res, next) => next(),
  });

  const app = express();

  app.use(express.json());
  app.use("/auth", require(authRoutesPath));
  app.use(require(errorMiddlewarePath));

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback({ baseUrl: `http://127.0.0.1:${port}`, auditCalls });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("POST /auth/login with a non-existing email returns 401 with the generic message", async () => {
  await withTestServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@govflow.test", password: "whatever1" }),
    });
    const body = await response.json();

    assert.strictEqual(response.status, 401);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, "Invalid email or password");
  });
});

test("POST /auth/login with a wrong password returns 401 with the generic message", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: activeUser.email, password: "wrongpass1" }),
      });
      const body = await response.json();

      assert.strictEqual(response.status, 401);
      assert.strictEqual(body.message, "Invalid email or password");
    },
    {
      usersByEmail: new Map([[activeUser.email, activeUser]]),
      passwordMatches: false,
    }
  );
});

test("POST /auth/login with an inactive user returns 401 (not 403) with the generic message", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inactiveUser.email, password: "correctpass1" }),
      });
      const body = await response.json();

      assert.strictEqual(response.status, 401);
      assert.strictEqual(body.message, "Invalid email or password");
    },
    {
      usersByEmail: new Map([[inactiveUser.email, inactiveUser]]),
      passwordMatches: true,
    }
  );
});

test("POST /auth/login with valid active credentials returns 200 and a token", async () => {
  await withTestServer(
    async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: activeUser.email, password: "correctpass1" }),
      });
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.message, "Login successful");
      assert.strictEqual(body.data.accessToken, "signed.access.token");
      assert.strictEqual(body.data.user.email, activeUser.email);
      assert.strictEqual(body.data.user.password_hash, undefined);
    },
    {
      usersByEmail: new Map([[activeUser.email, activeUser]]),
      passwordMatches: true,
    }
  );
});
