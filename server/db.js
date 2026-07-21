const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword } = require('./auth');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(document_id, user_id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seeded demo accounts, all sharing the same demo password (see README for credentials).
const DEMO_PASSWORD = 'password123';
const seedUsers = ['alice', 'bob', 'carol'];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)');
for (const u of seedUsers) insertUser.run(u, hashPassword(DEMO_PASSWORD));

module.exports = db;
