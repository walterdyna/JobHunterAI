require("dotenv").config();
const path = require("path");

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET obrigatório: configure um segredo aleatório com pelo menos 32 caracteres.");
}

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  automationEnabled: process.env.AUTOMATION_ENABLED === "true"
    || (process.env.NODE_ENV !== "production" && process.env.AUTOMATION_ENABLED !== "false"),
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    client: process.env.DB_CLIENT || "sqlite",
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "jobhunter",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    file: process.env.DB_FILE || path.join(__dirname, "..", "..", "database", "jobhunter.db")
  },

  jwt: {
    secret: jwtSecret
  },
};
