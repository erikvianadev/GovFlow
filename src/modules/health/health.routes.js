const { Router } = require("express");

const healthController = require("./health.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.get("/", healthController.check);
router.get(
  "/deep",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  healthController.deep
);

module.exports = router;
