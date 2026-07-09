const { Router } = require("express");

const usersController = require("./users.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");
const { mutatingRateLimiter } = require("../../middlewares/rate-limit.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  usersController.list
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  usersController.getById
);
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  mutatingRateLimiter,
  usersController.create
);

module.exports = router;
