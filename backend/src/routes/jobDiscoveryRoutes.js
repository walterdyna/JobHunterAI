const express = require("express");

const authMiddleware = require("../middlewares/authMiddleware");
const jobDiscoveryController = require("../controllers/jobDiscoveryController");

const router = express.Router();

router.use(authMiddleware);
router.post("/search", jobDiscoveryController.search);
router.get("/decisions", jobDiscoveryController.getDecisions);
router.post("/decisions", jobDiscoveryController.saveDecision);

module.exports = router;
