const { Pool } = require("pg");
const env = require("./environment");

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
});

pool.on("connect", () => {
  console.log("Banco conectado com sucesso");
});

module.exports = pool;
