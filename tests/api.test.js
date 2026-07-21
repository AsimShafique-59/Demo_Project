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

test('sign-up creates a password-protected account, and login verifies it', async () => {
  const signup = await request(app).post('/api/users').send({ username: 'dave', password: 'hunter22' });
  assert.strictEqual(signup.status, 201);
  assert.strictEqual(signup.body.username, 'dave');
  assert.strictEqual(signup.body.password, undefined);

  const wrongPassword = await request(app).post('/api/login').send({ username: 'dave', password: 'nope' });
  assert.strictEqual(wrongPassword.status, 401);

  const rightPassword = await request(app).post('/api/login').send({ username: 'dave', password: 'hunter22' });
  assert.strictEqual(rightPassword.status, 200);
  assert.strictEqual(rightPassword.body.username, 'dave');

  const duplicate = await request(app).post('/api/users').send({ username: 'dave', password: 'somethingelse' });
  assert.strictEqual(duplicate.status, 409);

  const tooShort = await request(app).post('/api/users').send({ username: 'erin', password: '123' });
  assert.strictEqual(tooShort.status, 400);
});

test('seeded demo accounts have no password and reject /api/login', async () => {
  const res = await request(app).post('/api/login').send({ username: 'alice', password: 'anything' });
  assert.strictEqual(res.status, 400);
});

test('owner can revoke a share, and can delete their document', async () => {
  const alice = userId('alice');
  const bob = userId('bob');

  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'To Revoke', content: '' });
  const docId = created.body.id;

  await request(app).post(`/api/documents/${docId}/share`).set('X-User-Id', alice).send({ username: 'bob' });
  const revoke = await request(app).delete(`/api/documents/${docId}/share`).set('X-User-Id', alice).send({ username: 'bob' });
  assert.strictEqual(revoke.status, 200);

  const bobOpen = await request(app).get(`/api/documents/${docId}`).set('X-User-Id', bob);
  assert.strictEqual(bobOpen.status, 403);

  const del = await request(app).delete(`/api/documents/${docId}`).set('X-User-Id', alice);
  assert.strictEqual(del.status, 204);

  const aliceOpen = await request(app).get(`/api/documents/${docId}`).set('X-User-Id', alice);
  assert.strictEqual(aliceOpen.status, 403);
});

test.after(() => {
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
