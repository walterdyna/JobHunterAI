require("dotenv").config();
const path = require("path");

module.exports = {
  port: process.env.PORT || 3001,

  db: {
    client: process.env.DB_CLIENT || "sqlite",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "jobhunter",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    file: process.env.DB_FILE || path.join(__dirname, "..", "..", "database", "jobhunter.db")
  },

  jwt: {
    secret: process.env.JWT_SECRET || "jobhunter-dev-secret"
  },
};
