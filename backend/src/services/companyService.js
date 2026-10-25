const { all, get, run } = require("../config/database");

module.exports = {
  getAll(userId) {
    return all("SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  },

  getById(id, userId) {
    return get("SELECT * FROM companies WHERE id = ? AND user_id = ?", [id, userId]);
  },

  create(data, userId) {
    const createdAt = new Date().toISOString();
    const result = run(
      "INSERT INTO companies (user_id, name, city, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [
        userId,
        data.name,
        data.city || "",
        createdAt,
        createdAt
      ]
    );

    return this.getById(Number(result.lastInsertRowid), userId);
  },

  update(id, data, userId) {
    const existing = this.getById(id, userId);
    if (!existing) return null;

    const payload = {
      name: data.name ?? existing.name,
      city: data.city ?? existing.city,
      updated_at: new Date().toISOString()
    };

    run(
      "UPDATE companies SET name = ?, city = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [payload.name, payload.city, payload.updated_at, id, userId]
    );

    return this.getById(id, userId);
  },

  delete(id, userId) {
    const existing = this.getById(id, userId);
    if (!existing) return false;

    const result = run("DELETE FROM companies WHERE id = ? AND user_id = ?", [id, userId]);
    return Number(result.changes || 0) > 0;
  }
};
