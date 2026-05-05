// app.js — Shopping List PWA main logic

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  items: [],
  history: [],
  recipes: [],
  weekMenu: {}, // day (0–6) → { day, recipeId, recipeName }
  activeTab: 'shopping',
  editingRecipeId: null,
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Utilities ───────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mergeQty(existing, incoming) {
  const a = parseFloat(existing);
  const b = parseFloat(incoming);
  if (!isNaN(a) && !isNaN(b)) {
    const unit = (
      existing.replace(/[\d.\s]/g, '') || incoming.replace(/[\d.\s]/g, '')
    ).trim();
    return unit ? `${a + b} ${unit}` : `${a + b}`;
  }
  if (!existing) return incoming;
  if (!incoming) return existing;
  return `${existing} + ${incoming}`;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'toast-hide');
  el.classList.add('toast-show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('toast-show');
    el.classList.add('toast-hide');
    setTimeout(() => { el.classList.remove('toast-hide'); el.classList.add('hidden'); }, 300);
  }, 2500);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.remove('hidden');

    const ok = document.getElementById('confirm-ok-btn');
    const cancel = document.getElementById('confirm-cancel-btn');

    function finish(result) {
      overlay.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      resolve(result);
    }
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onOverlay = (e) => { if (e.target === overlay) finish(false); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}


// ─── Tabs ─────────────────────────────────────────────────────────────────────

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.tab-content').forEach((s) =>
    s.classList.toggle('active', s.id === 'tab-' + name)
  );

  const titles = {
    shopping: 'Shopping List',
    history: 'History',
    recipes: 'Recipes',
    week: 'Week Menu',
  };
  document.getElementById('app-title').textContent = titles[name] || 'Shopping List';

  if (name === 'history') renderHistory();
  if (name === 'recipes') renderRecipes();
  if (name === 'week') renderWeekMenu();
}

// ─── Shopping List ────────────────────────────────────────────────────────────

function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  const sorted = [...state.items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    const ao = a.sortOrder ?? a.createdAt;
    const bo = b.sortOrder ?? b.createdAt;
    return ao - bo;
  });

  list.innerHTML = '';
  sorted.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'item-row' + (item.checked ? ' checked' : '');
    li.dataset.id = item.id;
    li.innerHTML =
      '<span class="drag-handle" aria-hidden="true">⠿</span>' +
      '<button class="check-btn" aria-label="Toggle checked">' + (item.checked ? '✓' : '') + '</button>' +
      '<input class="item-name" type="text" value="' + esc(item.name) + '" placeholder="Name" aria-label="Item name">' +
      '<input class="item-qty" type="text" value="' + esc(item.qty) + '" placeholder="Qty" aria-label="Quantity">' +
      '<button class="delete-btn" aria-label="Delete">✕</button>';
    list.appendChild(li);
    requestAnimationFrame(() => li.classList.add('item-visible'));
  });

  updateItemCount();
}

function updateItemCount() {
  const total = state.items.length;
  const checked = state.items.filter((i) => i.checked).length;
  const el = document.getElementById('item-count');
  el.textContent = total === 0 ? '' : (total - checked) + ' remaining · ' + total + ' total';
}

async function addItem(name, qty, opts) {
  const silent = opts && opts.silent;
  name = (name || '').trim();
  if (!name) return 'empty';
  qty = (qty || '').trim();

  const existing = state.items.find(
    (i) => i.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    const newQty = mergeQty(existing.qty, qty);
    existing.qty = newQty;
    await DB.putItem(existing);
    renderShoppingList();
    if (!silent) showToast('"' + existing.name + '" already in list — qty updated to ' + (newQty || '—'));
    return 'merged';
  }

  const item = {
    id: crypto.randomUUID(),
    name: name,
    qty: qty,
    checked: false,
    createdAt: Date.now(),
    sortOrder: Date.now(),
  };
  state.items.push(item);
  await DB.putItem(item);
  await _recordHistoryState(name);
  renderShoppingList();
  return 'added';
}

async function _recordHistoryState(name) {
  await DB.recordHistory(name);
  const key = name.trim().toLowerCase();
  const existing = state.history.find((h) => h.key === key);
  if (existing) {
    existing.displayName = name.trim();
    existing.lastUsed = Date.now();
    existing.count = (existing.count || 0) + 1;
  } else {
    state.history.push({ key: key, displayName: name.trim(), lastUsed: Date.now(), count: 1 });
  }
}

