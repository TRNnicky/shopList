// db.js — all IndexedDB operations for shopList
// Must be loaded before app.js

const DB_NAME = 'shoplist';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('recipes')) {
        const recipes = db.createObjectStore('recipes', { keyPath: 'id' });
        recipes.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('weekmenu')) {
        db.createObjectStore('weekmenu', { keyPath: 'day' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

function _tx(storeName, mode) {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function _getAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = _tx(storeName, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _put(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = _tx(storeName, 'readwrite').put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _delete(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = _tx(storeName, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _clear(storeName) {
  return new Promise((resolve, reject) => {
    const req = _tx(storeName, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _get(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = _tx(storeName, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  // Items — { id, name, qty, checked, createdAt, sortOrder }
  getItems: () => _getAll('items'),
  async putItem(item) {
    await _put('items', item);
    Sync.upsertItem(item);
  },
  async deleteItem(id) {
    await _delete('items', id);
    Sync.deleteItem(id);
  },
  async clearItems() {
    await _clear('items');
    Sync.clearItems();
  },

  // History — { key (lowercase), displayName, lastUsed, count }
  getHistory: () => _getAll('history'),
  async putHistory(entry) {
    await _put('history', entry);
    Sync.upsertHistory(entry);
  },
  async clearHistory() {
    await _clear('history');
    Sync.clearHistory();
  },

  async recordHistory(name) {
    const key = name.trim().toLowerCase();
    const existing = await _get('history', key);
    const entry = existing || { key, displayName: name.trim(), lastUsed: 0, count: 0 };
    entry.displayName = name.trim();
    entry.lastUsed = Date.now();
    entry.count = (entry.count || 0) + 1;
    await _put('history', entry);
    Sync.upsertHistory(entry);
    return entry;
  },

  // Recipes — { id, name, ingredients: [{name, qty}], createdAt }
  getRecipes: () => _getAll('recipes'),
  async putRecipe(recipe) {
    await _put('recipes', recipe);
    Sync.upsertRecipe(recipe);
  },
  async deleteRecipe(id) {
    await _delete('recipes', id);
    Sync.deleteRecipe(id);
  },

  // Week menu — { day (0=Mon..6=Sun), recipeId, recipeName }
  getWeekMenu: () => _getAll('weekmenu'),
  async putWeekDay(entry) {
    await _put('weekmenu', entry);
    Sync.upsertWeekDay(entry);
  },
};
