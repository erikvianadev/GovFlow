const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "../src/modules/health/health.service.js");
const databasePath = path.join(__dirname, "../src/config/database.js");
const redisPath = path.join(__dirname, "../src/config/redis.js");
const auditLogsServicePath = path.join(
  __dirname,
  "../src/modules/audit-logs/auditLogs.service.js"
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

function loadHealthService({ databaseError, redisError, redisConnected = true } = {}) {
  const auditCalls = [];

  [servicePath, databasePath, redisPath, auditLogsServicePath].forEach(
    (modulePath) => delete require.cache[modulePath]
  );

  mockModule(databasePath, {
    checkDatabaseConnection: async () => {
      if (databaseError) {
        throw databaseError;
      }
    },
  });
  mockModule(redisPath, {
    checkRedisConnection: async () => {
      if (redisError) {
        throw redisError;
      }

      return redisConnected;
    },
  });
  mockModule(auditLogsServicePath, {
    register: async (payload) => {
      auditCalls.push(payload);
    },
  });

  return {
    healthService: require(servicePath),
    auditCalls,
  };
}

test("health status includes Redis when all dependencies are available", async () => {
  const { healthService, auditCalls } = loadHealthService();

  const result = await healthService.getStatus();

  assert.strictEqual(result.status, "ok");
  assert.deepStrictEqual(result.services.database, { status: "ok" });
  assert.deepStrictEqual(result.services.redis, { status: "ok" });
  assert.strictEqual(auditCalls.length, 1);
  assert.deepStrictEqual(auditCalls[0].metadata, {
    databaseStatus: "ok",
    redisStatus: "ok",
  });
});

test("health status degrades when Redis is unavailable", async () => {
  const { healthService, auditCalls } = loadHealthService({
    redisError: new Error("connect ECONNREFUSED"),
  });

  const result = await healthService.getStatus();

  assert.strictEqual(result.status, "degraded");
  assert.deepStrictEqual(result.services.database, { status: "ok" });
  assert.strictEqual(result.services.redis.status, "error");
  assert.strictEqual(result.services.redis.error, "connect ECONNREFUSED");
  assert.strictEqual(auditCalls.length, 1);
  assert.deepStrictEqual(auditCalls[0].metadata, {
    databaseStatus: "ok",
    redisStatus: "error",
  });
});

test("health status degrades when Redis ping is not successful", async () => {
  const { healthService } = loadHealthService({
    redisConnected: false,
  });

  const result = await healthService.getStatus();

  assert.strictEqual(result.status, "degraded");
  assert.strictEqual(result.services.redis.status, "error");
  assert.strictEqual(result.services.redis.error, "Redis connection failed");
});
