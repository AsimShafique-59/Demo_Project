const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const { hashPassword, verifyPassword } = require('./auth');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const ok = ['.txt', '.md'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only .txt and .md files are supported'), ok);
  },
});

// --- auth (mocked): client sends X-User-Id header after "logging in" ---
function currentUser(req, res, next) {
  const userId = Number(req.headers['x-user-id']);
  const user = userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId) : null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

function canAccess(docId, userId) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return null;
  if (doc.owner_id === userId) return { doc, role: 'owner' };
  const shared = db.prepare('SELECT 1 FROM shares WHERE document_id = ? AND user_id = ?').get(docId, userId);
  if (shared) return { doc, role: 'shared' };
  return null;
}

app.get('/api/users', (req, res) => {
  res.json(db.prepare('SELECT id, username FROM users').all());
});

// dynamic sign-up: create a new password-protected account
app.post('/api/users', (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (!/^[a-z0-9_-]{2,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 2-20 characters: letters, numbers, - or _' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is taken — try logging in instead' });

  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  res.status(201).json({ id: result.lastInsertRowid, username });
});

// log in to an existing password-protected account
app.post('/api/login', (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: `No account named "${username}"` });
  if (!user.password_hash) {
    return res.status(400).json({ error: 'This is a demo account — use the one-click sign-in above' });
  }
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ id: user.id, username: user.username });
});

app.get('/api/me', currentUser, (req, res) => res.json(req.user));

// list documents visible to the current user, tagged owned/shared
app.get('/api/documents', currentUser, (req, res) => {
  const owned = db.prepare(
    `SELECT id, title, owner_id, updated_at FROM documents WHERE owner_id = ? ORDER BY updated_at DESC`
  ).all(req.user.id).map(d => ({ ...d, access: 'owned' }));

  const shared = db.prepare(
    `SELECT d.id, d.title, d.owner_id, d.updated_at, u.username as owner_username
     FROM documents d
     JOIN shares s ON s.document_id = d.id
     JOIN users u ON u.id = d.owner_id
     WHERE s.user_id = ? ORDER BY d.updated_at DESC`
  ).all(req.user.id).map(d => ({ ...d, access: 'shared' }));

  res.json({ owned, shared });
});

app.post('/api/documents', currentUser, (req, res) => {
  const title = (req.body.title || 'Untitled document').trim();
  const content = req.body.content || '';
  const result = db.prepare(
    'INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)'
  ).run(title, content, req.user.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(doc);
});

app.get('/api/documents/:id', currentUser, (req, res) => {
  const access = canAccess(Number(req.params.id), req.user.id);
  if (!access) return res.status(403).json({ error: 'No access to this document' });
  const shares = db.prepare(
    `SELECT u.username FROM shares s JOIN users u ON u.id = s.user_id WHERE s.document_id = ?`
  ).all(access.doc.id);
  res.json({ ...access.doc, role: access.role, sharedWith: shares.map(s => s.username) });
});

app.put('/api/documents/:id', currentUser, (req, res) => {
  const access = canAccess(Number(req.params.id), req.user.id);
  if (!access) return res.status(403).json({ error: 'No access to this document' });

  const title = req.body.title !== undefined ? String(req.body.title).trim() : access.doc.title;
  const content = req.body.content !== undefined ? req.body.content : access.doc.content;
  if (!title) return res.status(400).json({ error: 'Title cannot be empty' });

  db.prepare(
    `UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, content, access.doc.id);

  res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(access.doc.id));
});

app.post('/api/documents/:id/share', currentUser, (req, res) => {
  const access = canAccess(Number(req.params.id), req.user.id);
  if (!access) return res.status(403).json({ error: 'No access to this document' });
  if (access.role !== 'owner') return res.status(403).json({ error: 'Only the owner can share this document' });

  const username = (req.body.username || '').trim();
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: `No user named "${username}"` });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot share a document with yourself' });

  db.prepare('INSERT OR IGNORE INTO shares (document_id, user_id) VALUES (?, ?)').run(access.doc.id, target.id);
  res.status(201).json({ ok: true, sharedWith: target.username });
});

app.delete('/api/documents/:id/share', currentUser, (req, res) => {
  const access = canAccess(Number(req.params.id), req.user.id);
  if (!access) return res.status(403).json({ error: 'No access to this document' });
  if (access.role !== 'owner') return res.status(403).json({ error: 'Only the owner can modify sharing' });

  const username = (req.body.username || '').trim();
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ error: `No user named "${username}"` });

  db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?').run(access.doc.id, target.id);
  res.json({ ok: true, removed: target.username });
});

app.delete('/api/documents/:id', currentUser, (req, res) => {
  const access = canAccess(Number(req.params.id), req.user.id);
  if (!access) return res.status(403).json({ error: 'No access to this document' });
  if (access.role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete this document' });

  db.prepare('DELETE FROM shares WHERE document_id = ?').run(access.doc.id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(access.doc.id);
  res.status(204).end();
});

// Upload a .txt/.md file and turn it into a new editable document
app.post('/api/upload', currentUser, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const text = req.file.buffer ? req.file.buffer.toString('utf-8') : '';
    const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const html = '<p>' + text
      .split(/\r?\n\r?\n/)
      .map(p => p.replace(/</g, '&lt;').replace(/\n/g, '<br>'))
      .join('</p><p>') + '</p>';

    const result = db.prepare(
      'INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)'
    ).run(title || 'Imported document', html, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid));
  });
});

module.exports = app;
