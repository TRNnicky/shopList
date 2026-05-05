// sync.js — Supabase sync layer
// Loaded after supabase.min.js, before app.js

const SUPABASE_URL = 'https://icxurokkewksnszikmcz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeHVyb2trZXdrc25zemlrbWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjUzMDYsImV4cCI6MjA5MzU0MTMwNn0.bf35QjL7aSXrItoKBLOUe4CMtWElU1ClWfrVmzY3NNE';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Silent error handler — sync failures should never crash the app
function _sbErr(label, err) {
  if (err) console.warn('[sync]', label, err.message || err);
}

const Sync = {
  online: navigator.onLine,

  init() {
    window.addEventListener('online',  () => { Sync.online = true;  });
    window.addEventListener('offline', () => { Sync.online = false; });
  },

  // ── Fetch all on startup ──────────────────────────────────────────────────

  async fetchAll() {
    if (!Sync.online) return null;
    try {
      const [items, history, recipes, weekmenu] = await Promise.all([
        _sb.from('items').select('*'),
        _sb.from('history').select('*'),
        _sb.from('recipes').select('*'),
        _sb.from('weekmenu').select('*'),
      ]);
      return {
        items:    items.data    || [],
        history:  history.data  || [],
        recipes:  recipes.data  || [],
        weekmenu: weekmenu.data || [],
      };
    } catch (e) {
      _sbErr('fetchAll', e);
      return null;
    }
  },

  // ── Items ─────────────────────────────────────────────────────────────────

  async upsertItem(item) {
    if (!Sync.online) return;
    const { error } = await _sb.from('items').upsert(item);
    _sbErr('upsertItem', error);
  },

  async deleteItem(id) {
    if (!Sync.online) return;
    const { error } = await _sb.from('items').delete().eq('id', id);
    _sbErr('deleteItem', error);
  },

  async clearItems() {
    if (!Sync.online) return;
    const { error } = await _sb.from('items').delete().neq('id', '');
    _sbErr('clearItems', error);
  },

  // ── History ───────────────────────────────────────────────────────────────

  async upsertHistory(entry) {
    if (!Sync.online) return;
    const { error } = await _sb.from('history').upsert(entry);
    _sbErr('upsertHistory', error);
  },

  async clearHistory() {
    if (!Sync.online) return;
    const { error } = await _sb.from('history').delete().neq('key', '');
    _sbErr('clearHistory', error);
  },

  // ── Recipes ───────────────────────────────────────────────────────────────

  async upsertRecipe(recipe) {
    if (!Sync.online) return;
    const { error } = await _sb.from('recipes').upsert(recipe);
    _sbErr('upsertRecipe', error);
  },

  async deleteRecipe(id) {
    if (!Sync.online) return;
    const { error } = await _sb.from('recipes').delete().eq('id', id);
    _sbErr('deleteRecipe', error);
  },

  // ── Week menu ─────────────────────────────────────────────────────────────

  async upsertWeekDay(entry) {
    if (!Sync.online) return;
    const { error } = await _sb.from('weekmenu').upsert(entry);
    _sbErr('upsertWeekDay', error);
  },
};
