const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "../../src/modules/auth/auth.service.js");
const usersRepositoryPath = path.join(
  __dirname,
  "../../src/modules/users/users.repository.js"
);
const passwordPath = path.join(__dirname, "../../src/utils/password.js");
const jwtPath = path.join(__dirname, "../../src/utils/jwt.js");
const safeAuditLogPath = path.join(__dirname, "../../src/utils/safeAuditLog.js");

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

function loadAuthService({ user, passwordMatches = false } = {}) {
  const auditCalls = [];
  const compareCalls = [];

  [servicePath, usersRepositoryPath, passwordPath, jwtPath, safeAuditLogPath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(usersRepositoryPath, {
    findByEmail: async () => user,
  });
  mockModule(passwordPath, {
    DUMMY_PASSWORD_HASH: DUMMY_HASH,
    comparePassword: async (password, hash) => {
      compareCalls.push({ password, hash });
      return passwordMatches;
    },
    hashPassword: async () => "unused",
  });
  mockModule(jwtPath, {
    signAccessToken: () => "signed.access.token",
  });
  mockModule(safeAuditLogPath, {
    safeRegisterAuditLog: async (payload) => {
      auditCalls.push(payload);
    },
  });

  return {
    authService: require(servicePath),
    auditCalls,
    compareCalls,
  };
}

test("login with a non-existing email returns a uniform 401 and runs a dummy compare", async () => {
  const { authService, auditCalls, compareCalls } = loadAuthService({
    user: undefined,
  });

  await assert.rejects(
    authService.login({ email: "ghost@govflow.test", password: "whatever1" }),
    (error) => {
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(error.message, "Invalid email or password");
      return true;
    }
  );

  // A bcrypt comparison must still run against the dummy hash to level timing.
  assert.strictEqual(compareCalls.length, 1);
  assert.strictEqual(compareCalls[0].hash, DUMMY_HASH);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].metadata.reason, "USER_NOT_FOUND");
});

test("login with a wrong password returns a uniform 401", async () => {
  const { authService, auditCalls, compareCalls } = loadAuthService({
    user: activeUser,
    passwordMatches: false,
  });

  await assert.rejects(
    authService.login({ email: activeUser.email, password: "wrongpass1" }),
    (error) => {
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(error.message, "Invalid email or password");
      return true;
    }
  );

  assert.strictEqual(compareCalls.length, 1);
  assert.strictEqual(compareCalls[0].hash, activeUser.password_hash);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].metadata.reason, "INVALID_PASSWORD");
});

test("login with an inactive user returns a uniform 401 and runs a real compare", async () => {
  const { authService, auditCalls, compareCalls } = loadAuthService({
    user: inactiveUser,
    passwordMatches: true,
  });

  await assert.rejects(
    authService.login({ email: inactiveUser.email, password: "correctpass1" }),
    (error) => {
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(error.message, "Invalid email or password");
      return true;
    }
  );

  // The compare must run even for inactive users so timing stays uniform.
  assert.strictEqual(compareCalls.length, 1);
  assert.strictEqual(compareCalls[0].hash, inactiveUser.password_hash);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].metadata.reason, "USER_INACTIVE");
});

test("the public message and status are identical across all credential failures", async () => {
  const cases = [
    { user: undefined, passwordMatches: false },
    { user: activeUser, passwordMatches: false },
    { user: inactiveUser, passwordMatches: true },
  ];

  const results = [];

  for (const scenario of cases) {
    const { authService } = loadAuthService(scenario);

    try {
      await authService.login({ email: "x@govflow.test", password: "whatever1" });
      assert.fail("login should have thrown");
    } catch (error) {
      results.push({ status: error.statusCode, message: error.message });
    }
  }

  assert.deepStrictEqual(results, [
    { status: 401, message: "Invalid email or password" },
    { status: 401, message: "Invalid email or password" },
    { status: 401, message: "Invalid email or password" },
  ]);
});

test("login with valid active credentials returns the user and a token", async () => {
  const { authService, auditCalls } = loadAuthService({
    user: activeUser,
    passwordMatches: true,
  });

  const result = await authService.login({
    email: activeUser.email,
    password: "correctpass1",
  });

  assert.strictEqual(result.accessToken, "signed.access.token");
  assert.strictEqual(result.user.id, activeUser.id);
  assert.strictEqual(result.user.email, activeUser.email);
  assert.strictEqual(result.user.role, activeUser.role);
  // The serialized user must never leak the password hash.
  assert.strictEqual(result.user.password_hash, undefined);
  assert.strictEqual(auditCalls.length, 1);
  assert.strictEqual(auditCalls[0].action, "LOGIN_SUCCESS");
});

test("login rejects an invalid payload with a 400 before touching the repository", async () => {
  const { authService, compareCalls } = loadAuthService({ user: activeUser });

  await assert.rejects(
    authService.login({ email: "not-an-email", password: "" }),
    (error) => {
      assert.strictEqual(error.statusCode, 400);
      return true;
    }
  );

  assert.strictEqual(compareCalls.length, 0);
});