async function toggleCheck(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.checked = !item.checked;
  await DB.putItem(item);
  renderShoppingList();
}

async function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  await DB.deleteItem(id);
  renderShoppingList();
}

async function updateItemField(id, field, value) {
  const item = state.items.find((i) => i.id === id);
  if (!item || item[field] === value) return;
  item[field] = value;
  await DB.putItem(item);
  updateItemCount();
}

async function clearChecked() {
  const toRemove = state.items.filter((i) => i.checked);
  for (const item of toRemove) await DB.deleteItem(item.id);
  state.items = state.items.filter((i) => !i.checked);
  renderShoppingList();
}

async function clearAllItems() {
  await DB.clearItems();
  state.items = [];
  renderShoppingList();
}

// ─── History ──────────────────────────────────────────────────────────────────

function renderHistory(filter) {
  const search = document.getElementById('history-search');
  const term = (filter !== undefined ? filter : (search ? search.value : '')).toLowerCase();
  const list = document.getElementById('history-list');
  const filtered = state.history
    .filter((h) => !term || h.displayName.toLowerCase().includes(term))
    .sort((a, b) => b.lastUsed - a.lastUsed);

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-msg">No history yet.</li>';
    return;
  }
  filtered.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'history-row';
    const date = h.lastUsed ? new Date(h.lastUsed).toLocaleDateString() : '';
    li.innerHTML =
      '<span class="history-name">' + esc(h.displayName) + '</span>' +
      '<span class="history-date">' + esc(date) + '</span>' +
      '<button class="readd-btn" data-key="' + esc(h.key) + '" aria-label="Add to list">+</button>';
    list.appendChild(li);
  });
}

async function reAddFromHistory(key) {
  const entry = state.history.find((h) => h.key === key);
  if (!entry) return;
  const result = await addItem(entry.displayName, '');
  if (result === 'added') showToast('"' + entry.displayName + '" added to list');
}

async function clearHistory() {
  await DB.clearHistory();
  state.history = [];
  renderHistory();
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

function renderRecipes() {
  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  if (state.recipes.length === 0) {
    list.innerHTML = '<li class="empty-msg">No recipes yet. Tap "+ New Recipe" to add one.</li>';
    return;
  }
  state.recipes.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'recipe-row';
    const ingCount = r.ingredients.length;
    li.innerHTML =
      '<div class="recipe-info">' +
        '<span class="recipe-name">' + esc(r.name) + '</span>' +
        '<span class="recipe-meta">' + ingCount + ' ingredient' + (ingCount !== 1 ? 's' : '') + '</span>' +
      '</div>' +
      '<div class="recipe-btns">' +
        '<button class="btn-sm btn-primary add-recipe-btn" data-id="' + esc(r.id) + '">Add to list</button>' +
        '<button class="btn-sm btn-secondary edit-recipe-btn" data-id="' + esc(r.id) + '" aria-label="Edit">✎</button>' +
        '<button class="btn-sm btn-danger del-recipe-btn" data-id="' + esc(r.id) + '" aria-label="Delete">✕</button>' +
      '</div>';
    list.appendChild(li);
  });
}

function openRecipeForm(recipe) {
  state.editingRecipeId = recipe ? recipe.id : null;
  document.getElementById('recipe-form-title').textContent = recipe ? 'Edit Recipe' : 'New Recipe';
  document.getElementById('recipe-name-input').value = recipe ? recipe.name : '';
  const rows = document.getElementById('ingredient-rows');
  rows.innerHTML = '';
  const ingredients = recipe ? recipe.ingredients : [{ name: '', qty: '' }];
  ingredients.forEach((ing) => _addIngredientRow(ing.name, ing.qty));
  document.getElementById('recipe-form-overlay').classList.remove('hidden');
  document.getElementById('recipe-name-input').focus();
}

function closeRecipeForm() {
  document.getElementById('recipe-form-overlay').classList.add('hidden');
  state.editingRecipeId = null;
}

