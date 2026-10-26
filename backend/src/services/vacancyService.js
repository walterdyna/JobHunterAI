const { all, get, run } = require("../config/database");

module.exports = {
  async getAll(userId) {
    return all("SELECT * FROM vacancies WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  },

  async getById(id, userId) {
    return get("SELECT * FROM vacancies WHERE id = ? AND user_id = ?", [id, userId]);
  },

  async create(data, userId) {
    const createdAt = new Date().toISOString();
    const result = await run(
      "INSERT INTO vacancies (user_id, title, company, salary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId,
        data.title,
        data.company,
        Number(data.salary || 0),
        createdAt,
        createdAt
      ]
    );

    return this.getById(Number(result.lastInsertRowid), userId);
  },

  async update(id, data, userId) {
    const existing = await this.getById(id, userId);
    if (!existing) return null;

    const payload = {
      title: data.title ?? existing.title,
      company: data.company ?? existing.company,
      salary: Number(data.salary ?? existing.salary ?? 0),
      updated_at: new Date().toISOString()
    };

    await run(
      "UPDATE vacancies SET title = ?, company = ?, salary = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [payload.title, payload.company, payload.salary, payload.updated_at, id, userId]
    );

    return this.getById(id, userId);
  },

  async delete(id, userId) {
    const existing = await this.getById(id, userId);
    if (!existing) return false;

    const result = await run("DELETE FROM vacancies WHERE id = ? AND user_id = ?", [id, userId]);
    return Number(result.changes || 0) > 0;
  }
};
