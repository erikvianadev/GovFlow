const { Router } = require("express");

const authController = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.me);
router.get(
  "/admin-check",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  authController.adminCheck
);

module.exports = router;
