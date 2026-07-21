const state = {
  user: null,
  currentDoc: null,
  docs: { owned: [], shared: [] },
  saveTimer: null,
  searchTerm: '',
};

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#c2410c', '#15803d', '#a21caf', '#b91c1c', '#6d28d9', '#0369a1'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}
function avatarHTML(name, size) {
  const style = `background:${avatarColor(name)};${size ? `width:${size}px;height:${size}px;font-size:${size * 0.42}px;` : ''}`;
  return `<span class="avatar" style="${style}">${initials(name)}</span>`;
}
function applyAvatar(el, name) {
  el.style.background = avatarColor(name);
  el.textContent = initials(name);
}

function relativeTime(iso) {
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(then).toLocaleDateString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Toasts ---
function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast-' + type : ''}`;
  el.textContent = message;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// --- API ---
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
  document.getElementById('signup-username').value = '';
  document.getElementById('signup-password').value = '';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('whoami').textContent = state.user.username;
  applyAvatar(document.getElementById('whoami-avatar'), state.user.username);
  document.getElementById('editor-pane').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  refreshDocList();
}

// --- Document list ---
async function refreshDocList() {
  state.docs = await api('/api/documents');
  renderDocList();
}

function docItemHTML(d, isShared) {
  const active = state.currentDoc && state.currentDoc.id === d.id;
  const sub = isShared ? `shared by ${escapeHtml(d.owner_username)} · ${relativeTime(d.updated_at)}` : relativeTime(d.updated_at);
  return `
    <li class="doc-item${active ? ' active' : ''}" data-id="${d.id}">
      <span class="doc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 2h8l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 2v5h5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </span>
      <span class="doc-meta">
        <span class="doc-title">${escapeHtml(d.title)}</span>
        <span class="doc-sub">${sub}</span>
      </span>
    </li>`;
}

function renderDocList() {
  const term = state.searchTerm.trim().toLowerCase();
  const owned = state.docs.owned.filter(d => d.title.toLowerCase().includes(term));
  const shared = state.docs.shared.filter(d => d.title.toLowerCase().includes(term));

  const ownedList = document.getElementById('owned-list');
  const sharedList = document.getElementById('shared-list');

  ownedList.innerHTML = owned.length
    ? owned.map(d => docItemHTML(d, false)).join('')
    : `<li class="doc-empty">${term ? 'No matches' : 'No documents yet'}</li>`;

  sharedList.innerHTML = shared.length
    ? shared.map(d => docItemHTML(d, true)).join('')
    : `<li class="doc-empty">${term ? 'No matches' : 'None yet'}</li>`;

  document.querySelectorAll('.doc-item').forEach(li => {
    li.addEventListener('click', () => openDocument(Number(li.dataset.id)));
  });
}

// --- Editor ---
async function openDocument(id) {
  try {
    const doc = await api(`/api/documents/${id}`);
    state.currentDoc = doc;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('editor-pane').style.display = 'block';
    document.getElementById('title-input').value = doc.title;
    document.getElementById('editor').innerHTML = doc.content || '';
    setSaveStatus('');

    const banner = document.getElementById('share-banner');
    if (doc.role === 'shared') {
      banner.style.display = 'flex';
      banner.textContent = 'This document was shared with you — you can view and edit it.';
    } else {
      banner.style.display = 'none';
    }
    document.getElementById('delete-btn').style.display = doc.role === 'owner' ? 'flex' : 'none';
    document.getElementById('share-btn').style.display = doc.role === 'owner' ? 'flex' : 'none';
    renderDocList();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function setSaveStatus(text, kind) {
  const el = document.getElementById('save-status');
  el.className = `save-status${kind ? ' status-' + kind : ''}`;
  el.innerHTML = kind === 'saving' ? `<span class="spinner"></span> Saving…` : text;
}

function scheduleSave() {
  setSaveStatus('', 'saving');
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
    setSaveStatus('Saved', 'saved');
    refreshDocList();
  } catch (e) {
    setSaveStatus('Error saving', 'error');
    toast(e.message, 'error');
  }
}

async function createDocument() {
  try {
    const doc = await api('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled document', content: '' }),
    });
    await refreshDocList();
    openDocument(doc.id);
    document.getElementById('title-input').focus();
    document.getElementById('title-input').select();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteCurrentDocument() {
  if (!state.currentDoc) return;
  try {
    await api(`/api/documents/${state.currentDoc.id}`, { method: 'DELETE' });
    toast('Document deleted', 'success');
    state.currentDoc = null;
    document.getElementById('editor-pane').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    refreshDocList();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// --- Toolbar ---
function initToolbar() {
  document.querySelectorAll('.toolbar button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      document.getElementById('editor').focus();
      scheduleSave();
      updateToolbarState();
    });
  });
  document.getElementById('heading-select').addEventListener('change', (e) => {
    document.execCommand('formatBlock', false, e.target.value);
    document.getElementById('editor').focus();
    scheduleSave();
  });
  document.getElementById('editor').addEventListener('keyup', updateToolbarState);
  document.getElementById('editor').addEventListener('mouseup', updateToolbarState);
}

