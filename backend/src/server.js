const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    project: "JobHunter AI",
    version: "1.0.0",
    message: "Servidor funcionando!"
  });
});

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    project: "JobHunter AI",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
