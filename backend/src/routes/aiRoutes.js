const express = require("express");

const aiController = require("../controllers/aiController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/generate", aiController.generate);
router.post("/automation/run", authMiddleware, aiController.runAutomation);
router.get("/automation/status", authMiddleware, aiController.getAutomationStatus);
router.post("/automation/stop", authMiddleware, aiController.stopAutomation);

module.exports = router;
