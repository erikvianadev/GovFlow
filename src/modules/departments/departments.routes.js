const { Router } = require("express");

const departmentsController = require("./departments.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const roleMiddleware = require("../../middlewares/role.middleware");

const router = Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  departmentsController.list
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["ADMIN", "MANAGER"]),
  departmentsController.getById
);
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["ADMIN"]),
  departmentsController.create
);

module.exports = router;
