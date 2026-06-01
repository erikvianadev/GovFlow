const { Router } = require("express");

const departmentsController = require("./departments.controller");

const router = Router();

router.get("/", departmentsController.list);
router.get("/:id", departmentsController.getById);
router.post("/", departmentsController.create);

module.exports = router;
