function validateLogin(payload) {
  const errors = [];

  validateEmail(payload.email, errors);
  validatePassword(payload.password, errors);

  return errors;
}

function validateEmail(email, errors) {
  if (email === undefined || email === null) {
    errors.push({
      field: "email",
      message: "Email is required",
    });
    return;
  }

  if (typeof email !== "string") {
    errors.push({
      field: "email",
      message: "Email must be a string",
    });
    return;
  }

  const normalizedEmail = email.trim();

  if (normalizedEmail.length === 0) {
    errors.push({
      field: "email",
      message: "Email cannot be empty",
    });
    return;
  }

  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!basicEmailRegex.test(normalizedEmail)) {
    errors.push({
      field: "email",
      message: "Email must be valid",
    });
  }
}

function validatePassword(password, errors) {
  if (password === undefined || password === null) {
    errors.push({
      field: "password",
      message: "Password is required",
    });
    return;
  }

  if (typeof password !== "string") {
    errors.push({
      field: "password",
      message: "Password must be a string",
    });
    return;
  }

  if (password.length === 0) {
    errors.push({
      field: "password",
      message: "Password cannot be empty",
    });
  }
}

module.exports = {
  validateLogin,
};
