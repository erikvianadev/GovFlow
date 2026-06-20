const assert = require("node:assert");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const env = require("../src/config/env");
const { signAccessToken, verifyAccessToken } = require("../src/utils/jwt");

const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "user@govflow.test",
  role: "ADMIN",
};

function decodePayload(token) {
  return JSON.parse(
    Buffer.from(token.split(".")[1], "base64").toString("utf8")
  );
}

test("signAccessToken embeds the iss, aud and jti claims", () => {
  const token = signAccessToken(user);
  const payload = decodePayload(token);

  assert.strictEqual(payload.iss, env.jwt.issuer);
  assert.strictEqual(payload.aud, env.jwt.audience);
  assert.strictEqual(typeof payload.jti, "string");
  assert.ok(payload.jti.length > 0);
});

test("each issued token gets a unique jti", () => {
  const first = decodePayload(signAccessToken(user));
  const second = decodePayload(signAccessToken(user));

  assert.notStrictEqual(first.jti, second.jti);
});

test("verifyAccessToken accepts a token signed by signAccessToken", () => {
  const token = signAccessToken(user);
  const decoded = verifyAccessToken(token);

  assert.strictEqual(decoded.sub, user.id);
  assert.strictEqual(decoded.role, user.role);
  assert.strictEqual(decoded.iss, env.jwt.issuer);
  assert.strictEqual(decoded.aud, env.jwt.audience);
});

test("verifyAccessToken rejects a token with an invalid issuer", () => {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
    algorithm: "HS256",
    issuer: "evil-issuer",
    audience: env.jwt.audience,
  });

  assert.throws(() => verifyAccessToken(token), /jwt issuer invalid/);
});

test("verifyAccessToken rejects a token with an invalid audience", () => {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
    algorithm: "HS256",
    issuer: env.jwt.issuer,
    audience: "evil-audience",
  });

  assert.throws(() => verifyAccessToken(token), /jwt audience invalid/);
});

test("verifyAccessToken rejects a token missing the required claims", () => {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
    algorithm: "HS256",
  });

  assert.throws(() => verifyAccessToken(token), /jwt (issuer|audience) invalid/);
});
