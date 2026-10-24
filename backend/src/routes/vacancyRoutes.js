const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const vacancyController = require("../controllers/vacancyController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", vacancyController.getAll);
router.get("/:id", vacancyController.getById);

router.post("/", vacancyController.create);

router.put("/:id", vacancyController.update);

router.delete("/:id", vacancyController.delete);

module.exports = router;
