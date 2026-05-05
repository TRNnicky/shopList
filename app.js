// ── IndexedDB setup ──────────────────────────────────────────────────────────

const DB_NAME = 'shoplist';
const DB_VERSION = 1;
const STORE = 'items';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteWhere(predicate) {
  const all = await dbGetAll();
  await Promise.all(all.filter(predicate).map((item) => dbDelete(item.id)));
}

// ── Render ────────────────────────────────────────────────────────────────────

async function render() {
  const items = await dbGetAll();
  const list = document.getElementById('list');
  const countEl = document.getElementById('count');

  const pending = items.filter((i) => !i.checked).length;
  countEl.textContent = `${pending} item${pending !== 1 ? 's' : ''} left`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty"><span>🛒</span>Your list is empty.<br>Add something above!</div>`;
    return;
  }

  // unchecked first, then checked
  const sorted = [
    ...items.filter((i) => !i.checked),
    ...items.filter((i) => i.checked),
  ];

  list.innerHTML = sorted.map((item) => `
    <div class="item ${item.checked ? 'checked' : ''}" data-id="${item.id}">
      <button class="item-check" aria-label="Toggle ${escHtml(item.name)}" onclick="toggle('${item.id}')"></button>
      <input
        class="item-name-input"
        value="${escAttr(item.name)}"
        placeholder="Item name"
        onblur="updateField('${item.id}', 'name', this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
      />
      <input
        class="item-qty-input"
        value="${escAttr(item.qty || '')}"
        placeholder="Qty"
        onblur="updateField('${item.id}', 'qty', this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
      />
      <button class="item-delete" aria-label="Delete ${escHtml(item.name)}" onclick="remove('${item.id}')">✕</button>
    </div>
  `).join('');
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function addItem() {
  const nameInput = document.getElementById('item-name');
  const qtyInput = document.getElementById('item-qty');

  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const item = {
    id: crypto.randomUUID(),
    name,
    qty: qtyInput.value.trim(),
    checked: false,
    createdAt: Date.now(),
  };

  await dbPut(item);
  nameInput.value = '';
  qtyInput.value = '';
  nameInput.focus();
  await render();
}

async function updateField(id, field, value) {
  const all = await dbGetAll();
  const item = all.find((i) => i.id === id);
  if (!item) return;
  const trimmed = value.trim();
  if (field === 'name' && !trimmed) return; // don't save empty name
  item[field] = trimmed;
  await dbPut(item);
  await render();
}


async function toggle(id) {
  const all = await dbGetAll();
  await dbPut(item);
  await render();
}

async function remove(id) {
  await dbDelete(id);
  await render();
  showToast('Item removed');
}

async function clearChecked() {
  await dbDeleteWhere((i) => i.checked);
  await render();
  showToast('Checked items cleared');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await render();

  // Add on Enter key in name field
  document.getElementById('item-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  // Move focus to name when hitting Enter on qty
  document.getElementById('item-qty').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
});
