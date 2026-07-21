const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const testDbPath = path.join(__dirname, 'test.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.VERSION_SNAPSHOT_INTERVAL_MS = '0'; // snapshot on every edit in tests, no throttling

const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');

let app, db;

test.before(async () => {
  db = await createDb(testDbPath);
  app = await createApp(db);
});

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

test('seeded demo accounts log in with the shared demo password, and reject a wrong one', async () => {
  const wrong = await request(app).post('/api/login').send({ username: 'alice', password: 'anything' });
  assert.strictEqual(wrong.status, 401);

  const right = await request(app).post('/api/login').send({ username: 'alice', password: 'password123' });
  assert.strictEqual(right.status, 200);
  assert.strictEqual(right.body.username, 'alice');
});

test('login for a nonexistent user returns the same generic error (no user enumeration)', async () => {
  const res = await request(app).post('/api/login').send({ username: 'nobody', password: 'whatever' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Incorrect username or password');
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

test('editing a document creates version history, and restoring brings back old content', async () => {
  const alice = userId('alice');
  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'V1', content: '<p>first draft</p>' });
  const docId = created.body.id;

  const noVersionsYet = await request(app).get(`/api/documents/${docId}/versions`).set('X-User-Id', alice);
  assert.strictEqual(noVersionsYet.body.length, 0);

  await request(app)
    .put(`/api/documents/${docId}`)
    .set('X-User-Id', alice)
    .send({ title: 'V2', content: '<p>second draft</p>' });

  const afterFirstEdit = await request(app).get(`/api/documents/${docId}/versions`).set('X-User-Id', alice);
  assert.strictEqual(afterFirstEdit.body.length, 1);
  assert.strictEqual(afterFirstEdit.body[0].title, 'V1');

  await request(app)
    .put(`/api/documents/${docId}`)
    .set('X-User-Id', alice)
    .send({ title: 'V3', content: '<p>third draft</p>' });

  const versions = await request(app).get(`/api/documents/${docId}/versions`).set('X-User-Id', alice);
  assert.strictEqual(versions.body.length, 2);
  const v1 = versions.body.find(v => v.title === 'V1');

  const restore = await request(app)
    .post(`/api/documents/${docId}/versions/${v1.id}/restore`)
    .set('X-User-Id', alice);
  assert.strictEqual(restore.status, 200);
  assert.strictEqual(restore.body.title, 'V1');
  assert.strictEqual(restore.body.content, '<p>first draft</p>');

  // restoring itself snapshots the pre-restore state (V3), so history now has 3 entries
  const versionsAfterRestore = await request(app).get(`/api/documents/${docId}/versions`).set('X-User-Id', alice);
  assert.strictEqual(versionsAfterRestore.body.length, 3);
});

test('a non-owner without access cannot read or restore version history', async () => {
  const alice = userId('alice');
  const bob = userId('bob');
  const created = await request(app)
    .post('/api/documents')
    .set('X-User-Id', alice)
    .send({ title: 'Private', content: '<p>secret</p>' });

  const res = await request(app).get(`/api/documents/${created.body.id}/versions`).set('X-User-Id', bob);
  assert.strictEqual(res.status, 403);
});

test.after(() => {
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
