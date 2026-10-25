const { all, get, run } = require("../config/database");

module.exports = {
  getAll(userId) {
    return all(
      "SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
  },

  getById(id, userId) {
    return get("SELECT * FROM applications WHERE id = ? AND user_id = ?", [id, userId]);
  },

  create(data, userId) {
    const createdAt = new Date().toISOString();
    const result = run(
      `INSERT INTO applications (
        user_id, title, company, salary, status, platform, notes,
        resume_snapshot, cover_letter_snapshot, fit_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.title,
        data.company,
        Number(data.salary || 0),
        data.status || "Pendente",
        data.platform || "LinkedIn",
        data.notes || "",
        data.resumeSnapshot || null,
        data.coverLetterSnapshot || null,
        Number.isInteger(data.fitScore) ? data.fitScore : null,
        createdAt,
        createdAt
      ]
    );

    return this.getById(Number(result.lastInsertRowid), userId);
  },

  updateStatus(id, status, userId) {
    const existing = this.getById(id, userId);
    if (!existing) return null;

    const updatedAt = new Date().toISOString();
    run(
      "UPDATE applications SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [status, updatedAt, id, userId]
    );

    return this.getById(id, userId);
  },

  delete(id, userId) {
    const existing = this.getById(id, userId);
    if (!existing) return false;

    const result = run("DELETE FROM applications WHERE id = ? AND user_id = ?", [id, userId]);
    return Number(result.changes || 0) > 0;
  }
};
