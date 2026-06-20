const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

// Configure small limits BEFORE loading env / the middleware so the limiters are
// cheap and deterministic to exercise. node --test runs each test file in its
// own process, so these assignments don't leak into other suites.
process.env.LOGIN_RATE_LIMIT_MAX = "2";
process.env.MUTATING_RATE_LIMIT_MAX = "2";
process.env.PROCESSING_RATE_LIMIT_MAX = "2";
process.env.JIRA_RATE_LIMIT_MAX = "2";
process.env.ADMIN_RATE_LIMIT_MAX = "2";

const rateLimitMiddlewarePath = path.join(
  __dirname,
  "../src/middlewares/rate-limit.middleware.js"
);

const {
  loginRateLimiter,
  mutatingRateLimiter,
  workflowProcessingRateLimiter,
  jiraRateLimiter,
  adminOperationsRateLimiter,
} = require(rateLimitMiddlewarePath);

async function withLimitedServer(limiter, callback) {
  const app = express();

  app.get("/", limiter, (req, res) => res.status(200).json({ ok: true }));

  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

async function collectStatuses(baseUrl, count) {
  const statuses = [];

  for (let attempt = 0; attempt < count; attempt += 1) {
    const response = await fetch(baseUrl);
    statuses.push(response.status);
  }

  return statuses;
}

const limiters = [
  ["loginRateLimiter", loginRateLimiter],
  ["mutatingRateLimiter", mutatingRateLimiter],
  ["workflowProcessingRateLimiter", workflowProcessingRateLimiter],
  ["jiraRateLimiter", jiraRateLimiter],
  ["adminOperationsRateLimiter", adminOperationsRateLimiter],
];

for (const [name, limiter] of limiters) {
  test(`${name} allows requests up to the max and then returns 429`, async () => {
    await withLimitedServer(limiter, async (baseUrl) => {
      const statuses = await collectStatuses(baseUrl, 3);

      assert.deepStrictEqual(
        statuses.slice(0, 2),
        [200, 200],
        `expected first two requests to pass, got ${statuses}`
      );
      assert.strictEqual(statuses[2], 429);
    });
  });
}

test("the 429 response uses the generic GovFlow error shape", async () => {
  await withLimitedServer(mutatingRateLimiter, async (baseUrl) => {
    await fetch(baseUrl);
    await fetch(baseUrl);
    const blocked = await fetch(baseUrl);
    const body = await blocked.json();

    assert.strictEqual(blocked.status, 429);
    assert.strictEqual(body.success, false);
    assert.strictEqual(typeof body.message, "string");
    assert.ok(body.message.length > 0);
  });
});
