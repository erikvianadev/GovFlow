const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const envModulePath = path.join(__dirname, "../src/config/env.js");

// A complete set of valid environment variables. Individual tests remove or
// override entries from this base to exercise the validation rules.
const VALID_ENV = {
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USER: "govflow_user",
  DB_PASSWORD: "govflow_password",
  DB_NAME: "govflow_db",
  // Must satisfy the minimum-strength check (>= 32 chars) enforced in env.js.
  JWT_SECRET: "test_secret_value_padded_to_min_length_0123456789",
  JWT_EXPIRES_IN: "1h",
  // Required only when NODE_ENV=production; included so production load cases pass.
  REDIS_PASSWORD: "test_redis_password",
  NODE_ENV: "test",
};

// Load src/config/env.js in an isolated child process so module-load-time
// validation can be observed. The child runs from a temp directory so dotenv
// cannot repopulate variables from the project .env file.
function loadEnv({ remove = [], override = {} } = {}) {
  const childEnv = {
    ...process.env, // keep OS essentials (PATH, SystemRoot, ...)
    ...VALID_ENV,
    ...override,
    __ENV_MODULE_PATH: envModulePath,
  };

  for (const key of remove) {
    delete childEnv[key];
  }

  return spawnSync(
    process.execPath,
    ["-e", "require(process.env.__ENV_MODULE_PATH)"],
    {
      cwd: os.tmpdir(),
      env: childEnv,
      encoding: "utf8",
    }
  );
}

test("env loads successfully when all required variables are present", () => {
  const result = loadEnv();

  assert.strictEqual(result.status, 0, result.stderr);
});

test("env fails fast when JWT_SECRET is missing", () => {
  const result = loadEnv({ remove: ["JWT_SECRET"] });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Missing required environment variable: JWT_SECRET/);
});

test("env fails fast when JWT_SECRET is empty", () => {
  const result = loadEnv({ override: { JWT_SECRET: "   " } });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Missing required environment variable: JWT_SECRET/);
});

test("env fails fast when JWT_SECRET is too weak", () => {
  const result = loadEnv({ override: { JWT_SECRET: "short" } });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET is too weak/);
});

test("env fails fast when REDIS_PASSWORD is missing in production", () => {
  const result = loadEnv({
    remove: ["REDIS_PASSWORD"],
    override: { NODE_ENV: "production" },
  });

  assert.notStrictEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Missing required environment variable in production: REDIS_PASSWORD/
  );
});

test("env fails fast when REDIS_PASSWORD is empty in production", () => {
  const result = loadEnv({
    override: { NODE_ENV: "production", REDIS_PASSWORD: "   " },
  });

  assert.notStrictEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Missing required environment variable in production: REDIS_PASSWORD/
  );
});

test("env does not require REDIS_PASSWORD in development", () => {
  const result = loadEnv({
    remove: ["REDIS_PASSWORD"],
    override: { NODE_ENV: "development" },
  });

  assert.strictEqual(result.status, 0, result.stderr);
});

test("env fails fast when a required database variable is missing", () => {
  const result = loadEnv({ remove: ["DB_PASSWORD"] });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Missing required environment variable: DB_PASSWORD/);
});

for (const dbVar of ["DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"]) {
  test(`env fails fast when ${dbVar} is missing`, () => {
    const result = loadEnv({ remove: [dbVar] });

    assert.notStrictEqual(result.status, 0);
    assert.match(
      result.stderr,
      new RegExp(`Missing required environment variable: ${dbVar}`)
    );
  });
}

test("env rejects an invalid NODE_ENV value", () => {
  const result = loadEnv({ override: { NODE_ENV: "staging" } });

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Invalid NODE_ENV "staging"/);
});

test("env accepts each valid NODE_ENV value", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    const result = loadEnv({ override: { NODE_ENV: nodeEnv } });

    assert.strictEqual(result.status, 0, `NODE_ENV=${nodeEnv}: ${result.stderr}`);
  }
});

test("env defaults to production when NODE_ENV is not set", () => {
  const childEnv = {
    ...process.env,
    ...VALID_ENV,
    __ENV_MODULE_PATH: envModulePath,
  };

  delete childEnv.NODE_ENV;

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write('NODE_ENV_RESOLVED=' + require(process.env.__ENV_MODULE_PATH).app.nodeEnv)",
    ],
    {
      cwd: os.tmpdir(),
      env: childEnv,
      encoding: "utf8",
    }
  );

  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /NODE_ENV_RESOLVED=production/);
});

test("env exposes workflow execution running timeout with a default", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(String(require(process.env.__ENV_MODULE_PATH).workflowExecution.runningTimeoutMinutes))",
    ],
    {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        ...VALID_ENV,
        __ENV_MODULE_PATH: envModulePath,
      },
      encoding: "utf8",
    }
  );

  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /30$/);
});

test("env accepts WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(String(require(process.env.__ENV_MODULE_PATH).workflowExecution.runningTimeoutMinutes))",
    ],
    {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        ...VALID_ENV,
        WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES: "45",
        __ENV_MODULE_PATH: envModulePath,
      },
      encoding: "utf8",
    }
  );

  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /45$/);
});

// Load env in an isolated child and print the resolved trustProxyHops value.
function loadTrustProxyHops(override = {}) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write('HOPS=' + require(process.env.__ENV_MODULE_PATH).app.trustProxyHops)",
    ],
    {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        ...VALID_ENV,
        ...override,
        __ENV_MODULE_PATH: envModulePath,
      },
      encoding: "utf8",
    }
  );

  assert.strictEqual(result.status, 0, result.stderr);

  return result.stdout;
}

test("trustProxyHops defaults to 0 when TRUST_PROXY_HOPS is not set", () => {
  assert.match(loadTrustProxyHops(), /HOPS=0$/);
});

test("trustProxyHops accepts a valid integer hop count", () => {
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "1" }), /HOPS=1$/);
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "2" }), /HOPS=2$/);
});

test("trustProxyHops never trusts the permissive boolean 'true'", () => {
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "true" }), /HOPS=0$/);
});

test("trustProxyHops falls back to 0 for negative or non-integer values", () => {
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "-1" }), /HOPS=0$/);
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "1.5" }), /HOPS=0$/);
  assert.match(loadTrustProxyHops({ TRUST_PROXY_HOPS: "abc" }), /HOPS=0$/);
});
