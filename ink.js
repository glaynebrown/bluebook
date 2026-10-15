/* Writing on recipes with an Apple Pencil (or a finger, or a mouse).
   Two places to write:
     the notes pad — lined paper at the bottom of the recipe. It's stored as fractions of its
       width, so it looks the same on a phone, an iPad or a laptop.
     on the page — right over the recipe, like paper. The page reflows on different screens, so
       it remembers the page's width (and whether the iPad was upright or sideways) and only
       lines up when the recipe is opened the same way.
   Saved on the recipe as ink: { pad: [stroke], page: [{ f: 'one'|'L'|'R', w, s: [stroke] }], stk: [sticker] }
   stroke = { t: 'pen'|'hl', c: color, w: width, p: 'x,y,x,y,…' } (Firestore can't nest arrays).
   sticker = { f, w, r: 'bb:<id>' or a photo ref, x, y (its center), z (its width), a (degrees), fl (flipped) },
     all in the frame's pixels at width w — like the page writing, it lines up when opened the same way. */
(function () {
  const COLORS = ['#3A2F28', '#A85C42', '#3F5C7A', '#5F7A52'];
  const HL = ['#F2D46B', '#F4B8A8', '#B9D6E8', '#C9E0B4'];
  const PAD_UNITS = 1000; // pad x/y are in thousandths of the pad's width
  let st = null; // while writing: { r, save, where, tool, color, finger, ink, undo, frames }

  const enc = pts => pts.map(n => Math.round(n)).join(',');
  const dec = s => { const a = String(s || '').split(',').map(Number), out = []; for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const norm = ink => { const i = clone(ink); i.pad = i.pad || []; i.page = i.page || []; i.stk = i.stk || []; return i; };
  const hasInk = ink => !!ink && ((ink.pad || []).length || (ink.page || []).some(e => (e.s || []).length) || (ink.stk || []).length);

  function stroke(ctx, s, k) {
    const p = dec(s.p); if (!p.length) return;
    ctx.save();
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = s.c;
    ctx.globalAlpha = s.t === 'hl' ? 0.4 : 1;
    ctx.lineWidth = Math.max(0.6, s.w * k);
    ctx.beginPath();
    ctx.moveTo(p[0][0] * k, p[0][1] * k);
    if (p.length === 1) ctx.lineTo(p[0][0] * k + 0.1, p[0][1] * k);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(p[i][0] * k, p[i][1] * k, mx * k, my * k);
    }
    if (p.length > 1) ctx.lineTo(p[p.length - 1][0] * k, p[p.length - 1][1] * k);
    ctx.stroke();
    ctx.restore();
  }

  function sizeCanvas(c, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /* ---------- drawing what's saved ---------- */
  // Which "frames" the page has right now: one long page, or the left and right pages side by side.
  function frames(spread) {
    const two = document.documentElement.classList.contains('two-page');
    return two ? [['L', spread.querySelector('.leaf.left')], ['R', spread.querySelector('.leaf.right')]] : [['one', spread]];
  }

  function paint(spread, ink) {
    ink = norm(ink);
    const here = frames(spread), kinds = here.map(f => f[0]);
    spread.querySelectorAll('canvas.ink-page').forEach(c => { if (!kinds.includes(c.dataset.frame)) c.remove(); });
    for (const [f, el] of here) {
      if (!el) continue;
      let c = [...el.children].find(x => x.matches('canvas.ink-page'));
      if (!c) { c = document.createElement('canvas'); c.className = 'ink-page'; c.dataset.frame = f; el.appendChild(c); }
      c.style.height = '0px'; // so it doesn't count toward the page's own height
      const w = el.clientWidth, h = Math.max(el.scrollHeight, el.clientHeight);
      const ctx = sizeCanvas(c, w, h);
      for (const e of ink.page.filter(e => e.f === f)) { const k = w / e.w; (e.s || []).forEach(s => stroke(ctx, s, k)); }
      paintStickers(el, f, w, ink);
    }
    spread.querySelectorAll('.ink-stickers').forEach(l => { if (!kinds.includes(l.dataset.frame)) l.remove(); });
    // Writing made with the iPad the other way around can't line up here.
    const elsewhere = ink.page.filter(e => !kinds.includes(e.f) && (e.s || []).length).concat(ink.stk.filter(s => !kinds.includes(s.f)));
    let note = spread.querySelector('.ink-elsewhere');
    if (elsewhere.length) {
      if (!note) { note = document.createElement('p'); note.className = 'ink-elsewhere'; (spread.querySelector('.r-head') || spread).appendChild(note); }
      note.textContent = elsewhere.some(e => e.f === 'one')
        ? '✎ There’s writing or stickers on this page from when it was open as one page — hold the iPad upright (or open it on the phone) to see them.'
        : '✎ There’s writing or stickers on this page from when the iPad was sideways — turn it sideways to see them.';
    } else if (note) note.remove();

    const pad = spread.querySelector('.ink-pad');
    if (pad) {
      const w = pad.clientWidth, maxY = Math.max(0, ...ink.pad.flatMap(s => dec(s.p).map(p => p[1])));
      const typed = pad.querySelector('.notes-typed');
      // At least five lines, room below the typing and the writing, and (two pages) down to the bottom of the page.
      let h = Math.max(176, (typed ? typed.offsetHeight + 48 : 0), (maxY / PAD_UNITS) * w + w * 0.22);
      const leaf = pad.closest('.leaf');
      if (pad.dataset.fill && leaf && document.documentElement.classList.contains('two-page')) {
        pad.style.height = '0px';
        const top = pad.getBoundingClientRect().top - leaf.getBoundingClientRect().top + leaf.scrollTop;
        h = Math.max(h, leaf.clientHeight - top - parseFloat(getComputedStyle(leaf).paddingBottom || 0) - 4);
      }
      pad.style.height = h + 'px';
      let c = pad.querySelector('canvas'); if (!c) { c = document.createElement('canvas'); pad.appendChild(c); }
      const ctx = sizeCanvas(c, w, h), k = w / PAD_UNITS;
      ink.pad.forEach(s => stroke(ctx, s, k));
    }
  }

  /* ---------- stickers ---------- */
  function stickerHtml(s) {
    if (String(s.r).startsWith('bb:')) { const b = (window.BBStickers || []).find(x => x.id === s.r.slice(3)); return b ? b.svg : ''; }
    return `<img alt="" draggable="false" data-ref="${String(s.r).replace(/"/g, '&quot;')}">`;
  }
  function placeSticker(d, s, k) {
    d.style.left = s.x * k + 'px'; d.style.top = s.y * k + 'px'; d.style.width = s.z * k + 'px';
    d.style.transform = `translate(-50%, -50%) rotate(${s.a || 0}deg) scaleX(${s.fl ? -1 : 1})`;
  }
  function paintStickers(el, f, w, ink) {
    let layer = [...el.children].find(x => x.matches('.ink-stickers'));
    if (!layer) { layer = document.createElement('div'); layer.className = 'ink-stickers'; layer.dataset.frame = f; el.appendChild(layer); }
    layer.innerHTML = '';
    ink.stk.forEach((s, i) => {
      if (s.f !== f) return;
      const d = document.createElement('div');
      d.className = 'stk' + (st && st.sel === i ? ' sel' : ''); d.dataset.i = i;
      d.innerHTML = stickerHtml(s) + (st && st.sel === i ? '<span class="stk-handle" aria-label="Resize or turn"></span><span class="stk-x" role="button" aria-label="Delete sticker">✕</span>' : '');
      placeSticker(d, s, w / s.w);
      layer.appendChild(d);
      const im = d.querySelector('img[data-ref]');
      if (im && window.Photos) Photos.get(im.dataset.ref).then(src => { if (src) im.src = src; });
    });
  }
  // Moving a sticker: drag it; pinch to resize and turn; or drag its corner dot (Pencil or mouse).
  function wireStickers() {
    const { spread } = st;
    if (spread._stkWired) return;
    spread._stkWired = true;
    const ptrs = new Map();
    let g = null; // the gesture in progress
    const frameEl = f => f === 'one' ? spread : spread.querySelector(f === 'L' ? '.leaf.left' : '.leaf.right');
    spread.addEventListener('pointerdown', e => {
      if (!st || st.tool !== 'sticker') return;
      const leaf = e.target.closest('.leaf');
      st.lastFrame = document.documentElement.classList.contains('two-page') ? (leaf && leaf.classList.contains('right') ? 'R' : 'L') : 'one';
      const d = e.target.closest('.stk');
      if (!d) { if (st.sel != null) { st.sel = null; attach(); toolbar(); } return; }
      e.preventDefault();
      const i = +d.dataset.i, s = st.ink.stk[i];
      if (e.target.closest('.stk-x') && st.sel === i) { push(); st.ink.stk.splice(i, 1); st.sel = null; g = null; changed(false); attach(); toolbar(); return; }
      if (st.sel !== i) { st.sel = i; attach(); toolbar(); }
      const el = spread.querySelector(`.ink-stickers[data-frame="${s.f}"] .stk[data-i="${i}"]`);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      const k = frameEl(s.f).clientWidth / s.w;
      if (!g || g.i !== i) { push(); g = { i, el, k, moved: false }; }
      g.handle = !!e.target.closest('.stk-handle');
      g.start = { x: s.x, y: s.y, z: s.z, a: s.a || 0, ptrs: new Map([...ptrs].map(([id, p]) => [id, { ...p }])) };
      const r = el.getBoundingClientRect(); g.cx = r.left + r.width / 2; g.cy = r.top + r.height / 2;
    });
    spread.addEventListener('pointermove', e => {
      if (!g || !ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = st.ink.stk[g.i], p0 = g.start, ids = [...ptrs.keys()];
      if (ids.length >= 2 && p0.ptrs.size >= 2) {
        const [a, b] = ids.slice(0, 2).map(id => ptrs.get(id)), [a0, b0] = ids.slice(0, 2).map(id => p0.ptrs.get(id) || ptrs.get(id));
        const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b.x - a.x, b.y - a.y);
        s.z = Math.max(24 / g.k, Math.min(900 / g.k, p0.z * d1 / d0));
        s.a = p0.a + (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) * 180 / Math.PI;
        s.x = p0.x + ((a.x + b.x) - (a0.x + b0.x)) / 2 / g.k; s.y = p0.y + ((a.y + b.y) - (a0.y + b0.y)) / 2 / g.k;
      } else if (g.handle) {
        const q = ptrs.get(ids[0]), q0 = p0.ptrs.get(ids[0]) || q;
        const d0 = Math.hypot(q0.x - g.cx, q0.y - g.cy) || 1, d1 = Math.hypot(q.x - g.cx, q.y - g.cy);
        s.z = Math.max(24 / g.k, Math.min(900 / g.k, p0.z * d1 / d0));
        s.a = p0.a + (Math.atan2(q.y - g.cy, q.x - g.cx) - Math.atan2(q0.y - g.cy, q0.x - g.cx)) * 180 / Math.PI;
      } else {
        const q = ptrs.get(ids[0]), q0 = p0.ptrs.get(ids[0]) || q;
        s.x = p0.x + (q.x - q0.x) / g.k; s.y = p0.y + (q.y - q0.y) / g.k;
      }
      g.moved = true;
      placeSticker(g.el, s, g.k);
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (!g) return;
      if (ptrs.size) { const s = st.ink.stk[g.i]; g.start = { x: s.x, y: s.y, z: s.z, a: s.a || 0, ptrs: new Map([...ptrs].map(([id, p]) => [id, { ...p }])) }; g.handle = false; return; }
      if (g.moved) changed(false); else st.undo.pop();
      g = null;
    };
    spread.addEventListener('pointerup', up);
    spread.addEventListener('pointercancel', up);
  }
  async function addSticker() {
    if (!Ink.pickSticker) return;
    const pick = await Ink.pickSticker();
    if (!pick || !st) return;
    const two = document.documentElement.classList.contains('two-page');
    const f = two ? (st.lastFrame === 'R' ? 'R' : 'L') : 'one';
    const el = f === 'one' ? st.spread : st.spread.querySelector(f === 'L' ? '.leaf.left' : '.leaf.right');
    const w = el.clientWidth;
    // In the middle of what's showing right now.
    const y = el.scrollTop + Math.min(el.clientHeight, innerHeight - el.getBoundingClientRect().top) / 2;
    push();
    st.ink.stk.push({ f, w, r: pick.ref, x: w / 2, y, z: Math.min(w * 0.42, pick.builtIn ? 130 : 170), a: pick.builtIn ? 0 : -3, fl: false });
    st.sel = st.ink.stk.length - 1;
    changed(false); attach(); toolbar();
  }

  /* ---------- writing ---------- */
  function start(spread, r, save) {
    stop(false);
    st = { r, save, spread, where: localStorage.getItem('bb-ink-where') || 'pad', tool: 'pen', color: COLORS[0], hl: HL[0],
      finger: localStorage.getItem('bb-ink-finger') != null ? localStorage.getItem('bb-ink-finger') === '1' : Math.min(screen.width, screen.height) < 700,
      ink: norm(r.ink), undo: [], dirty: false };
    document.body.classList.add('inking');
    toolbar();
    attach();
  }

  function attach() {
    const { spread } = st;
    paint(spread, st.ink);
    spread.classList.toggle('ink-on-page', st.where === 'page');
    spread.classList.toggle('ink-on-pad', st.where === 'pad');
    spread.classList.toggle('ink-finger', st.finger);
    spread.classList.toggle('ink-stickering', st.tool === 'sticker');
    wireStickers();
    [...spread.querySelectorAll('canvas.ink-page'), spread.querySelector('.ink-pad canvas')].filter(Boolean).forEach(wire);
    if (st.where === 'pad' && !st.scrolled) { st.scrolled = true; const pad = spread.querySelector('.r-pad'); if (pad) pad.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function wire(c) {
    if (c.dataset.wired) return;
    c.dataset.wired = '1';
    const isPad = !c.classList.contains('ink-page');
    const frame = c.dataset.frame;
    let cur = null, pts = [];
    const pos = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const scale = () => isPad ? PAD_UNITS / c.clientWidth : 1;
    // A Pencil touch should write, not scroll the page.
    c.addEventListener('touchstart', e => { if (st && (st.finger || [...e.touches].some(t => t.touchType === 'stylus'))) e.preventDefault(); }, { passive: false });
    c.addEventListener('pointerdown', e => {
      if (!st) return;
      if (isPad !== (st.where === 'pad') || st.tool === 'sticker') return;
      if (e.pointerType === 'touch' && !st.finger) return; // fingers scroll
      e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) {}
      const k = scale(), [x, y] = pos(e);
      if (st.tool === 'eraser') { erase(isPad, frame, x * k, y * k, 14 * k); cur = 'erase'; return; }
      pts = [x * k, y * k];
      cur = { t: st.tool === 'hl' ? 'hl' : 'pen', c: st.tool === 'hl' ? st.hl : st.color, w: (st.tool === 'hl' ? 16 : 2.4) * k, p: '' };
      if (!isPad) cur.w = st.tool === 'hl' ? 16 : 2.4;
    });
    let last = null;
    c.addEventListener('pointermove', e => {
      if (!cur) return;
      const k = scale();
      if (cur === 'erase') { const [x, y] = pos(e); return erase(isPad, frame, x * k, y * k, 14 * k); }
      const ctx = c.getContext('2d');
      ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = cur.c; ctx.globalAlpha = cur.t === 'hl' ? 0.4 : 1;
      ctx.lineWidth = cur.w / k;
      let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      for (const ev of evs) {
        const [x, y] = pos(ev);
        const from = last || [pts[0] / k, pts[1] / k];
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(x, y); ctx.stroke();
        last = [x, y]; pts.push(x * k, y * k);
      }
      ctx.restore();
    });
    const end = () => {
      if (!cur) return;
      if (cur !== 'erase' && pts.length >= 2) {
        cur.p = enc(pts);
        push();
        if (isPad) st.ink.pad.push(cur);
        else {
          const w = c.clientWidth;
          let entry = st.ink.page.find(e => e.f === frame && Math.abs(e.w - w) < 2);
          if (!entry) { entry = { f: frame, w, s: [] }; st.ink.page.push(entry); }
          entry.s.push(cur);
        }
        changed(isPad);
        attach(); // redraw smoothly
      }
      cur = null; pts = []; last = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  function erase(isPad, frame, x, y, rad) {
    const hit = s => dec(s.p).some(([px, py]) => Math.hypot(px - x, py - y) < rad + s.w / 2);
    let removed = false;
    if (isPad) {
      const keep = st.ink.pad.filter(s => !hit(s));
      if (keep.length !== st.ink.pad.length) { push(); st.ink.pad = keep; removed = true; }
    } else {
      const w = st.spread.querySelector(`canvas.ink-page[data-frame="${frame}"]`).clientWidth;
      for (const e of st.ink.page.filter(e => e.f === frame)) {
        const k = w / e.w, keep = (e.s || []).filter(s => !dec(s.p).some(([px, py]) => Math.hypot(px * k - x, py * k - y) < rad + s.w / 2));
        if (keep.length !== e.s.length) { if (!removed) push(); e.s = keep; removed = true; }
      }
    }
    if (removed) { attach(); changed(isPad); }
  }

  const push = () => { st.undo.push(clone(st.ink)); if (st.undo.length > 60) st.undo.shift(); };
  let saveT = null;
  function changed(isPad) {
    st.dirty = true;
    if (isPad) { // let the pad grow as you write lower
      const pad = st.spread.querySelector('.ink-pad');
      const maxY = Math.max(0, ...st.ink.pad.flatMap(s => dec(s.p).map(p => p[1])));
      if (pad && (maxY / PAD_UNITS) * pad.clientWidth + pad.clientWidth * 0.12 > pad.clientHeight) attach();
    }
    clearTimeout(saveT); saveT = setTimeout(flush, 1200);
  }
  function flush() {
    clearTimeout(saveT);
    if (!st || !st.dirty) return;
    st.dirty = false;
    const ink = clone(st.ink);
    ink.page = ink.page.filter(e => (e.s || []).length);
    if (!ink.stk.length) delete ink.stk;
    const size = JSON.stringify(ink).length;
    st.save(ink, size);
  }

  function toolbar() {
    let bar = document.getElementById('ink-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'ink-bar'; bar.className = 'ink-bar'; document.body.appendChild(bar); }
    const ic = n => `<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const b = (act, label, on, extra = '') => `<button data-ink="${act}" class="${on ? 'on' : ''}" ${extra}>${label}</button>`;
    // Icon buttons keep the row short; the name shows on a long press / hover.
    const ib = (act, name, iconName, on, extra = '') => `<button data-ink="${act}" class="ink-ic${on ? ' on' : ''}" title="${name}" aria-label="${name}" ${extra}>${ic(iconName)}</button>`;
    const sw = st.tool === 'hl' ? HL : COLORS, curC = st.tool === 'hl' ? st.hl : st.color, stk = st.tool === 'sticker', sel = st.sel != null;
    bar.innerHTML = (stk ? `<div class="ink-row stk-row">
        ${b('stk-add', `${ic('plus')} Add`, false)}${b('stk-flip', `${ic('flip')} Flip`, false, sel ? '' : 'disabled')}${b('stk-front', `${ic('front')} Bring to front`, false, sel ? '' : 'disabled')}
      </div>` : '') + `<div class="ink-row">
        <div class="ink-seg">${b('where-pad', 'Notes pad', st.where === 'pad')}${b('where-page', 'On the page', st.where === 'page')}</div>
        <span class="ink-div"></span>
        <div class="ink-tools">${ib('pen', 'Pen', 'pencil', st.tool === 'pen')}${ib('hl', 'Highlighter', 'marker', st.tool === 'hl')}${ib('eraser', 'Eraser', 'eraser', st.tool === 'eraser')}${ib('sticker', 'Stickers', 'sticker', stk)}</div>
        ${stk ? '' : `<div class="ink-colors">${sw.map(c => `<button data-ink="color" data-c="${c}" class="dot${c === curC && st.tool !== 'eraser' ? ' on' : ''}" style="--dot:${c}" aria-label="Color"></button>`).join('')}</div>`}
        <span class="ink-div"></span>
        ${ib('undo', 'Undo', 'undo', false, st.undo.length ? '' : 'disabled')}
        ${stk ? '' : ib('finger', st.finger ? 'Finger draws (tap so only the Pencil writes)' : 'Finger scrolls (tap to draw with your finger)', 'finger', st.finger)}
        <button data-ink="done" class="done">Done</button>
      </div>`;
    bar.onclick = e => {
      const t = e.target.closest('[data-ink]'); if (!t || !st) return;
      const a = t.dataset.ink;
      if (a === 'where-pad' || a === 'where-page') { flush(); st.where = a.slice(6); st.scrolled = false; localStorage.setItem('bb-ink-where', st.where); if (st.where === 'pad' && st.tool === 'sticker') { st.tool = 'pen'; st.sel = null; } attach(); }
      else if (a === 'pen' || a === 'hl' || a === 'eraser') { st.tool = a; st.sel = null; attach(); }
      // Stickers go on the page itself.
      else if (a === 'sticker') { st.tool = 'sticker'; if (st.where !== 'page') { flush(); st.where = 'page'; localStorage.setItem('bb-ink-where', 'page'); } attach(); if (!st.ink.stk.length) addSticker(); }
      else if (a === 'stk-add') addSticker();
      else if (a === 'stk-front' && st.sel != null) { push(); st.ink.stk.push(st.ink.stk.splice(st.sel, 1)[0]); st.sel = st.ink.stk.length - 1; changed(false); attach(); }
      else if (a === 'stk-flip' && st.sel != null) { push(); st.ink.stk[st.sel].fl = !st.ink.stk[st.sel].fl; changed(false); attach(); }
      else if (a === 'color') { if (st.tool === 'hl') st.hl = t.dataset.c; else { st.color = t.dataset.c; if (st.tool === 'eraser') st.tool = 'pen'; } }
      else if (a === 'undo') { const prev = st.undo.pop(); if (prev) { st.ink = prev; st.sel = null; attach(); changed(true); } }
      else if (a === 'finger') { st.finger = !st.finger; localStorage.setItem('bb-ink-finger', st.finger ? '1' : '0'); attach(); if (Ink.say) Ink.say(st.finger ? 'Finger draws' : 'Finger scrolls — only the Pencil writes'); }
      else if (a === 'done') return stop(true);
      toolbar();
    };
  }

  function stop(saveNow = true) {
    if (!st) return;
    if (saveNow) flush();
    st.spread.classList.remove('ink-on-page', 'ink-on-pad', 'ink-finger', 'ink-stickering');
    const sp = st.spread, ink = st.ink;
    st = null;
    paint(sp, ink); // drop the selection outline
    document.body.classList.remove('inking');
    const bar = document.getElementById('ink-bar'); if (bar) bar.remove();
    if (Ink.onStop) Ink.onStop();
  }

  const Ink = { paint, start, stop, active: () => !!st, activeId: () => st && st.r.id, hasInk, hasPad: ink => !!ink && (ink.pad || []).length > 0, onStop: null, pickSticker: null, say: null };
  window.Ink = Ink;
})();