function _addIngredientRow(name, qty) {
  const rows = document.getElementById('ingredient-rows');
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML =
    '<input type="text" class="ing-name" placeholder="Ingredient" value="' + esc(name || '') + '" aria-label="Ingredient name">' +
    '<input type="text" class="ing-qty" placeholder="Qty" value="' + esc(qty || '') + '" aria-label="Quantity">' +
    '<button class="remove-ing-btn btn-icon" aria-label="Remove">✕</button>';
  rows.appendChild(div);
}

async function saveRecipe() {
  const name = document.getElementById('recipe-name-input').value.trim();
  if (!name) {
    showToast('Recipe name is required');
    document.getElementById('recipe-name-input').focus();
    return;
  }
  const ingredients = [];
  document.querySelectorAll('#ingredient-rows .ingredient-row').forEach((row) => {
    const n = row.querySelector('.ing-name').value.trim();
    const q = row.querySelector('.ing-qty').value.trim();
    if (n) ingredients.push({ name: n, qty: q });
  });

  if (state.editingRecipeId) {
    const recipe = state.recipes.find((r) => r.id === state.editingRecipeId);
    recipe.name = name;
    recipe.ingredients = ingredients;
    await DB.putRecipe(recipe);
  } else {
    const recipe = { id: crypto.randomUUID(), name: name, ingredients: ingredients, createdAt: Date.now() };
    state.recipes.push(recipe);
    await DB.putRecipe(recipe);
  }
  closeRecipeForm();
  renderRecipes();
}

async function deleteRecipe(id) {
  state.recipes = state.recipes.filter((r) => r.id !== id);
  await DB.deleteRecipe(id);
  for (let day = 0; day < 7; day++) {
    const entry = state.weekMenu[day];
    if (entry && entry.recipeId === id) {
      const cleared = { day: day, recipeId: null, recipeName: null };
      state.weekMenu[day] = cleared;
      await DB.putWeekDay(cleared);
    }
  }
  renderRecipes();
}

function openIngredientModal(recipeId) {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  if (!recipe) return;
  const checklist = document.getElementById('ingredient-checklist');
  checklist.innerHTML = '';
  recipe.ingredients.forEach((ing) => {
    const li = document.createElement('li');
    li.innerHTML =
      '<label class="check-label">' +
        '<input type="checkbox" checked data-name="' + esc(ing.name) + '" data-qty="' + esc(ing.qty) + '">' +
        '<span>' + esc(ing.name) + (ing.qty ? ' <em>' + esc(ing.qty) + '</em>' : '') + '</span>' +
      '</label>';
    checklist.appendChild(li);
  });
  document.getElementById('modal-recipe-title').textContent = recipe.name;
  document.getElementById('ingredient-modal-overlay').classList.remove('hidden');
}

function closeIngredientModal() {
  document.getElementById('ingredient-modal-overlay').classList.add('hidden');
}

async function addSelectedIngredients() {
  const checks = document.querySelectorAll('#ingredient-checklist input[type=checkbox]:checked');
  let added = 0, merged = 0;
  for (const cb of checks) {
    const result = await addItem(cb.dataset.name, cb.dataset.qty, { silent: true });
    if (result === 'added') added++;
    else if (result === 'merged') merged++;
  }
  closeIngredientModal();
  const parts = [];
  if (added > 0) parts.push(added + ' added');
  if (merged > 0) parts.push(merged + ' merged');
  if (parts.length > 0) { showToast(parts.join(', ') + ' to shopping list'); switchTab('shopping'); }
}

// ─── Week Menu ────────────────────────────────────────────────────────────────

