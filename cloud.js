/* The signed-in, synced book (Firebase). Replaces the device-only Store from store.js when
   firebase-config.js is filled in. The app reads everything synchronously from the copies kept
   here; Firestore listeners keep them fresh and call onChange.

   Firestore layout (firestore.rules decides who can see what):
     users/{uid}                        { name, family, household, settings {design, covers, customTags}, boxSeen, importedLocal }
                                        (+ needsSeed / moving / joiningHH / leavingTo while one of those is partway done)
     households/{hid}                   { members [uids], names {uid: name}, created } — the people sharing one book
     households/{hid}/recipes/{id}      the household's copy of a recipe + origin { id, version } when it came from / went to the family
     households/{hid}/recipes/{id}/history   earlier versions
     households/{hid}/meta/book         { bookmarks [], removed [{id, title}], sections [], sectionNames {} }
     households/{hid}/photos/{pid}      { data } photos added in the book (a small JPEG as text)
     invites/{uid}                      { hid, by, byName, names, at } — someone asked you to share their household's book
     users/{uid}/recipes|meta|photos    where each book lived before households (kept as a backup; copied in once)
     families/{gid}                     { name, code, members [uids], names {uid: name}, createdBy }
     families/{gid}/box/{id}            Blue Book Recipes: recipe + version, by, byName, updatedBy, updatedByName
     families/{gid}/box/{id}/history    every earlier version
     families/{gid}/photos/{pid}        { data, by } photos on shared recipes
     codes/{CODE}                       { gid }
   Everyone in the app is the one family: signing up needs the family code, and your book only opens once you're in. */
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
  // My own order for a list, if I've dragged things around (anything new goes to the bottom).
  const inOrder = (list, ids) => {
    if (!ids || !ids.length) return list;
    const rank = s => {
      const i = ids.indexOf(s.id); if (i >= 0) return i;
      const k = list.indexOf(s), next = list.slice(k + 1).find(x => ids.includes(x.id));
      return next ? ids.indexOf(next.id) - 0.5 + k / 1e4 : 1e6 + k;
    };
    return list.slice().sort((a, b) => rank(a) - rank(b));
  };
  const base = {};
  BB.recipes.forEach((r, i) => { base[r.id] = Object.assign({ order: i }, r); });

  let user = null, profile = null, meta = null, recipes = {}, family = null, box = {}, household = null, invite = null, sentInvites = [];
  let loaded = { profile: false, recipes: false, meta: false, household: false, family: true, box: true };
  let subs = [], bookSubs = [], famSubs = [], famId = null, hhId = null, onChange = () => {}, authCb = () => {}, emitT = null;
  let joining = null; // { gid, code } while a new account joins the family it signed up with
  const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => onChange(), 30); };

  const U = () => db.collection('users').doc(user.uid);
  const HH = id => db.collection('households').doc(id);
  const H = () => HH(hhId);
  const R = id => H().collection('recipes').doc(id);
  const M = () => H().collection('meta').doc('book');
  const F = () => db.collection('families').doc(famId);
  const B = id => F().collection('box').doc(id);
  const myName = () => (profile && profile.name) || (user && user.displayName) || 'Someone';
  const sectionName = id => (Store.sections().find(s => s.id === id) || {}).name;

  /* ---------- live data ---------- */
  function stop() { subs.forEach(f => f()); subs = []; stopBook(); stopFamily(); }
  function stopBook() { bookSubs.forEach(f => f()); bookSubs = []; hhId = null; household = null; }
  function stopFamily() { famSubs.forEach(f => f()); famSubs = []; famId = null; family = null; box = {}; loaded.family = loaded.box = true; }
  function start() {
    stop();
    loaded = { profile: false, recipes: false, meta: false, household: false, family: true, box: true };
    // Metadata changes too, so the family and book only start listening once joining has really saved
    // (the database won't let you read them a moment before).
    let shown = null; // redraw only when the profile itself changed, not on "saved" / "from the server" signals
    subs.push(U().onSnapshot({ includeMetadataChanges: true }, s => {
      profile = s.exists ? s.data() : null;
      const snap = JSON.stringify(profile), changed = snap !== shown || !loaded.profile; shown = snap;
      loaded.profile = true;
      const saved = !s.metadata.fromCache && !s.metadata.hasPendingWrites;
      if (!s.exists && saved && joining) enter(joining.gid, joining.code).catch(err);
      if (profile && profile.family !== famId && !s.metadata.hasPendingWrites) watchFamily(profile.family || null);
      if (profile && profile.family && saved) {
        if (profile.needsSeed) seed();
        else if (!profile.household || profile.moving) moveIn();
        else if (profile.joiningHH) finishJoin();
        else if (profile.leavingTo) finishLeave();
      }
      const hid = profile && profile.family && !profile.needsSeed && !profile.moving ? profile.household || null : null;
      if (hid !== hhId && !s.metadata.hasPendingWrites) startBook(hid);
      if (changed) emit();
    }, e => { err(e); loaded.profile = true; emit(); }));
    // Invites: only redraw if there's something new (usually there's nothing at all).
    subs.push(db.collection('invites').doc(user.uid).onSnapshot(s => {
      const v = s.exists ? s.data() : null; if (JSON.stringify(v) === JSON.stringify(invite)) return; invite = v; emit();
    }, () => {}));
    subs.push(db.collection('invites').where('by', '==', user.uid).onSnapshot(s => {
      const v = s.docs.map(d => Object.assign({ uid: d.id }, d.data())); if (JSON.stringify(v) === JSON.stringify(sentInvites)) return; sentInvites = v; emit();
    }, () => {}));
  }
  // The household's book can only be read once you're in the family and the household, so it starts listening then.
  function startBook(hid) {
    stopBook();
    recipes = {}; meta = null;
    loaded.recipes = loaded.meta = loaded.household = !hid;
    if (!hid) return;
    hhId = hid;
    const fail = k => e => { err(e); loaded[k] = true; emit(); };
    bookSubs.push(H().onSnapshot(s => { household = s.exists ? Object.assign({ id: s.id }, s.data()) : null; loaded.household = true; emit(); }, fail('household')));
    bookSubs.push(H().collection('recipes').onSnapshot(s => {
      recipes = {}; s.docs.forEach(d => { recipes[d.id] = Object.assign({ id: d.id }, d.data()); });
      loaded.recipes = true; emit();
      if (!s.metadata.fromCache) onePan(recipes, R);
    }, fail('recipes')));
    bookSubs.push(M().onSnapshot(s => { meta = s.exists ? s.data() : {}; loaded.meta = true; emit(); }, fail('meta')));
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
      if (!s.metadata.fromCache) onePan(box, B);
    }, e => { console.warn('box', e.code); loaded.box = true; emit(); }));
  }
  const err = e => console.warn('Blue Book sync', e.code || e);

  // 2026-10-15: cakes and other one-pan desserts count as "Makes 1 cake/mold/pan" instead of servings.
  // Books (and the family's versions) made before then still have the old number; switch them once,
  // unless someone already changed it themselves.
  const ONE_PAN = { 'banana-spice-cake': ['cake', 12], 'lemon-poppyseed-cake': ['cake', 12], 'chocolate-sheet-cake': ['cake', 24], 'pb-sheet-cake': ['cake', 24],
    'lime-jello-mold': ['mold', 12], 'apple-betty': ['pan', 6], 'rice-krispie-treats': ['pan', 20] };
  // Same day: shorter "Makes" words — "medium loaf/loaves" → "loaf/loaves", and grilled cheese just "Serves 5".
  const RENAME = { 'ida-banana-bread': ['medium loaf', 'loaf'], 'diana-banana-bread': ['medium loaves', 'loaves'], 'grilled-cheese': ['sandwiches', null] };
  const fixed = new Set();
  function onePan(list, ref) {
    for (const id in ONE_PAN) {
      const r = list[id], [unit, old] = ONE_PAN[id];
      if (!r || fixed.has(ref(id).path) || r.serves !== old || (r.makes && r.makes !== 'treats')) continue;
      fixed.add(ref(id).path);
      ref(id).update({ serves: 1, makes: unit, est: false }).catch(err);
    }
    for (const id in RENAME) {
      const r = list[id], [from, to] = RENAME[id];
      if (!r || fixed.has(ref(id).path + '#n') || r.makes !== from) continue;
      fixed.add(ref(id).path + '#n');
      ref(id).update({ makes: to || FV.delete() }).catch(err);
    }
    // Aunt Diana's note pointed at a ⅔× button that's gone — only if nobody has changed the note since.
    const d = list['diana-banana-bread'];
    if (d && d.notes === NOTE_OLD && !fixed.has(ref('diana-banana-bread').path + '#note')) {
      fixed.add(ref('diana-banana-bread').path + '#note');
      ref('diana-banana-bread').update({ notes: NOTE_NEW }).catch(err);
    }
  }
  const NOTE_OLD = 'For one large loaf instead of 2 medium loaves, tap ⅔× up by “Makes.”', NOTE_NEW = 'For one large loaf instead of 2 medium loaves, use about ⅔ of everything.';

  // The family code you typed, checked before an account is made. Anyone can look up a code they
  // already know (nobody can list them).
  async function findFamily(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = code && await db.collection('codes').doc(code).get();
    if (!c || !c.exists) throw new Error('nocode');
    return { gid: c.data().gid, code };
  }
  // Join the family (proving the code), then — for a brand-new account — fill the book with Mom's Blue Book.
  let entering = false;
  async function enter(gid, code) {
    if (entering) return; entering = true;
    const fresh = !profile, name = (joining && joining.name) || myName();
    const batch = db.batch();
    batch.update(db.collection('families').doc(gid), { members: FV.arrayUnion(user.uid), ['names.' + user.uid]: name || 'Someone', joinCode: code });
    batch.set(U(), fresh ? { name, created: now(), settings: {}, family: gid, needsSeed: true } : { family: gid }, { merge: true });
    try { await batch.commit(); } finally { entering = false; joining = null; emit(); }
    if (fresh) await seed();
  }
  // needsSeed stays on the profile until the book is filled, so a dropped connection just tries again next time.
  let seeding = false;
  // A new account's book is its own household, filled with Mom's Blue Book, all in one save.
  async function seed() {
    if (seeding) return; seeding = true;
    const h = db.collection('households').doc(), batch = db.batch();
    batch.set(h, { members: [user.uid], names: { [user.uid]: myName() }, created: now() });
    batch.set(h.collection('meta').doc('book'), { bookmarks: [], removed: [], sections: [], sectionNames: {} });
    for (const id in base) batch.set(h.collection('recipes').doc(id), Object.assign(content(base[id]), { origin: { id, version: 1 }, order: base[id].order, created: now() }));
    batch.set(U(), { needsSeed: FV.delete(), household: h.id }, { merge: true });
    await switchTo(h.id, batch).catch(err);
    seeding = false;
  }

  /* ---------- households ----------
     Big copies go in several saves (the database takes up to 500 changes / 10 MB at once). Each step is
     written down on your profile first, so if the app closes partway it picks up where it left off. */
  function writer() {
    let batch = db.batch(), n = 0, size = 0;
    const w = {
      async set(ref, data) {
        const sz = JSON.stringify(data).length;
        if (n && (n >= 400 || size + sz > 7e6)) await w.flush();
        batch.set(ref, data); n++; size += sz;
      },
      async flush() { if (n) await batch.commit(); batch = db.batch(); n = 0; size = 0; },
    };
    return w;
  }
  // Everything in one book (recipes with their history, bookmarks and sections, photos), from a household or a pre-household book.
  async function readBook(root) {
    const [rs, ms, ps] = await Promise.all([root.collection('recipes').get(), root.collection('meta').doc('book').get(), root.collection('photos').get()]);
    const recs = [];
    for (const d of rs.docs) recs.push({ id: d.id, data: d.data(), history: (await d.ref.collection('history').get()).docs.map(h => [h.id, h.data()]) });
    return { recs, meta: ms.exists ? ms.data() : {}, photos: ps.docs.map(d => [d.id, d.data()]) };
  }
  async function copyBook(src, to) {
    const w = writer();
    for (const [pid, p] of src.photos) await w.set(to.collection('photos').doc(pid), p);
    for (const r of src.recs) {
      await w.set(to.collection('recipes').doc(r.id), r.data);
      for (const [hid, h] of r.history) await w.set(to.collection('recipes').doc(r.id).collection('history').doc(hid), h);
    }
    await w.set(to.collection('meta').doc('book'), src.meta);
    await w.flush();
  }
  const busy = {};
  const once = (k, fn) => async (...a) => { if (busy[k]) return; busy[k] = true; try { await fn(...a); } catch (e) { err(e); } finally { busy[k] = false; emit(); } };
  // First time opening with households: your book moves into a household of your own.
  const moveIn = once('move', async () => {
    let hid = profile.moving;
    if (!hid) {
      const h = db.collection('households').doc(); hid = h.id;
      const batch = db.batch();
      batch.set(h, { members: [user.uid], names: { [user.uid]: myName() }, created: now() });
      batch.set(U(), { moving: hid }, { merge: true });
      await batch.commit();
    }
    const old = await readBook(U());
    if (old.meta.boxSeen && !profile.boxSeen) await U().set({ boxSeen: old.meta.boxSeen }, { merge: true });
    await copyBook(old, HH(hid));
    const batch = db.batch();
    batch.set(U(), { household: hid, moving: FV.delete() }, { merge: true });
    await switchTo(hid, batch);
  });
  // Joining someone's household: your recipes, notes and photos are added to their book, then you leave your old one.
  const finishJoin = once('join', async () => {
    const to = HH(profile.joiningHH), from = profile.household;
    if (from && from !== profile.joiningHH) {
      const [mine, theirs] = await Promise.all([readBook(HH(from)), readBook(to)]);
      await mergeBook(mine, theirs, to);
    }
    const hid = profile.joiningHH, batch = db.batch();
    batch.set(U(), { household: hid, joiningHH: FV.delete() }, { merge: true });
    if (from && from !== hid) batch.update(HH(from), { members: FV.arrayRemove(user.uid), ['names.' + user.uid]: FV.delete() });
    await switchTo(hid, batch);
  });
  // Stop listening to the old book before leaving it, then open the new one as soon as the save is done
  // (the database doesn't always send a "saved" update after you lose access to something you were watching).
  async function switchTo(hid, batch) {
    stopBook(); emit();
    await batch.commit();
    startBook(hid); emit();
  }
  async function mergeBook(mine, theirs, to) {
    const w = writer(), byOrigin = {}, byId = {}, ids = new Set(theirs.recs.map(r => r.id)), rename = {};
    theirs.recs.forEach(r => { const o = (r.data.origin || {}).id; if (o) byOrigin[o] = r; byId[r.id] = r; });
    for (const [pid, p] of mine.photos) await w.set(to.collection('photos').doc(pid), p);
    for (const r of mine.recs) {
      const o = (r.data.origin || {}).id, match = o && byOrigin[o];
      // The very same recipe someone added (e.g. coming back after leaving with a copy): nothing to add.
      if (!o && byId[r.id] && same(r.data, byId[r.id].data)) { rename[r.id] = r.id; continue; }
      if (!match) {
        // A recipe they don't have: it comes over with its history.
        let id = r.id, n = 2;
        while (ids.has(id)) id = `${r.id}-${n++}`;
        ids.add(id); rename[r.id] = id;
        await w.set(to.collection('recipes').doc(id), r.data);
        for (const [hid, h] of r.history) await w.set(to.collection('recipes').doc(id).collection('history').doc(hid), h);
        continue;
      }
      rename[r.id] = match.id;
      const ref = to.collection('recipes').doc(match.id);
      if (!r.data.edited && !r.data.ink) continue;           // still Mom's / the family's version: nothing to add
      if (same(r.data, match.data)) continue;
      if (r.data.edited && !match.data.edited) {
        // Only you changed it: your version wins; theirs goes into History.
        await w.set(ref.collection('history').doc(), { recipe: content(match.data), at: now(), by: user.uid, byName: myName() });
        await w.set(ref, Object.assign({}, r.data, { origin: match.data.origin, order: match.data.order ?? r.data.order ?? null }));
      } else {
        // Both changed it: theirs stays, yours is saved in its History (and your handwriting comes along if theirs has none).
        if (r.data.edited) await w.set(ref.collection('history').doc(), { recipe: content(r.data), at: now(), by: user.uid, byName: myName() + ' (before joining)' });
        if (r.data.ink && !match.data.ink) await w.set(ref, Object.assign({}, match.data, { ink: r.data.ink }));
      }
    }
    const tm = theirs.meta || {}, mm = mine.meta || {};
    const secIds = new Set((tm.sections || []).map(x => x.id));
    await w.set(to.collection('meta').doc('book'), Object.assign({}, tm, {
      bookmarks: [...new Set((tm.bookmarks || []).concat((mm.bookmarks || []).map(id => rename[id] || id)))],
      sections: (tm.sections || []).concat((mm.sections || []).filter(x => !secIds.has(x.id))),
      sectionNames: Object.assign({}, mm.sectionNames || {}, tm.sectionNames || {}),
      removed: tm.removed || [],
    }));
    await w.flush();
  }
  // Leaving: you take a full copy of the book into a new household of your own.
  const finishLeave = once('leave', async () => {
    const hid = profile.leavingTo, from = profile.household;
    if (from && from !== hid) await copyBook(await readBook(HH(from)), HH(hid));
    const batch = db.batch();
    batch.set(U(), { household: hid, leavingTo: FV.delete() }, { merge: true });
    if (from && from !== hid) batch.update(HH(from), { members: FV.arrayRemove(user.uid), ['names.' + user.uid]: FV.delete() });
    await switchTo(hid, batch);
  });

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
    // Signed in but not in the family yet (an account from before codes were needed, or a sign-up cut off partway).
    needsFamilyChoice: () => !joining && (!profile || !profile.family),

    /* ---------- account ---------- */
    // No family code, no account: the code is checked first.
    async signUp(name, email, password, code) {
      joining = Object.assign(await findFamily(code), { name });
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        return cred.user;
      } catch (e) { joining = null; throw e; }
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
      return inOrder(BB.sections.map(s => Object.assign({}, s, names[s.id] ? { name: names[s.id], short: names[s.id] } : {}))
        .concat((m.sections || []).map(s => Object.assign({ custom: true }, s))), m.sectionOrder);
    },
    recipeOrder: sid => ((meta && meta.recipeOrder) || {})[sid] || null,
    setSectionOrder(ids) { meta = Object.assign({}, meta, { sectionOrder: ids }); M().set({ sectionOrder: ids }, { merge: true }).catch(err); },
    setRecipeOrder(sid, ids) {
      meta = Object.assign({}, meta, { recipeOrder: Object.assign({}, (meta && meta.recipeOrder) || {}, { [sid]: ids }) });
      M().set({ recipeOrder: { [sid]: ids } }, { merge: true }).catch(err);
    },
    hasCustomOrder: () => !!(meta && ((meta.sectionOrder || []).length || Object.values(meta.recipeOrder || {}).some(l => l && l.length))),
    resetOrder() { meta = Object.assign({}, meta, { sectionOrder: null, recipeOrder: null }); M().set({ sectionOrder: FV.delete(), recipeOrder: FV.delete() }, { merge: true }).catch(err); },
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
      // Update right away too, so Settings shows the new name without waiting for the sync.
      if (list.some(s => s.id === id)) { meta = Object.assign({}, meta, { sections: list }); M().set({ sections: list }, { merge: true }).catch(err); }
      else { meta = Object.assign({}, meta, { sectionNames: Object.assign({}, (meta && meta.sectionNames) || {}, { [id]: name }) }); M().set({ sectionNames: { [id]: name } }, { merge: true }).catch(err); }
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
        if (hhId) H().update({ ['names.' + user.uid]: v || 'Someone' }).catch(err);
        return;
      }
      const st = Object.assign({}, (profile && profile.settings) || {});
      if (v === null) delete st[k]; else st[k] = v;
      profile = Object.assign({}, profile, { settings: st });
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
    async joinFamily(code) {
      const fam = await findFamily(code);
      await enter(fam.gid, fam.code);
    },
    // A new invite code: random, or one you choose (letters and numbers, 6–20). Codes are shared across every
    // family using the app, so a chosen one has to be free. Only the person who started the family can change it.
    async changeCode(custom) {
      const old = family.code;
      const code = custom ? String(custom).toUpperCase().replace(/[^A-Z0-9]/g, '') : newCode();
      if (custom && !/^[A-Z0-9]{6,20}$/.test(code)) throw new Error('badcode');
      if (code === old) return code;
      if (custom && (await db.collection('codes').doc(code).get()).exists) throw new Error('taken');
      const batch = db.batch();
      batch.set(db.collection('codes').doc(code), { gid: famId });
      batch.update(F(), { code });
      if (old) batch.delete(db.collection('codes').doc(old));
      await batch.commit();
      return code;
    },
    renameFamily: name => F().update({ name }),

    /* ---------- my household (the people sharing this book) ---------- */
    household: () => household,
    // Mid-way through moving in, joining or leaving (the app shows "Opening your book…" until it's done).
    householdBusy: () => !!(profile && (profile.moving || profile.joiningHH || profile.leavingTo || (profile.family && !profile.household))),
    invite: () => invite,
    sentInvites: () => sentInvites.filter(i => i.hid === hhId),
    inviteToHousehold(uid) {
      return db.collection('invites').doc(uid).set({ hid: hhId, by: user.uid, byName: myName(), names: Object.values((household && household.names) || {}), at: now() });
    },
    cancelInvite: uid => db.collection('invites').doc(uid).delete(),
    declineInvite: () => db.collection('invites').doc(user.uid).delete(),
    async acceptInvite() {
      const inv = invite; if (!inv) return;
      const batch = db.batch();
      batch.update(HH(inv.hid), { members: FV.arrayUnion(user.uid), ['names.' + user.uid]: myName() });
      batch.delete(db.collection('invites').doc(user.uid));
      batch.set(U(), { joiningHH: inv.hid }, { merge: true });
      await batch.commit();
    },
    async leaveHousehold() {
      const h = db.collection('households').doc(), batch = db.batch();
      batch.set(h, { members: [user.uid], names: { [user.uid]: myName() }, created: now() });
      batch.set(U(), { leavingTo: h.id }, { merge: true });
      await batch.commit();
    },

    /* ---------- Blue Book Recipes (the family box) ---------- */
    box: () => Object.values(box).map(decorateBox),
    boxGet: id => box[id] ? decorateBox(box[id]) : null,
    // Recipes someone else shared since I last opened Blue Book Recipes (Mom's don't count).
    boxNew: since => Object.values(box).filter(b => b.by !== 'bluebook' && b.by !== (user && user.uid) && (b.created || 0) > since)
      .sort((a, b) => (b.created || 0) - (a.created || 0)).map(decorateBox),
    // Each person has their own "new since your last visit", even when sharing a book.
    boxSeen: () => (profile && profile.boxSeen) || 0,
    markBoxSeen() { const t = now(); profile = Object.assign({}, profile, { boxSeen: t }); U().set({ boxSeen: t }, { merge: true }).catch(err); },
    // Put my recipe in the box, or send my changes to the family version it came from.
    async share(id) {
      const r = recipes[id]; if (!r || !family) return;
      const c = content(r);
      c.photo = await Photos.toFamily(c.photo);
      if (c.ink && c.ink.stk) { c.ink = JSON.parse(JSON.stringify(c.ink)); for (const s of c.ink.stk) s.r = (await Photos.toFamily(s.r)) || s.r; }
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
  Object.defineProperty(Store, 'ready', { get: () => !!user && !joining && loaded.profile && (Store.needsFamilyChoice() || (!Store.householdBusy() && !!hhId && hhId === profile.household && Object.values(loaded).every(Boolean) && !!profile)) });

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
      const ref = H().collection('photos').doc();
      await ref.set({ data: dataUrl, at: now() });
      cache['u:' + ref.id] = dataUrl;
      return 'u:' + ref.id;
    },
    async get(ref) {
      if (!ref) return null;
      if (ref.startsWith('idb:')) return LocalPhotos.get(ref);
      if (!/^[uf]:/.test(ref)) return ref;
      if (cache[ref]) return cache[ref];
      // Your own photos (like a cover picture) live in the household's book; wait a moment for it to be known.
      if (ref[0] === 'u') for (let i = 0; i < 60 && !hhId; i++) await new Promise(r => setTimeout(r, 250));
      try {
        if (ref[0] === 'u' && !hhId) throw new Error('no book yet');
        const doc = ref[0] === 'u' ? H().collection('photos').doc(ref.slice(2)) : (famId ? F().collection('photos').doc(ref.slice(2)) : null);
        if (!doc) return null;
        let s = await doc.get();
        // Not copied over (yet)? Your own pre-household photos are still where they were.
        if (!s.exists && ref[0] === 'u') s = await U().collection('photos').doc(ref.slice(2)).get().catch(() => s);
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
