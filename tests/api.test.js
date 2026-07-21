const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const testDbPath = path.join(__dirname, 'test.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.DB_PATH = testDbPath;

const request = require('supertest');
const app = require('../server/app');
const db = require('../server/db');

function userId(username) {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
}

test('unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/documents');
  assert.strictEqual(res.status, 401);
});

test('a user can create a document, and it is private until shared', async () => {
  const alice = userId('alice');
  const bob = userId('bob');

  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'Alice Doc', content: '<p>hello</p>' });
  assert.strictEqual(created.status, 201);
  const docId = created.body.id;

  // Bob cannot see or open it yet
  const bobList = await request(app).get('/api/documents').set('X-User-Id', bob);
  assert.strictEqual(bobList.body.shared.length, 0);

  const bobOpen = await request(app).get(`/api/documents/${docId}`).set('X-User-Id', bob);
  assert.strictEqual(bobOpen.status, 403);

  // Alice shares it with Bob
  const share = await request(app)
    .post(`/api/documents/${docId}/share`)
    .set('X-User-Id', alice)
    .send({ username: 'bob' });
  assert.strictEqual(share.status, 201);

  // Now Bob can see it under "shared", and open it, but cannot re-share it
  const bobListAfter = await request(app).get('/api/documents').set('X-User-Id', bob);
  assert.strictEqual(bobListAfter.body.shared.length, 1);
  assert.strictEqual(bobListAfter.body.shared[0].id, docId);

  const bobOpenAfter = await request(app).get(`/api/documents/${docId}`).set('X-User-Id', bob);
  assert.strictEqual(bobOpenAfter.status, 200);
  assert.strictEqual(bobOpenAfter.body.role, 'shared');

  const bobShareAttempt = await request(app)
    .post(`/api/documents/${docId}/share`)
    .set('X-User-Id', bob)
    .send({ username: 'carol' });
  assert.strictEqual(bobShareAttempt.status, 403);
});

test('editing and renaming a document persists across reads', async () => {
  const alice = userId('alice');
  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'Draft', content: '' });
  const docId = created.body.id;

  await request(app)
    .put(`/api/documents/${docId}`)
    .set('X-User-Id', alice)
    .send({ title: 'Final Report', content: '<h1>Final</h1><p>Done</p>' });

  const reread = await request(app).get(`/api/documents/${docId}`).set('X-User-Id', alice);
  assert.strictEqual(reread.body.title, 'Final Report');
  assert.strictEqual(reread.body.content, '<h1>Final</h1><p>Done</p>');
});

test('renaming to an empty title is rejected', async () => {
  const alice = userId('alice');
  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'Draft', content: '' });

  const res = await request(app)
    .put(`/api/documents/${created.body.id}`)
    .set('X-User-Id', alice)
    .send({ title: '   ' });
  assert.strictEqual(res.status, 400);
});

test.after(() => {
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
