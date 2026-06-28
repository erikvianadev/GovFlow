const assert = require("node:assert");
const test = require("node:test");

const {
  JiraBusinessError,
  JiraTechnicalError,
} = require("../src/modules/jira/jira.errors");

// Mirrors the shape of a real axios error: config/request/headers carry the
// Jira Basic Auth header (Authorization) that must never reach a log.
function buildAxiosErrorWithSecrets() {
  return {
    message: "Request failed with status code 401",
    code: "ERR_BAD_REQUEST",
    config: {
      url: "https://govflow.atlassian.net/rest/api/3/myself",
      headers: {
        Authorization: "Basic c3VwZXItc2VjcmV0LWNyZWRlbnRpYWxz",
      },
    },
    request: { _header: "GET /rest/api/3/myself ..." },
    response: {
      status: 401,
      data: { errorMessages: ["Client must be authenticated"] },
    },
  };
}

test("JiraTechnicalError.cause never carries config/request/headers (no secret leak)", () => {
  const error = new JiraTechnicalError(
    "Temporary Jira request failure",
    buildAxiosErrorWithSecrets()
  );

  assert.strictEqual(error.cause.config, undefined);
  assert.strictEqual(error.cause.request, undefined);
  assert.ok(!("headers" in error.cause));

  // Defensive: the serialized error must not contain the credential anywhere.
  const serialized = JSON.stringify(error.cause);
  assert.ok(!serialized.includes("super-secret"));
  assert.ok(!serialized.toLowerCase().includes("authorization"));
});

test("JiraTechnicalError.cause keeps only safe diagnostic fields", () => {
  const error = new JiraTechnicalError(
    "Temporary Jira request failure",
    buildAxiosErrorWithSecrets()
  );

  assert.deepStrictEqual(error.cause, {
    message: "Request failed with status code 401",
    code: "ERR_BAD_REQUEST",
    status: 401,
    responseData: { errorMessages: ["Client must be authenticated"] },
  });
  assert.strictEqual(error.name, "JiraTechnicalError");
  assert.strictEqual(error.isRetryable, true);
});

test("JiraTechnicalError.cause is null when constructed without a cause", () => {
  const error = new JiraTechnicalError("Jira client not available");

  assert.strictEqual(error.cause, null);
  assert.strictEqual(error.isRetryable, true);
});

test("JiraBusinessError stays operational with its status code", () => {
  const error = new JiraBusinessError("Jira integration is disabled", 400);

  assert.strictEqual(error.name, "JiraBusinessError");
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(error.isOperational, true);
  assert.strictEqual(error.isBusinessFailure, true);
});
