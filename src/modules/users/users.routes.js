const { Router } = require("express");

const usersController = require("./users.controller");

const router = Router();

router.get("/", usersController.list);
router.get("/:id", usersController.getById);
router.post("/", usersController.create);

module.exports = router;
