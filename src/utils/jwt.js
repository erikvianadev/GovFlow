const jwt = require("jsonwebtoken");

const env = require("../config/env");

function signAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
