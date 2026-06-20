const bcrypt = require("bcrypt");

const SALT_ROUNDS = 10;

// Pre-computed bcrypt hash (cost 10) used to run a comparison even when no user
// is found, so the login timing is the same for existing and non-existing
// accounts. The plaintext that generated it is irrelevant and intentionally not
// recoverable from this value.
const DUMMY_PASSWORD_HASH =
  "$2b$10$yR3vd3IYvdpDYO7NbnIr5OePdWnsRUkWtNxi29kN21DWxmeFatQ1K";

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  hashPassword,
  comparePassword,
  DUMMY_PASSWORD_HASH,
};
