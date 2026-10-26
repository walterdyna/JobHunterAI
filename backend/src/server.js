require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const database = require("./config/database");
const env = require("./config/environment");

const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const vacancyRoutes = require("./routes/vacancyRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();
const frontendDist = path.resolve(__dirname, "..", "..", "frontend", "dist");

if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...env.corsOrigins],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: env.nodeEnv === "production"
}));

app.use(cors({
  origin: env.corsOrigins.length ? env.corsOrigins : false,
  credentials: false,
  maxAge: 600
}));
app.use(express.json({ limit: "2mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ message: "Limite de requisições excedido. Tente novamente mais tarde." })
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ message: "Muitas tentativas de autenticação. Aguarde antes de tentar novamente." })
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ message: "Limite de uso da IA excedido. Tente novamente mais tarde." })
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/ai", aiLimiter);

app.get("/", (req, res) => {
  if (fs.existsSync(path.join(frontendDist, "index.html"))) {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendDist, "index.html"));
    return;
  }

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
app.use("/api/applications", applicationRoutes);
app.use("/api/ai", aiRoutes);

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    index: false,
    maxAge: env.nodeEnv === "production" ? "1y" : 0,
    immutable: env.nodeEnv === "production"
  }));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

database.initialize()
  .then(() => {
    const server = app.listen(env.port, env.host, () => {
      console.log(`Servidor JobHunter AI ouvindo em ${env.host}:${env.port}`);
    });

    const shutdown = () => {
      server.close((serverError) => {
        database.close()
          .catch((databaseError) => {
            console.error("Falha ao fechar o banco de dados:", databaseError);
            process.exitCode = 1;
          })
          .finally(() => {
            if (serverError) {
              console.error("Falha ao encerrar o servidor HTTP:", serverError);
              process.exitCode = 1;
            }
          });
      });
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })
  .catch((error) => {
    console.error("Falha ao inicializar o banco de dados:", error);
    process.exitCode = 1;
  });
