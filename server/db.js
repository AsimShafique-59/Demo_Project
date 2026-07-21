const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES documents(id)
  );
`;

// Seeded demo accounts, all sharing the same demo password (see README for credentials).
const DEMO_PASSWORD = 'password123';
const SEED_USERS = ['alice', 'bob', 'carol'];

/**
 * Creates a SQLite database backed by sql.js (WASM, no native compilation) instead of
 * better-sqlite3 (native binary). Some deploy sandboxes can't fetch a prebuilt binary or
 * compile one from source, so this avoids that class of failure entirely. The returned
 * object mimics better-sqlite3's `.prepare(sql).get/all/run()` shape closely enough that
 * route code elsewhere didn't need to change.
 */
async function createDb(dbPath) {
  const resolvedPath = dbPath || process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
  const SQL = await initSqlJs();
  const fileBuffer = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath) : undefined;
  const sqliteDb = new SQL.Database(fileBuffer);

  function persist() {
    fs.writeFileSync(resolvedPath, Buffer.from(sqliteDb.export()));
  }

  sqliteDb.exec(SCHEMA);

  const db = {
    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqliteDb.prepare(sql);
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...params) {
          const stmt = sqliteDb.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...params) {
          const stmt = sqliteDb.prepare(sql);
          stmt.run(params);
          stmt.free();
          const changes = sqliteDb.getRowsModified();
          let lastInsertRowid;
          if (/^\s*insert/i.test(sql)) {
            const result = sqliteDb.exec('SELECT last_insert_rowid() AS id');
            lastInsertRowid = result[0]?.values[0][0];
          }
          persist();
          return { changes, lastInsertRowid };
        },
      };
    },
    close() {
      persist();
      sqliteDb.close();
    },
  };

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)');
  for (const username of SEED_USERS) insertUser.run(username, hashPassword(DEMO_PASSWORD));

  return db;
}

module.exports = { createDb };
