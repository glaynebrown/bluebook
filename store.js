/* Your book, kept on this device only (localStorage, plus IndexedDB for photos).
   This is what runs when Firebase isn't set up. cloud.js replaces it with the signed-in,
   synced version and uses this one to bring over anything saved here in Phase 1. */
(function () {
  const KEY = 'bluebook-v1';
  const blank = () => ({ edits: {}, added: {}, removed: [], bookmarks: [], sections: [], settings: { name: '' } });
  let db;
  try { db = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { db = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Could not save', e); } };

  const base = {};
  BB.recipes.forEach((r, i) => { base[r.id] = Object.assign({ order: i }, r); });

  const clone = o => JSON.parse(JSON.stringify(o));
  // My own order for a list, if I've dragged things around (anything new goes to the bottom).
  const inOrder = (list, ids) => { if (!ids || !ids.length) return list; const rank = s => { const i = ids.indexOf(s.id); return i < 0 ? 1e6 + list.indexOf(s) : i; }; return list.slice().sort((a, b) => rank(a) - rank(b)); };
  const decorate = (r, blue) => Object.assign(clone(r), { blueBook: blue, edited: blue && !!db.edits[r.id] });

  const Store = {
    mode: 'local',
    ready: true,
    init(onChange) { this._cb = onChange; },
    user: () => null,
    family: () => null,
    box: () => [],
    boxGet: () => null,
    boxNew: () => [],
    boxSeen: () => 0,
    markBoxSeen() {},
    updates: () => [],
    hasLocalData: () => !!(Object.keys(db.edits).length || Object.keys(db.added).length || db.bookmarks.length || db.sections.length),
    rawLocal: () => clone(db),
    all() {
      const list = [];
      for (const id in base) if (!db.removed.includes(id)) list.push(decorate(db.edits[id] || base[id], true));
      for (const id in db.added) list.push(decorate(db.added[id], false));
      return list;
    },
    get(id) {
      if (base[id]) return db.removed.includes(id) ? null : decorate(db.edits[id] || base[id], true);
      return db.added[id] ? decorate(db.added[id], false) : null;
    },
    original: id => base[id] ? clone(base[id]) : null,
    save(r) {
      const clean = clone(r); delete clean.blueBook; delete clean.edited;
      clean.updated = Date.now();
      if (base[clean.id]) db.edits[clean.id] = clean; else db.added[clean.id] = clean;
      save(); return clean.id;
    },
    newId(title) {
      const slug = (title || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recipe';
      let id = slug, n = 2;
      while (base[id] || db.added[id]) id = `${slug}-${n++}`;
      return id;
    },
    saveInk(id, ink) { const r = Store.get(id); if (!r) return; r.ink = ink; Store.save(r); },
    restore(id) { delete db.edits[id]; save(); },
    remove(id) {
      if (base[id]) { if (!db.removed.includes(id)) db.removed.push(id); }
      else delete db.added[id];
      db.bookmarks = db.bookmarks.filter(b => b !== id);
      save();
    },
    removed: () => db.removed.map(id => base[id]).filter(Boolean).map(r => clone(r)),
    putBack(id) { db.removed = db.removed.filter(x => x !== id); save(); },

    sections() {
      const hidden = db.hiddenSections || [];
      return inOrder(BB.sections.map(s => Object.assign({}, s, (db.sectionNames || {})[s.id] ? { name: db.sectionNames[s.id], short: db.sectionNames[s.id] } : {}))
        .concat(db.sections.map(s => Object.assign({ custom: true }, s)))
        .filter(s => !hidden.includes(s.id)), db.sectionOrder);
    },
    recipeOrder: sid => (db.recipeOrder || {})[sid] || null,
    setSectionOrder(ids) { db.sectionOrder = ids; save(); },
    setRecipeOrder(sid, ids) { db.recipeOrder = Object.assign({}, db.recipeOrder, { [sid]: ids }); save(); },
    hasCustomOrder: () => !!((db.sectionOrder || []).length || Object.values(db.recipeOrder || {}).some(l => l && l.length)),
    resetOrder() { delete db.sectionOrder; delete db.recipeOrder; save(); },
    addSection(name) {
      const colors = ['sage', 'terracotta', 'rose', 'blue', 'mustard', 'deep'];
      const id = 'my-' + Date.now().toString(36);
      db.sections.push({ id, name, tab: name.length > 9 ? name.slice(0, 8) + '…' : name, color: colors[db.sections.length % colors.length] });
      save(); return id;
    },
    renameSection(id, name) {
      const mine = db.sections.find(s => s.id === id);
      if (mine) { mine.name = name; mine.tab = name.length > 9 ? name.slice(0, 8) + '…' : name; }
      else { db.sectionNames = db.sectionNames || {}; db.sectionNames[id] = name; }
      save();
    },
    deleteSection(id) { db.sections = db.sections.filter(s => s.id !== id); save(); },

    isBookmarked: id => db.bookmarks.includes(id),
    toggleBookmark(id) {
      db.bookmarks = db.bookmarks.includes(id) ? db.bookmarks.filter(b => b !== id) : [id].concat(db.bookmarks);
      save(); return db.bookmarks.includes(id);
    },
    bookmarks: () => db.bookmarks.slice(),

    settings: () => Object.assign({}, db.settings),
    setSetting(k, v) { if (v === null) delete db.settings[k]; else db.settings[k] = v; save(); },

    tags() {
      const set = new Set(BB.builtInTags);
      Store.all().forEach(r => (r.tags || []).forEach(t => set.add(t)));
      (db.settings.customTags || []).forEach(t => set.add(t));
      return [...set];
    },

    reset() { db = blank(); save(); return Photos.clear(); },
  };

  /* Photos you add (recipe pictures, your own cover) live in IndexedDB, since they're too big for localStorage.
     A recipe's photo is either a file path ("photos/goulash.jpg") or "idb:<key>". */
  const Photos = {
    _db: null,
    open() {
      if (this._db) return this._db;
      this._db = new Promise((res, rej) => {
        const req = indexedDB.open('bluebook-photos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return this._db;
    },
    async put(dataUrl) {
      const key = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const d = await this.open();
      await new Promise((res, rej) => { const t = d.transaction('photos', 'readwrite'); t.objectStore('photos').put(dataUrl, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
      return 'idb:' + key;
    },
    async get(ref) {
      if (!ref) return null;
      if (!ref.startsWith('idb:')) return ref;
      try {
        const d = await this.open();
        return await new Promise(res => { const r = d.transaction('photos').objectStore('photos').get(ref.slice(4)); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
      } catch (e) { return null; }
    },
    async clear() {
      try { const d = await this.open(); await new Promise(res => { const t = d.transaction('photos', 'readwrite'); t.objectStore('photos').clear(); t.oncomplete = res; t.onerror = res; }); } catch (e) {}
    },
  };

  window.Store = Store;
  window.Photos = Photos;
})();
