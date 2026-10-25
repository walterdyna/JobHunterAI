const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const env = require("./environment");

const dbDir = path.join(__dirname, "..", "..", "database");
fs.mkdirSync(dbDir, { recursive: true });

const sqlitePath = env.db.file || path.join(dbDir, "jobhunter.db");
const db = new Database(sqlitePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    city TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS vacancies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    salary REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    salary REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendente',
    platform TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS candidate_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
  CREATE INDEX IF NOT EXISTS idx_vacancies_user_id ON vacancies(user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
`);

const applicationColumns = new Set(
  db.prepare("PRAGMA table_info(applications)").all().map((column) => column.name)
);
for (const [column, definition] of [
  ["resume_snapshot", "TEXT"],
  ["cover_letter_snapshot", "TEXT"],
  ["fit_score", "INTEGER"]
]) {
  if (!applicationColumns.has(column)) {
    db.exec(`ALTER TABLE applications ADD COLUMN ${column} ${definition}`);
  }
}

function normalizeParams(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

module.exports = {
  db,
  client: env.db.client,
  initialize() {
    return db;
  },
  run(sql, params = []) {
    return db.prepare(sql).run(...normalizeParams(params));
  },
  get(sql, params = []) {
    return db.prepare(sql).get(...normalizeParams(params));
  },
  all(sql, params = []) {
    return db.prepare(sql).all(...normalizeParams(params));
  },
  exec(sql) {
    return db.exec(sql);
  }
};
