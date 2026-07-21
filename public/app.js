const state = {
  user: null,
  currentDoc: null,
  docs: { owned: [], shared: [] },
  saveTimer: null,
};

function authHeaders() {
  return state.user ? { 'X-User-Id': state.user.id } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}

// --- Login ---
async function loadUsers() {
  const users = await api('/api/users');
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  users.forEach(u => {
    const btn = document.createElement('button');
    btn.textContent = `Sign in as ${u.username}`;
    btn.onclick = () => login(u);
    list.appendChild(btn);
  });
}

function login(user) {
  state.user = user;
  localStorage.setItem('docly_user', JSON.stringify(user));
  showApp();
}

function logout() {
  state.user = null;
  state.currentDoc = null;
  localStorage.removeItem('docly_user');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('whoami').textContent = state.user.username;
  refreshDocList();
}

// --- Document list ---
async function refreshDocList() {
  state.docs = await api('/api/documents');
  renderDocList();
}

function renderDocList() {
  const ownedList = document.getElementById('owned-list');
  const sharedList = document.getElementById('shared-list');
  ownedList.innerHTML = '';
  sharedList.innerHTML = '';

  state.docs.owned.forEach(d => {
    const li = document.createElement('li');
    li.textContent = d.title;
    if (state.currentDoc && state.currentDoc.id === d.id) li.classList.add('active');
    li.onclick = () => openDocument(d.id);
    ownedList.appendChild(li);
  });

  if (state.docs.shared.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'None yet';
    li.style.color = '#8b949e';
    li.style.cursor = 'default';
    sharedList.appendChild(li);
  }
  state.docs.shared.forEach(d => {
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(d.title)}<span class="owner-tag">shared by ${escapeHtml(d.owner_username)}</span>`;
    if (state.currentDoc && state.currentDoc.id === d.id) li.classList.add('active');
    li.onclick = () => openDocument(d.id);
    sharedList.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Editor ---
async function openDocument(id) {
  const doc = await api(`/api/documents/${id}`);
  state.currentDoc = doc;
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('editor-pane').style.display = 'block';
  document.getElementById('title-input').value = doc.title;
  document.getElementById('editor').innerHTML = doc.content || '';
  document.getElementById('save-status').textContent = doc.role === 'shared' ? 'Shared with you' : '';
  renderDocList();
}

function scheduleSave() {
  document.getElementById('save-status').textContent = 'Saving…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveCurrentDocument, 500);
}

async function saveCurrentDocument() {
  if (!state.currentDoc) return;
  const title = document.getElementById('title-input').value.trim() || 'Untitled document';
  const content = document.getElementById('editor').innerHTML;
  try {
    const updated = await api(`/api/documents/${state.currentDoc.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content }),
    });
    state.currentDoc = { ...state.currentDoc, ...updated };
    document.getElementById('save-status').textContent = 'Saved';
    refreshDocList();
  } catch (e) {
    document.getElementById('save-status').textContent = 'Error: ' + e.message;
  }
}

async function createDocument() {
  const doc = await api('/api/documents', {
    method: 'POST',
    body: JSON.stringify({ title: 'Untitled document', content: '' }),
  });
  await refreshDocList();
  openDocument(doc.id);
}

// --- Toolbar ---
function initToolbar() {
  document.querySelectorAll('.toolbar button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      document.getElementById('editor').focus();
      scheduleSave();
    });
  });
  document.getElementById('heading-select').addEventListener('change', (e) => {
    document.execCommand('formatBlock', false, e.target.value);
    document.getElementById('editor').focus();
    scheduleSave();
  });
}

// --- Share modal ---
async function openShareModal() {
  if (!state.currentDoc) return;
  const users = await api('/api/users');
  const container = document.getElementById('share-user-options');
  container.innerHTML = '';
  users.filter(u => u.id !== state.user.id).forEach(u => {
    const btn = document.createElement('button');
    btn.textContent = `Grant access to ${u.username}`;
    btn.onclick = async () => {
      try {
        await api(`/api/documents/${state.currentDoc.id}/share`, {
          method: 'POST',
          body: JSON.stringify({ username: u.username }),
        });
        openDocument(state.currentDoc.id).then(renderShareStatus);
      } catch (e) {
        alert(e.message);
      }
    };
    container.appendChild(btn);
  });
  renderShareStatus();
  document.getElementById('share-modal').style.display = 'flex';
}

async function renderShareStatus() {
  const doc = await api(`/api/documents/${state.currentDoc.id}`);
  const el = document.getElementById('share-current');
  el.textContent = doc.sharedWith.length
    ? `Currently shared with: ${doc.sharedWith.join(', ')}`
    : 'Not shared with anyone yet.';
}

// --- Upload ---
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    alert(err.error);
    return;
  }
  const doc = await res.json();
  await refreshDocList();
  openDocument(doc.id);
}

// --- Wire up ---
document.getElementById('new-doc-btn').addEventListener('click', createDocument);
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('share-btn').addEventListener('click', openShareModal);
document.getElementById('share-close-btn').addEventListener('click', () => {
  document.getElementById('share-modal').style.display = 'none';
});
document.getElementById('title-input').addEventListener('input', scheduleSave);
document.getElementById('editor').addEventListener('input', scheduleSave);
document.getElementById('upload-input').addEventListener('change', (e) => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
  e.target.value = '';
});

initToolbar();
loadUsers();

const saved = localStorage.getItem('docly_user');
if (saved) {
  state.user = JSON.parse(saved);
  showApp();
}
