const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const servicePath = path.join(__dirname, "../../src/modules/health/health.service.js");
const databasePath = path.join(__dirname, "../../src/config/database.js");
const redisPath = path.join(__dirname, "../../src/config/redis.js");

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
  [servicePath, databasePath, redisPath].forEach(
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

  return {
    healthService: require(servicePath),
  };
}

test("getStatus exposes only the aggregated status when everything is ok", async () => {
  const { healthService } = loadHealthService();

  const result = await healthService.getStatus();

  assert.deepStrictEqual(result, { status: "ok" });
});

test("getStatus does not leak services, timestamp, service or error fields", async () => {
  const { healthService } = loadHealthService();

  const result = await healthService.getStatus();

  assert.deepStrictEqual(Object.keys(result), ["status"]);
  assert.strictEqual(result.services, undefined);
  assert.strictEqual(result.timestamp, undefined);
  assert.strictEqual(result.service, undefined);
  assert.strictEqual(result.error, undefined);
});

test("getStatus reports degraded without leaking the database error message", async () => {
  const { healthService } = loadHealthService({
    databaseError: new Error("connect ECONNREFUSED 127.0.0.1:5432"),
  });

  const result = await healthService.getStatus();

  assert.deepStrictEqual(result, { status: "degraded" });
});

test("getStatus reports degraded without leaking the redis error message", async () => {
  const { healthService } = loadHealthService({
    redisError: new Error("connect ECONNREFUSED 127.0.0.1:6379"),
  });

  const result = await healthService.getStatus();

  assert.deepStrictEqual(result, { status: "degraded" });
});

test("getDeepStatus returns details with status-only dependencies when healthy", async () => {
  const { healthService } = loadHealthService();

  const result = await healthService.getDeepStatus();

  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.service, "GovFlow API");
  assert.strictEqual(typeof result.timestamp, "string");
  assert.deepStrictEqual(result.services.database, { status: "ok" });
  assert.deepStrictEqual(result.services.redis, { status: "ok" });
});

test("getDeepStatus degrades and never exposes the driver error message", async () => {
  const { healthService } = loadHealthService({
    redisError: new Error("connect ECONNREFUSED 127.0.0.1:6379"),
  });

  const result = await healthService.getDeepStatus();

  assert.strictEqual(result.status, "degraded");
  assert.deepStrictEqual(result.services.database, { status: "ok" });
  assert.deepStrictEqual(result.services.redis, { status: "error" });
  assert.strictEqual(result.services.redis.error, undefined);
});

test("getDeepStatus degrades when the redis ping is not successful", async () => {
  const { healthService } = loadHealthService({
    redisConnected: false,
  });

  const result = await healthService.getDeepStatus();

  assert.strictEqual(result.status, "degraded");
  assert.deepStrictEqual(result.services.redis, { status: "error" });
});
