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

test("signAccessToken issues an HS256 token that verifyAccessToken accepts", () => {
  const token = signAccessToken(user);

  const header = JSON.parse(
    Buffer.from(token.split(".")[0], "base64").toString("utf8")
  );
  assert.strictEqual(header.alg, "HS256");

  const decoded = verifyAccessToken(token);
  assert.strictEqual(decoded.sub, user.id);
  assert.strictEqual(decoded.role, user.role);
});

test("verifyAccessToken rejects tokens signed with a different algorithm", () => {
  const token = jwt.sign({ sub: user.id }, env.jwt.secret, {
    algorithm: "HS512",
  });

  assert.throws(() => verifyAccessToken(token), /invalid algorithm/);
});

test("verifyAccessToken rejects unsigned (alg: none) tokens", () => {
  const token = jwt.sign({ sub: user.id }, null, { algorithm: "none" });

  assert.throws(() => verifyAccessToken(token));
});
