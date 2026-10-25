const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const applicationController = require("../controllers/applicationController");

const router = express.Router();

router.use(authMiddleware);
router.get("/", applicationController.getAll);
router.post("/", applicationController.create);
router.patch("/:id/status", applicationController.updateStatus);
router.delete("/:id", applicationController.delete);

module.exports = router;