function renderWeekMenu() {
  const list = document.getElementById('week-list');
  list.innerHTML = '';
  DAYS.forEach((dayName, i) => {
    const entry = state.weekMenu[i];
    const li = document.createElement('li');
    li.className = 'week-row';
    const options = state.recipes.map((r) =>
      '<option value="' + esc(r.id) + '"' + (entry && entry.recipeId === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'
    ).join('');
    li.innerHTML =
      '<span class="day-label">' + dayName + '</span>' +
      '<select class="recipe-select" data-day="' + i + '" aria-label="Recipe for ' + dayName + '">' +
        '<option value="">— none —</option>' + options +
      '</select>' +
      '<button class="btn-icon clear-day-btn" data-day="' + i + '" aria-label="Clear ' + dayName + '">✕</button>';
    list.appendChild(li);
  });
}

async function setWeekDay(day, recipeId) {
  const recipe = recipeId ? state.recipes.find((r) => r.id === recipeId) : null;
  const entry = { day: day, recipeId: recipe ? recipe.id : null, recipeName: recipe ? recipe.name : null };
  state.weekMenu[day] = entry;
  await DB.putWeekDay(entry);
}

async function clearWeekDay(day) {
  const entry = { day: day, recipeId: null, recipeName: null };
  state.weekMenu[day] = entry;
  await DB.putWeekDay(entry);
  renderWeekMenu();
}

async function addWeekIngredients() {
  let added = 0, merged = 0;
  for (let day = 0; day < 7; day++) {
    const entry = state.weekMenu[day];
    if (!entry || !entry.recipeId) continue;
    const recipe = state.recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const result = await addItem(ing.name, ing.qty, { silent: true });
      if (result === 'added') added++;
      else if (result === 'merged') merged++;
    }
  }
  if (added + merged === 0) { showToast('No ingredients to add — assign recipes to days first'); return; }
  const parts = [];
  if (added > 0) parts.push(added + ' added');
  if (merged > 0) parts.push(merged + ' merged');
  showToast(parts.join(', ') + ' to shopping list');
  switchTab('shopping');
}

// ─── Events ───────────────────────────────────────────────────────────────────

function initEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Refresh / sync button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');
    btn.disabled = true;
    const remote = await Sync.fetchAll();
    if (remote) {
      await Promise.all([
        ...(remote.items.map((i)   => _put('items',   i))),
        ...(remote.history.map((h) => _put('history', h))),
        ...(remote.recipes.map((r) => _put('recipes', r))),
        ...(remote.weekmenu.map((w) => _put('weekmenu', w))),
      ]);
      state.items   = remote.items;
      state.history = remote.history;
      state.recipes = remote.recipes;
      remote.weekmenu.forEach((e) => { state.weekMenu[e.day] = e; });
      renderShoppingList();
      showToast('List synced ✓');
    } else {
      showToast('Offline — showing cached data');
    }
    setTimeout(() => { btn.classList.remove('spinning'); btn.disabled = false; }, 400);
  });

  // Shopping list
  const addNameEl = document.getElementById('add-name');
  const addQtyEl  = document.getElementById('add-qty');

  async function handleAdd() {
    await addItem(addNameEl.value, addQtyEl.value);
    addNameEl.value = '';
    addQtyEl.value = '';
    addNameEl.focus();
  }

  document.getElementById('add-btn').addEventListener('click', handleAdd);
  addNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addQtyEl.focus(); });
  addQtyEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });

  const shopList = document.getElementById('shopping-list');
  shopList.addEventListener('click', async (e) => {
    const row = e.target.closest('.item-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.classList.contains('check-btn')) await toggleCheck(id);
    else if (e.target.classList.contains('delete-btn')) await deleteItem(id);
  });
  shopList.addEventListener('change', async (e) => {
    const row = e.target.closest('.item-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.classList.contains('item-name')) await updateItemField(id, 'name', e.target.value);
    else if (e.target.classList.contains('item-qty')) await updateItemField(id, 'qty', e.target.value);
  });

  document.getElementById('clear-checked-btn').addEventListener('click', clearChecked);
  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (state.items.length === 0) return;
    if (await showConfirm('Clear all items from the list?')) await clearAllItems();
  });

  // History
  document.getElementById('history-search').addEventListener('input', (e) => renderHistory(e.target.value));
  document.getElementById('history-list').addEventListener('click', async (e) => {
    if (e.target.classList.contains('readd-btn')) await reAddFromHistory(e.target.dataset.key);
  });
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (state.history.length === 0) return;
    if (await showConfirm('Clear all history? This cannot be undone.')) await clearHistory();
  });

  // Recipes
  document.getElementById('new-recipe-btn').addEventListener('click', () => openRecipeForm(null));
  document.getElementById('recipe-list').addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('add-recipe-btn')) openIngredientModal(id);
    else if (e.target.classList.contains('edit-recipe-btn')) {
      const recipe = state.recipes.find((r) => r.id === id);
      if (recipe) openRecipeForm(recipe);
    } else if (e.target.classList.contains('del-recipe-btn')) {
      if (await showConfirm('Delete this recipe?')) await deleteRecipe(id);
    }
  });
  document.getElementById('add-ingredient-btn').addEventListener('click', () => _addIngredientRow('', ''));
  document.getElementById('ingredient-rows').addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-ing-btn')) {
      const rows = document.querySelectorAll('#ingredient-rows .ingredient-row');
      if (rows.length > 1) e.target.closest('.ingredient-row').remove();
    }
  });
  document.getElementById('save-recipe-btn').addEventListener('click', saveRecipe);
  document.getElementById('cancel-recipe-btn').addEventListener('click', closeRecipeForm);
  document.getElementById('recipe-form-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRecipeForm();
  });

  // Ingredient modal
  document.getElementById('add-ingredients-btn').addEventListener('click', addSelectedIngredients);
  document.getElementById('cancel-ingredients-btn').addEventListener('click', closeIngredientModal);
  document.getElementById('ingredient-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeIngredientModal();
  });

  // Week menu
  document.getElementById('week-list').addEventListener('change', async (e) => {
    if (e.target.classList.contains('recipe-select')) {
      await setWeekDay(parseInt(e.target.dataset.day), e.target.value);
    }
  });
  document.getElementById('week-list').addEventListener('click', async (e) => {
    if (e.target.classList.contains('clear-day-btn')) {
      await clearWeekDay(parseInt(e.target.dataset.day));
    }
  });
  document.getElementById('add-week-btn').addEventListener('click', addWeekIngredients);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  Sync.init();
  await openDB();

  // Read local data first
  const [localItems, localHistory, localRecipes, localWeek] = await Promise.all([
    _getAll('items'), _getAll('history'), _getAll('recipes'), _getAll('weekmenu'),
  ]);

  // Try Supabase
  const remote = await Sync.fetchAll();

  if (remote) {
    // If Supabase is empty but we have local data → migrate it up
    if (remote.items.length === 0 && localItems.length > 0) {
      await Promise.all([
        ...localItems.map((i)   => _sb_upsert('items',   i)),
        ...localHistory.map((h) => _sb_upsert('history', h)),
        ...localRecipes.map((r) => _sb_upsert('recipes', r)),
        ...localWeek.map((w)    => _sb_upsert('weekmenu', w)),
      ]);
      // Re-fetch after migration
      const migrated = await Sync.fetchAll();
      if (migrated) {
        state.items   = migrated.items;
        state.history = migrated.history;
        state.recipes = migrated.recipes;
        migrated.weekmenu.forEach((e) => { state.weekMenu[e.day] = e; });
      }
    } else {
      // Seed local IndexedDB from Supabase so offline works
      await Promise.all([
        ...(remote.items.map((i)   => _put('items',   i))),
        ...(remote.history.map((h) => _put('history', h))),
        ...(remote.recipes.map((r) => _put('recipes', r))),
        ...(remote.weekmenu.map((w) => _put('weekmenu', w))),
      ]);
      state.items   = remote.items;
      state.history = remote.history;
      state.recipes = remote.recipes;
      remote.weekmenu.forEach((e) => { state.weekMenu[e.day] = e; });
    }
  } else {
    // Offline — use local IndexedDB
    state.items   = localItems;
    state.history = localHistory;
    state.recipes = localRecipes;
    localWeek.forEach((e) => { state.weekMenu[e.day] = e; });
  }

  renderShoppingList();
  initEvents();
  initSortable();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

function initSortable() {
  const list = document.getElementById('shopping-list');
  Sortable.create(list, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'item-ghost',
    chosenClass: 'item-chosen',
    dragClass: 'item-dragging',
    // Only allow dragging unchecked items above checked ones
    onEnd: async (evt) => {
      // Read the new order from the DOM, assign sortOrder
      const rows = list.querySelectorAll('.item-row');
      const updates = [];
      rows.forEach((row, index) => {
        const item = state.items.find((i) => i.id === row.dataset.id);
        if (item) {
          item.sortOrder = index;
          updates.push(DB.putItem(item));
        }
      });
      await Promise.all(updates);
      // Re-render to enforce checked-to-bottom rule
      renderShoppingList();
    },
  });
}

init();
