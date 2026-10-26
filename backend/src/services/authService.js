const { get, run } = require("../config/database");

module.exports = {
  async findByEmail(email) {
    return get(
      "SELECT * FROM users WHERE lower(email) = lower(?)",
      [email]
    );
  },

  async findById(id) {
    return get("SELECT * FROM users WHERE id = ?", [id]);
  },

  async create(user) {
    const result = await run(
      "INSERT INTO users (name, email, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [
        user.name,
        user.email,
        user.password,
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    return this.findById(Number(result.lastInsertRowid));
  }
};
