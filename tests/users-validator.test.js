const assert = require("node:assert");
const test = require("node:test");

const { validateCreateUser } = require("../src/validators/users.validator");

const VALID_USER = {
  name: "New User",
  email: "new.user@govflow.test",
  password: "Str0ng!Passw0rd",
  role: "MANAGER",
  departmentId: "11111111-1111-4111-8111-111111111111",
};

function passwordErrors(password) {
  return validateCreateUser({ ...VALID_USER, password }).filter(
    (error) => error.field === "password"
  );
}

test("accepts a strong password meeting every rule", () => {
  const errors = validateCreateUser(VALID_USER);

  assert.deepStrictEqual(errors, []);
});

test("rejects a password shorter than 12 characters", () => {
  const errors = passwordErrors("Aa1!aaaa");

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /at least 12 characters/);
});

test("rejects a password without an uppercase letter", () => {
  const errors = passwordErrors("str0ng!passw0rd");

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /uppercase/);
});

test("rejects a password without a lowercase letter", () => {
  const errors = passwordErrors("STR0NG!PASSW0RD");

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /lowercase/);
});

test("rejects a password without a number", () => {
  const errors = passwordErrors("Strong!Password");

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /number/);
});

test("rejects a password without a special character", () => {
  const errors = passwordErrors("Str0ngPassw0rd");

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /special character/);
});

test("rejects a password longer than 72 bytes (multibyte aware)", () => {
  // 70 'é' characters (2 bytes each in UTF-8 = 140 bytes) plus the required
  // classes. Character length is fine, but the byte length exceeds 72.
  const longPassword = `Aa1!${"é".repeat(70)}`;

  assert.ok(longPassword.length <= 75);
  assert.ok(Buffer.byteLength(longPassword, "utf8") > 72);

  const errors = passwordErrors(longPassword);

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /at most 72 bytes/);
});

test("accepts a password exactly at the 72-byte boundary", () => {
  // 72 ASCII bytes, satisfying every character class.
  const password = `Aa1!${"a".repeat(68)}`;

  assert.strictEqual(Buffer.byteLength(password, "utf8"), 72);
  assert.deepStrictEqual(passwordErrors(password), []);
});

test("rejects a missing password", () => {
  const errors = passwordErrors(undefined);

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /required/);
});

test("rejects a non-string password", () => {
  const errors = passwordErrors(12345678901234);

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /must be a string/);
});