function updateToolbarState() {
  ['bold', 'italic', 'underline'].forEach(cmd => {
    const btn = document.querySelector(`.toolbar button[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

// --- Share modal ---
async function openShareModal() {
  if (!state.currentDoc) return;
  document.getElementById('share-modal').style.display = 'flex';
  await renderShareModal();
}

async function renderShareModal() {
  const [users, doc] = await Promise.all([
    api('/api/users'),
    api(`/api/documents/${state.currentDoc.id}`),
  ]);
  const sharedSet = new Set(doc.sharedWith);
  const container = document.getElementById('share-user-options');
  container.innerHTML = users
    .filter(u => u.id !== state.user.id)
    .map(u => {
      const shared = sharedSet.has(u.username);
      return `
        <div class="share-user-row" data-username="${escapeHtml(u.username)}">
          ${avatarHTML(u.username, 30)}
          <span class="name">${escapeHtml(u.username)}</span>
          ${shared
            ? `<span class="tag">has access</span><button class="revoke" data-action="revoke">Remove</button>`
            : `<button class="grant" data-action="grant">Grant access</button>`}
        </div>`;
    }).join('');

  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.share-user-row');
      const username = row.dataset.username;
      const grant = btn.dataset.action === 'grant';
      try {
        await api(`/api/documents/${state.currentDoc.id}/share`, {
          method: grant ? 'POST' : 'DELETE',
          body: JSON.stringify({ username }),
        });
        toast(grant ? `Shared with ${username}` : `Removed ${username}'s access`, 'success');
        await renderShareModal();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });
}

// --- Confirm modal (generic) ---
function confirmDialog({ title, body, confirmLabel = 'Confirm' }) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = confirmLabel;
    modal.style.display = 'flex';

    function cleanup(result) {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// --- Upload ---
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error);
    }
    const doc = await res.json();
    toast(`Imported "${doc.title}"`, 'success');
    await refreshDocList();
    openDocument(doc.id);
  } catch (e) {
    toast(e.message, 'error');
  }
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
document.getElementById('search-input').addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderDocList();
});
document.getElementById('delete-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'Delete this document?',
    body: `"${state.currentDoc.title}" will be permanently deleted for you and anyone it was shared with.`,
    confirmLabel: 'Delete',
  });
  if (ok) deleteCurrentDocument();
});

let authMode = 'login';
document.getElementById('toggle-mode-btn').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  const isLogin = authMode === 'login';
  document.getElementById('auth-heading').textContent = isLogin ? 'Log in' : 'Create your account';
  document.getElementById('auth-subheading').textContent = isLogin
    ? 'Enter your username and password to continue.'
    : 'Choose a username and password (min 6 characters).';
  document.getElementById('signup-submit-btn').textContent = isLogin ? 'Log in' : 'Create account';
  document.getElementById('toggle-mode-btn').textContent = isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in';
  document.getElementById('signup-error').style.display = 'none';
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.style.display = 'none';
  if (!username || !password) return;
  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/users';
    const user = await api(endpoint, { method: 'POST', body: JSON.stringify({ username, password }) });
    login(user);
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
});

initToolbar();

const saved = localStorage.getItem('docly_user');
if (saved) {
  state.user = JSON.parse(saved);
  showApp();
}
