const { Router } = require("express");

const authController = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const { loginRateLimiter } = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.post("/login", loginRateLimiter, authController.login);
router.get("/me", authMiddleware, authController.me);
router.get(
  "/admin-check",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  authController.adminCheck
);

module.exports = router;
