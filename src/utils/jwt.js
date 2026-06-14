const jwt = require("jsonwebtoken");

const env = require("../config/env");

function signAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, env.jwt.secret, {
    algorithm: "HS256",
    expiresIn: env.jwt.expiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret, {
    algorithms: ["HS256"],
  });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
