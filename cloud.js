/* The signed-in, synced book (Firebase). Replaces the device-only Store from store.js when
   firebase-config.js is filled in. The app reads everything synchronously from the copies kept
   here; Firestore listeners keep them fresh and call onChange.

   Firestore layout (firestore.rules decides who can see what):
     users/{uid}                        { name, family, familyAsked, settings {coverPortrait, coverLandscape, customTags}, importedLocal }
     users/{uid}/recipes/{id}           your copy of a recipe + origin { id, version } when it came from / went to the family
     users/{uid}/recipes/{id}/history   earlier versions of your copy
     users/{uid}/meta/book              { bookmarks [], removed [{id, title}], sections [], sectionNames {} }
     users/{uid}/photos/{pid}           { data } photos you added (a small JPEG as text)
     families/{gid}                     { name, code, members [uids], names {uid: name}, createdBy }
     families/{gid}/box/{id}            Blue Book Recipes: recipe + version, by, byName, updatedBy, updatedByName
     families/{gid}/box/{id}/history    every earlier version
     families/{gid}/photos/{pid}        { data, by } photos on shared recipes
     codes/{CODE}                       { gid } */
(function () {
  if (typeof firebaseConfig === 'undefined' || /PASTE/.test(firebaseConfig.apiKey)) return;
  // Set up for sign-in, but the sign-in code couldn't load (first time opening with no internet).
  if (typeof firebase === 'undefined') { window.BB_NEEDS_INTERNET = true; return; }
  const Local = window.Store, LocalPhotos = window.Photos;

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(), db = firebase.firestore(), FV = firebase.firestore.FieldValue;
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  const FIELDS = ['title', 'from', 'section', 'sectionName', 'story', 'serves', 'makes', 'est', 'prep', 'cook', 'ready', 'layout',
    'ing', 'steps', 'notes', 'tags', 'rating', 'difficulty', 'source', 'tools', 'photo', 'ink'];
  const content = r => { const o = {}; for (const k of FIELDS) if (r[k] !== undefined && r[k] !== null && r[k] !== '') o[k] = r[k]; return o; };
  const same = (a, b) => JSON.stringify(content(a)) === JSON.stringify(content(b));
  const clone = o => JSON.parse(JSON.stringify(o));
  const now = () => Date.now();
  const base = {};
  BB.recipes.forEach((r, i) => { base[r.id] = Object.assign({ order: i }, r); });

  let user = null, profile = null, meta = null, recipes = {}, family = null, box = {};
  let loaded = { profile: false, recipes: false, meta: false, family: true, box: true };
  let subs = [], famSubs = [], famId = null, onChange = () => {}, authCb = () => {}, emitT = null;
  const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => onChange(), 30); };

  const U = () => db.collection('users').doc(user.uid);
  const R = id => U().collection('recipes').doc(id);
  const M = () => U().collection('meta').doc('book');
  const F = () => db.collection('families').doc(famId);
  const B = id => F().collection('box').doc(id);
  const myName = () => (profile && profile.name) || (user && user.displayName) || 'Someone';
  const sectionName = id => (Store.sections().find(s => s.id === id) || {}).name;

  /* ---------- live data ---------- */
  function stop() { subs.forEach(f => f()); subs = []; stopFamily(); }
  function stopFamily() { famSubs.forEach(f => f()); famSubs = []; famId = null; family = null; box = {}; loaded.family = loaded.box = true; }
  function start() {
    stop();
    loaded = { profile: false, recipes: false, meta: false, family: true, box: true };
    subs.push(U().onSnapshot(s => {
      profile = s.exists ? s.data() : null;
      loaded.profile = true;
      if (!s.exists && !s.metadata.fromCache) firstTime();
      if (profile && profile.family !== famId) watchFamily(profile.family || null);
      emit();
    }, err));
    subs.push(U().collection('recipes').onSnapshot(s => {
      recipes = {}; s.docs.forEach(d => { recipes[d.id] = Object.assign({ id: d.id }, d.data()); });
      loaded.recipes = true; emit();
    }, err));
    subs.push(M().onSnapshot(s => { meta = s.exists ? s.data() : {}; loaded.meta = true; emit(); }, err));
  }
  function watchFamily(gid) {
    stopFamily();
    if (!gid) return emit();
    famId = gid; loaded.family = loaded.box = false;
    famSubs.push(F().onSnapshot(s => { family = s.exists ? Object.assign({ id: s.id }, s.data()) : null; loaded.family = true; emit(); },
      e => { console.warn('family', e.code); family = null; loaded.family = loaded.box = true; emit(); }));
    famSubs.push(F().collection('box').onSnapshot(s => {
      box = {}; s.docs.forEach(d => { box[d.id] = Object.assign({ id: d.id }, d.data()); });
      loaded.box = true; emit();
    }, e => { console.warn('box', e.code); loaded.box = true; emit(); }));
  }
  const err = e => console.warn('Blue Book sync', e.code || e);

  // A brand-new account: make the profile and fill the book with Mom's Blue Book.
  let seeding = false;
  async function firstTime() {
    if (seeding) return; seeding = true;
    const batch = db.batch();
    batch.set(U(), { name: user.displayName || '', created: now(), settings: {} }, { merge: true });
    batch.set(M(), { bookmarks: [], removed: [], sections: [], sectionNames: {} }, { merge: true });
    for (const id in base) batch.set(R(id), Object.assign(content(base[id]), { origin: { id, version: 1 }, order: base[id].order, created: now() }));
    await batch.commit().catch(err);
    seeding = false;
  }

  const decorate = r => Object.assign(clone(r), {
    blueBook: !!base[(r.origin || {}).id || r.id],
    edited: !!r.edited,
    shared: !!(r.origin && box[r.origin.id]),
  });
  const decorateBox = b => Object.assign(clone(b), { box: true, blueBook: b.by === 'bluebook' });

  const Store = {
    mode: 'cloud',
    init(cb) { onChange = cb; },
    onAuth(cb) { authCb = cb; },
    user: () => user && { uid: user.uid, email: user.email, name: myName() },
    profile: () => profile,
    needsFamilyChoice: () => !!profile && !profile.family && !profile.familyAsked,

    /* ---------- account ---------- */
    async signUp(name, email, password) {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      return cred.user;
    },
    signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
    resetPassword: email => auth.sendPasswordResetEmail(email),
    signOut() { stop(); return auth.signOut(); },

    /* ---------- my book ---------- */
    all: () => Object.values(recipes).map(decorate),
    get: id => recipes[id] ? decorate(recipes[id]) : null,
    original: id => base[id] ? clone(base[id]) : null,
    newId(title) {
      const slug = (title || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recipe';
      let id = slug, n = 2;
      while (base[id] || recipes[id] || box[id]) id = `${slug}-${n++}`;
      return id;
    },
    save(r, { edited = true } = {}) {
      const prev = recipes[r.id];
      const doc = Object.assign(content(r), {
        origin: r.origin || (prev && prev.origin) || null, order: r.order ?? (prev && prev.order) ?? null,
        created: (prev && prev.created) || r.created || now(), updated: now(), edited,
      });
      doc.sectionName = sectionName(doc.section) || doc.sectionName || null;
      const batch = db.batch();
      if (prev) batch.set(R(r.id).collection('history').doc(), { recipe: content(prev), at: now(), by: user.uid, byName: myName() });
      batch.set(R(r.id), doc);
      batch.commit().catch(err);
      return r.id;
    },
    // Handwriting saves often, so it skips History (it has its own Undo while you write).
    saveInk(id, ink) { if (recipes[id]) R(id).update({ ink, updated: now() }).catch(err); },
    // "Go back to Mom's original" for one of her recipes.
    restore(id) {
      const r = recipes[id], o = base[(r && r.origin && r.origin.id) || id];
      if (!o) return;
      Store.save(Object.assign({}, content(o), { id, origin: r && r.origin, order: o.order }), { edited: false });
    },
    remove(id) {
      const r = recipes[id]; if (!r) return;
      const back = r.origin && (box[r.origin.id] || base[r.origin.id]);
      const batch = db.batch();
      batch.delete(R(id));
      const upd = { bookmarks: FV.arrayRemove(id) };
      if (back) upd.removed = FV.arrayUnion({ id: r.origin.id, title: r.title });
      batch.set(M(), upd, { merge: true });
      batch.commit().catch(err);
    },
    removed: () => ((meta && meta.removed) || []).filter(x => !Store.mine(x.id)).map(x => Object.assign({}, base[x.id] || box[x.id] || {}, x)),
    putBack(id) {
      const entry = ((meta && meta.removed) || []).find(x => x.id === id);
      if (box[id]) Store.addFromBox(id);
      else if (base[id]) {
        const o = base[id];
        R(Store.mine(id) ? Store.newId(o.title) : id).set(Object.assign(content(o), { origin: { id, version: 1 }, order: o.order, created: now() })).catch(err);
      }
      if (entry) M().set({ removed: FV.arrayRemove(entry) }, { merge: true }).catch(err);
    },
    // My copy of a family recipe, if I have one.
    mine: originId => Object.values(recipes).find(r => (r.origin && r.origin.id === originId)) || null,

    sections() {
      const m = meta || {}, names = m.sectionNames || {};
      return BB.sections.map(s => Object.assign({}, s, names[s.id] ? { name: names[s.id], short: names[s.id] } : {}))
        .concat((m.sections || []).map(s => Object.assign({ custom: true }, s)));
    },
    addSection(name) {
      const colors = ['sage', 'terracotta', 'rose', 'blue', 'mustard', 'deep'];
      const id = 'my-' + now().toString(36);
      const list = ((meta && meta.sections) || []).concat({ id, name, tab: name.length > 9 ? name.slice(0, 8) + '…' : name, color: colors[((meta && meta.sections) || []).length % colors.length] });
      meta = Object.assign({}, meta, { sections: list });
      M().set({ sections: list }, { merge: true }).catch(err);
      return id;
    },
    renameSection(id, name) {
      const list = ((meta && meta.sections) || []).map(s => s.id === id ? Object.assign({}, s, { name, tab: name.length > 9 ? name.slice(0, 8) + '…' : name }) : s);
      if (list.some(s => s.id === id)) M().set({ sections: list }, { merge: true }).catch(err);
      else M().set({ sectionNames: { [id]: name } }, { merge: true }).catch(err);
    },
    deleteSection(id) { M().set({ sections: ((meta && meta.sections) || []).filter(s => s.id !== id) }, { merge: true }).catch(err); },

    isBookmarked: id => ((meta && meta.bookmarks) || []).includes(id),
    toggleBookmark(id) {
      const on = !Store.isBookmarked(id);
      const list = on ? [id].concat((meta && meta.bookmarks) || []) : ((meta && meta.bookmarks) || []).filter(b => b !== id);
      meta = Object.assign({}, meta, { bookmarks: list });
      M().set({ bookmarks: list }, { merge: true }).catch(err);
      return on;
    },
    bookmarks: () => ((meta && meta.bookmarks) || []).slice(),

    settings: () => Object.assign({}, (profile && profile.settings) || {}, { name: myName() }),
    setSetting(k, v) {
      if (k === 'name') {
        U().set({ name: v }, { merge: true }).catch(err);
        if (family) F().update({ ['names.' + user.uid]: v || 'Someone' }).catch(err);
        return;
      }
      U().set({ settings: { [k]: v === null ? FV.delete() : v } }, { merge: true }).catch(err);
    },
    tags() {
      const set = new Set(BB.builtInTags);
      Object.values(recipes).forEach(r => (r.tags || []).forEach(t => set.add(t)));
      (((profile && profile.settings) || {}).customTags || []).forEach(t => set.add(t));
      return [...set];
    },

    /* ---------- the family ---------- */
    family: () => family,
    async createFamily(name) {
      const gid = db.collection('families').doc().id, code = newCode();
      const batch = db.batch();
      batch.set(db.collection('families').doc(gid), { name: name || 'Our Family', code, members: [user.uid], names: { [user.uid]: myName() }, createdBy: user.uid, created: now() });
      batch.set(db.collection('codes').doc(code), { gid });
      batch.set(U(), { family: gid }, { merge: true });
      await batch.commit();
      // Fill Blue Book Recipes with Mom's book (a separate write, once the family exists).
      const seed = db.batch();
      const box0 = db.collection('families').doc(gid).collection('box');
      for (const id in base) seed.set(box0.doc(id), Object.assign(content(base[id]), {
        order: base[id].order, version: 1, by: 'bluebook', byName: 'Mom’s Blue Book', updatedBy: 'bluebook', updatedByName: 'Mom’s Blue Book', created: now(), updated: now(),
      }));
      await seed.commit();
      return code;
    },
    async joinFamily(code) {
      code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const c = await db.collection('codes').doc(code).get();
      if (!c.exists) throw new Error('nocode');
      const gid = c.data().gid;
      await db.collection('families').doc(gid).update({ members: FV.arrayUnion(user.uid), ['names.' + user.uid]: myName(), joinCode: code });
      await U().set({ family: gid, familyAsked: true }, { merge: true });
    },
    async leaveFamily() {
      if (!family) return;
      await F().update({ members: FV.arrayRemove(user.uid), ['names.' + user.uid]: FV.delete() });
      await U().set({ family: null, familyAsked: true }, { merge: true });
    },
    async changeCode() {
      const code = newCode(), old = family.code;
      const batch = db.batch();
      batch.set(db.collection('codes').doc(code), { gid: famId });
      batch.update(F(), { code });
      if (old) batch.delete(db.collection('codes').doc(old));
      await batch.commit();
      return code;
    },
    renameFamily: name => F().update({ name }),
    skipFamily: () => U().set({ familyAsked: true }, { merge: true }),

    /* ---------- Blue Book Recipes (the family box) ---------- */
    box: () => Object.values(box).map(decorateBox),
    boxGet: id => box[id] ? decorateBox(box[id]) : null,
    // Put my recipe in the box, or send my changes to the family version it came from.
    async share(id) {
      const r = recipes[id]; if (!r || !family) return;
      const c = content(r);
      c.photo = await Photos.toFamily(c.photo);
      c.sectionName = sectionName(r.section) || r.sectionName || null;
      if (r.origin && box[r.origin.id]) {
        const v = await Store.boxUpdate(r.origin.id, c);
        await R(id).update({ origin: { id: r.origin.id, version: v } });
        return r.origin.id;
      }
      const bid = Store.newId(r.title) + '-' + Math.random().toString(36).slice(2, 6);
      await B(bid).set(Object.assign(c, { version: 1, by: user.uid, byName: myName(), updatedBy: user.uid, updatedByName: myName(), created: now(), updated: now(), order: 1e6 + now() / 1e6 }));
      await R(id).update({ origin: { id: bid, version: 1 } });
      return bid;
    },
    // Change the family version. The old one goes into its history first.
    async boxUpdate(id, r) {
      const prev = box[id];
      const v = ((prev && prev.version) || 1) + 1;
      const c = content(r);
      c.photo = await Photos.toFamily(c.photo);
      c.sectionName = sectionName(c.section) || c.sectionName || (prev && prev.sectionName) || null;
      const batch = db.batch();
      if (prev) batch.set(B(id).collection('history').doc(), { recipe: content(prev), version: prev.version || 1, at: prev.updated || now(), by: prev.updatedBy || prev.by, byName: prev.updatedByName || prev.byName });
      batch.set(B(id), Object.assign(c, { version: v, updatedBy: user.uid, updatedByName: myName(), updated: now() }), { merge: false });
      // keep who first shared it
      batch.set(B(id), { by: (prev && prev.by) || user.uid, byName: (prev && prev.byName) || myName(), created: (prev && prev.created) || now(), order: prev ? prev.order ?? null : null }, { merge: true });
      await batch.commit();
      return v;
    },
    removeFromBox: id => B(id).delete(),
    addFromBox(id) {
      const b = box[id]; if (!b) return null;
      const myId = recipes[id] ? Store.newId(b.title) : id;
      const c = content(b);
      if (c.section && !Store.sections().some(s => s.id === c.section)) {
        const match = Store.sections().find(s => s.name === b.sectionName);
        c.section = match ? match.id : (b.sectionName ? Store.addSection(b.sectionName) : 'entrees');
      }
      R(myId).set(Object.assign(c, { origin: { id, version: b.version || 1 }, order: b.order ?? null, created: now() })).catch(err);
      const entry = ((meta && meta.removed) || []).find(x => x.id === id);
      if (entry) M().set({ removed: FV.arrayRemove(entry) }, { merge: true }).catch(err);
      return myId;
    },
    // Recipes in my book whose family version changed (by someone else) since I last looked.
    updates() {
      return Object.values(recipes).filter(r => {
        const b = r.origin && box[r.origin.id];
        return b && (b.version || 1) > (r.origin.version || 1) && b.updatedBy !== user.uid;
      }).map(r => ({ mine: decorate(r), family: decorateBox(box[r.origin.id]) }));
    },
    updateFromBox(id) {
      const r = recipes[id], b = r && r.origin && box[r.origin.id]; if (!b) return;
      const c = content(b);
      if (!Store.sections().some(s => s.id === c.section)) c.section = r.section;
      Store.save(Object.assign(c, { id, origin: { id: r.origin.id, version: b.version || 1 }, order: r.order }));
    },
    keepMine(id) {
      const r = recipes[id], b = r && r.origin && box[r.origin.id]; if (!b) return;
      R(id).update({ origin: { id: r.origin.id, version: b.version || 1 } }).catch(err);
    },
    sameAsFamily(id) { const r = recipes[id], b = r && r.origin && box[r.origin.id]; return !!b && same(r, b); },

    /* ---------- history ---------- */
    async history(kind, id) {
      const col = kind === 'box' ? B(id).collection('history') : R(id).collection('history');
      const s = await col.orderBy('at', 'desc').limit(50).get();
      return s.docs.map(d => Object.assign({ hid: d.id }, d.data()));
    },

    /* ---------- bringing over Phase 1 (this device) ---------- */
    hasLocalData: () => Local.hasLocalData() && !(profile && profile.importedLocal),
    async importLocal() {
      const L = Local.rawLocal();
      for (const id in L.edits) {
        const e = L.edits[id];
        if (e.photo && e.photo.startsWith('idb:')) e.photo = await Photos.put(await LocalPhotos.get(e.photo));
        const mineId = recipes[id] ? id : (Store.mine(id) || {}).id;
        if (mineId) Store.save(Object.assign({}, recipes[mineId], content(e), { id: mineId }));
      }
      for (const id in L.added) {
        const a = L.added[id];
        if (a.photo && a.photo.startsWith('idb:')) a.photo = await Photos.put(await LocalPhotos.get(a.photo));
        Store.save(Object.assign(content(a), { id: Store.newId(a.title) }));
      }
      const marks = [...new Set(((meta && meta.bookmarks) || []).concat(L.bookmarks || []))];
      M().set({ bookmarks: marks, sections: ((meta && meta.sections) || []).concat(L.sections || []) }, { merge: true }).catch(err);
      U().set({ importedLocal: true }, { merge: true }).catch(err);
    },
    skipImport: () => U().set({ importedLocal: true }, { merge: true }),

    reset: () => Promise.resolve(),
  };
  // "Ready" once your profile, book and (if you're in one) the family have loaded at least once.
  // False until Firebase has said whether someone is signed in on this device.
  let authKnown = false;
  Object.defineProperty(Store, 'authKnown', { get: () => authKnown });
  Object.defineProperty(Store, 'ready', { get: () => !!user && Object.values(loaded).every(Boolean) && !!profile });

  function newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = ''; for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
    return c;
  }

  /* ---------- photos ----------
     "photos/x.jpg" = Mom's pictures that ship with the app, "u:<id>" = yours, "f:<id>" = on a shared recipe. */
  const cache = {};
  const Photos = {
    async put(dataUrl) {
      if (!dataUrl) return null;
      const ref = U().collection('photos').doc();
      await ref.set({ data: dataUrl, at: now() });
      cache['u:' + ref.id] = dataUrl;
      return 'u:' + ref.id;
    },
    async get(ref) {
      if (!ref) return null;
      if (ref.startsWith('idb:')) return LocalPhotos.get(ref);
      if (!/^[uf]:/.test(ref)) return ref;
      if (cache[ref]) return cache[ref];
      try {
        const doc = ref[0] === 'u' ? U().collection('photos').doc(ref.slice(2)) : (famId ? F().collection('photos').doc(ref.slice(2)) : null);
        if (!doc) return null;
        const s = await doc.get();
        return (cache[ref] = s.exists ? s.data().data : null);
      } catch (e) { return null; }
    },
    // A photo on a recipe going to the family has to live where the family can see it.
    async toFamily(ref) {
      if (!ref || !ref.startsWith('u:') || !famId) return ref || null;
      const data = await Photos.get(ref);
      if (!data) return null;
      const doc = F().collection('photos').doc(ref.slice(2));
      await doc.set({ data, by: user.uid, at: now() });
      cache['f:' + doc.id] = data;
      return 'f:' + doc.id;
    },
    clear: () => Promise.resolve(),
  };

  auth.onAuthStateChanged(u => {
    user = u; authKnown = true;
    if (u) start(); else { stop(); profile = meta = null; recipes = {}; }
    authCb(u); emit();
  });

  window.LocalStore = Local;
  window.Store = Store;
  window.Photos = Photos;
})();
