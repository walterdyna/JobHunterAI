require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const vacancyRoutes = require("./routes/vacancyRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    project: "JobHunter AI",
    version: "1.0.0"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    project: "JobHunter AI",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/vacancies", vacancyRoutes);

app.listen(process.env.PORT || 3001, () => {
  console.log("Servidor rodando na porta 3001");
});
