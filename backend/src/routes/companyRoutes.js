const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const companyController = require("../controllers/companyController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", companyController.getAll);
router.get("/:id", companyController.getById);

router.post("/", companyController.create);

router.put("/:id", companyController.update);

router.delete("/:id", companyController.delete);

module.exports = router;
