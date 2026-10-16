/* Blue Book — the family cookbook. Screens are drawn into a two-page book:
   every screen has a left page and a right page. Sideways on a big screen they sit side by side;
   upright (or on a phone) they stack into one page that scrolls. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (n, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const lines = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  const kitchen = from => from ? `From ${esc(from)}’s Kitchen` : '';

  const book = $('#book'), spread = $('#spread'), tabs = $('#tabs'), pager = $('#pager');
  const scaleState = {}; // tonight's servings, per recipe (not saved)

  /* ---------- Order of pages ---------- */
  const bySection = sid => {
    const mine = Store.recipeOrder(sid) || [];
    const rank = r => { const i = mine.indexOf(r.id); return i < 0 ? 1e9 : i; };
    return Store.all().filter(r => r.section === sid)
      .sort((a, b) => rank(a) - rank(b) || (a.order ?? 1e6) - (b.order ?? 1e6) || (a.created || 0) - (b.created || 0));
  };
  const sectionOf = id => Store.sections().find(s => s.id === id);

  /* ---------- Design (Settings): font, tab colors, text size. Just for your book. ---------- */
  const FONTS = [
    { id: 'classic', name: 'Classic', t: "'Dancing Script', cursive", w: 700, a: 'none', b: "'Lora', serif" },
    { id: 'handwritten', name: 'Handwritten', t: "'Caveat', cursive", w: 700, a: '.40', b: "'Lora', serif" },
    { id: 'farmhouse', name: 'Farmhouse', t: "'Playfair Display', serif", w: 700, a: '.40', b: "'Lora', serif" },
    { id: 'simple', name: 'Simple', t: "'Nunito', sans-serif", w: 800, a: '.40', b: "'Nunito', sans-serif" },
    { id: 'card', name: 'Recipe card', t: "'Special Elite', monospace", w: 400, a: '.40', b: "'Courier Prime', monospace" },
    { id: 'bistro', name: 'Bistro', t: "'Pacifico', cursive", w: 400, a: '.40', b: "'Josefin Sans', sans-serif" },
  ];
  // One color: tabs go from dark (top) to light; buttons and links use the middle shade.
  const PALETTES = {
    blue: { name: 'Blue', from: '#7F9DBC', to: '#2E4763', accent: '#3F5C7A', soft: '#E3EAF2' },
    sage: { name: 'Sage', from: '#97AE8F', to: '#3D573C', accent: '#56744F', soft: '#E6EEE2' },
    rose: { name: 'Rose', from: '#CC948E', to: '#7A3B37', accent: '#A25A54', soft: '#F5E4E1' },
    terracotta: { name: 'Terracotta', from: '#D49A7C', to: '#7A3A24', accent: '#A85C42', soft: '#F5E6D8' },
    plum: { name: 'Plum', from: '#AE8FAC', to: '#553252', accent: '#77496F', soft: '#EFE4EE' },
    charcoal: { name: 'Charcoal', from: '#A39C95', to: '#3A3633', accent: '#4E4843', soft: '#ECE8E4' },
  };
  const RAINBOW = ['#6F8A69', '#A85C42', '#B06A64', '#557494', '#96722A', '#7D5F78', '#4F6B54'];
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  function design() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('bb-design') || '{}'); } catch (e) {}
    if (Store.ready) {
      const s = Store.settings();
      d = { font: s.designFont, palette: s.designPalette, text: s.designText };
      try { localStorage.setItem('bb-design', JSON.stringify(d)); } catch (e) {}
    }
    return { font: FONTS.some(f => f.id === d.font) ? d.font : 'classic', palette: d.palette === 'rainbow' || PALETTES[d.palette] ? d.palette : 'blue', text: ['small', 'large'].includes(d.text) ? d.text : 'medium' };
  }
  let extraFonts = false;
  function loadExtraFonts() {
    if (extraFonts) return; extraFonts = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Playfair+Display:wght@600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Pacifico&family=Josefin+Sans:wght@600;700&display=swap';
    document.head.appendChild(l);
  }
  let curDesign = null;
  function applyDesign() {
    const d = curDesign = design(), root = document.documentElement;
    root.dataset.font = d.font; root.dataset.text = d.text;
    if (d.font !== 'classic') loadExtraFonts();
    let st = document.getElementById('design-style');
    if (!st) { st = document.createElement('style'); st.id = 'design-style'; document.head.appendChild(st); }
    const p = PALETTES[d.palette];
    if (!p) { st.textContent = ''; return; }
    const n = Math.max(Store.sections().length, 2);
    st.textContent = `:root { --blue: ${p.accent}; --terra: ${p.accent}; --terra-soft: ${p.soft}; }\n`
      + Array.from({ length: n }, (_, i) => `.c-g${i} { --c: ${mix(p.to, p.from, i / (n - 1))}; }`).join('\n');
  }
  // The color class for a section: its own color, or its shade when one color is picked.
  const colorOf = s => {
    if ((curDesign || design()).palette === 'rainbow') return (s && s.color) || 'sage';
    return 'g' + Math.max(s ? Store.sections().findIndex(x => x.id === s.id) : 0, 0);
  };

  function sequence() {
    const seq = [{ t: 'cover' }, { t: 'letter' }, { t: 'conversions' }, { t: 'index' }];
    for (const s of Store.sections()) {
      seq.push({ t: 'section', id: s.id });
      bySection(s.id).forEach(r => seq.push({ t: 'recipe', id: r.id }));
    }
    return seq;
  }
  const keyOf = s => s.t + ':' + (s.id || '');

  function parse(hash) {
    const [path, query] = (hash || '').replace(/^#\/?/, '').split('?');
    const [t, id] = path.split('/');
    const q = new URLSearchParams(query || '');
    if (!t) return { t: 'cover' };
    if (t === 's') return { t: 'section', id: decodeURIComponent(id || '') };
    if (t === 'r') return { t: 'recipe', id: decodeURIComponent(id || '') };
    if (t === 'box') return id ? { t: 'boxr', id: decodeURIComponent(id) } : { t: 'box', q };
    if (['letter', 'conversions', 'index', 'search', 'bookmarks'].includes(t)) return { t, q };
    return { t: 'cover' };
  }
  const hrefOf = s => ({ cover: '#/', letter: '#/letter', conversions: '#/conversions', index: '#/index', search: '#/search', bookmarks: '#/bookmarks', box: '#/box' })[s.t]
    || (s.t === 'boxr' ? '#/box/' + encodeURIComponent(s.id) : '')
    || (s.t === 'section' ? '#/s/' + encodeURIComponent(s.id) : '#/r/' + encodeURIComponent(s.id));

  /* ---------- Photos ---------- */
  const firstPhoto = list => (list.find(r => r.photo) || {}).photo;
  // A section's header picture: your own pick, else the Blue Book one, else its first recipe photo.
  const headerPhoto = (s, rs) => (Store.settings().sectionPhotos || {})[s.id] || s.photo || firstPhoto(rs);
  // Photos already loaded go straight into the page as it's built, so turning pages doesn't blink them.
  const photoSrc = {};
  const img = (ref, alt, cls = '') => ref
    ? `<img class="${cls}" data-ref="${esc(ref)}" alt="${esc(alt || '')}"${photoSrc[ref] ? ` src="${esc(photoSrc[ref])}" decoding="sync"` : ' loading="lazy"'}>`
    : '';
  async function getPhoto(ref) {
    if (photoSrc[ref]) return photoSrc[ref];
    const src = await Photos.get(ref).catch(() => null);
    if (src) photoSrc[ref] = src;
    return src;
  }
  async function fillPhotos(root) {
    await Promise.all($$('img[data-ref]:not([src])', root).map(async el => {
      const src = await getPhoto(el.dataset.ref);
      if (src) el.src = src; else el.replaceWith(Object.assign(document.createElement('span'), { className: el.className + ' missing' }));
    }));
  }
  // The pages on either side get their photos loaded (and decoded) ahead of time, ready to be turned to.
  const warm = [];
  function prefetch(scrs) {
    for (const scr of scrs) {
      if (!scr || scr.t === 'cover') continue;
      let html = '';
      try { const out = (Screens[scr.t] || Screens.cover)(scr); html = out.left + (out.right || ''); } catch (e) { continue; }
      for (const m of html.matchAll(/data-ref="([^"]+)"/g)) {
        const ref = m[1].replace(/&amp;/g, '&');
        if (photoSrc[ref]) continue;
        getPhoto(ref).then(src => {
          if (!src) return;
          const im = new Image(); im.src = src; im.decode().catch(() => {});
          warm.push(im); if (warm.length > 40) warm.shift();
        });
      }
    }
  }
  const thumb = r => r.photo ? img(r.photo, '', 'thumb') : `<span class="thumb ph c-${colorOf(sectionOf(r.section))}">${icon('pot')}</span>`;

  function pickImage() {
    return new Promise(resolve => {
      const input = $('#file');
      input.value = '';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return resolve(null);
        try { resolve(await shrink(f)); } catch (e) { toast('That photo couldn’t be opened.'); resolve(null); }
      };
      input.click();
    });
  }
  // Photos from a phone are huge; keep about 1400px, which still looks sharp on an iPad.
  async function shrink(file, max = 1400) {
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- Screens: each returns { left, right, cls, label } ---------- */
  const Screens = {};

  /* The cover. It's also what shows while the book is opening, so the app starts on it. */
  const coverSrc = {}; // cover pictures already loaded, drawn straight in next time so nothing flashes
  function coverRefs() {
    let refs = {};
    try { refs = JSON.parse(localStorage.getItem('bb-cover') || '{}'); } catch (e) {}
    if (Store.ready) {
      const s = Store.settings();
      refs = { p: s.coverPortrait || 'cover-portrait.jpg', l: s.coverLandscape || 'cover-landscape.jpg' };
      try { localStorage.setItem('bb-cover', JSON.stringify(refs)); } catch (e) {}
    }
    return { p: refs.p || 'cover-portrait.jpg', l: refs.l || 'cover-landscape.jpg' };
  }
  function coverHtml(opening) {
    const { p, l } = coverRefs();
    const pic = (cls, ref) => `<img class="cover-img ${cls}${coverSrc[ref] ? ' loaded' : ''}" data-ref="${esc(ref)}"${coverSrc[ref] ? ` src="${esc(coverSrc[ref])}"` : ''} alt="">`;
    // Plain cover blue until the picture fades in (and if it's ever missing).
    const inner = `${pic('portrait', p)}${pic('landscape', l)}`;
    return opening ? `<div class="cover opening">${inner}</div>` : `<a class="cover" href="#/letter" aria-label="Open the book">${inner}</a>`;
  }
  // On the cover the book takes the shape of the cover picture, so there's no extra blue above or below it.
  function coverShape(el) {
    if (!el.naturalWidth) return;
    book.style.setProperty(el.classList.contains('landscape') ? '--ar-l' : '--ar-p', (el.naturalWidth / el.naturalHeight).toFixed(4));
  }
  function loadCover(root) {
    $$('.cover-img.loaded', root).forEach(el => el.complete ? coverShape(el) : el.addEventListener('load', () => coverShape(el), { once: true }));
    $$('.cover-img', root).forEach(async el => {
      if (coverSrc[el.dataset.ref]) return;
      const src = await Photos.get(el.dataset.ref).catch(() => null);
      if (!src) return el.remove();
      el.onerror = () => el.remove();
      el.onload = () => { coverSrc[el.dataset.ref] = src; coverShape(el); el.classList.add('loaded'); };
      el.src = src;
    });
  }
  Screens.cover = () => ({ cls: 'screen-cover', label: 'Open the book', left: coverHtml(false), right: '', after: loadCover });

  Screens.letter = () => {
    const L = BB.letter;
    return {
      cls: 'screen-letter', label: 'A Letter from Mom',
      left: `<div class="fit"><div class="kicker">A letter from Mom</div>
        <h1 class="script">${esc(L.title)}</h1>
        <p class="letter-to">${esc(L.to)}</p>
        ${L.photos ? `<figure class="letter-photo tilt-l">${img(L.photos[0], 'Mom’s Blue Book')}</figure>` : ''}
        ${L.body.slice(0, 2).map(p => `<p class="letter-p">${esc(p)}</p>`).join('')}</div>`,
      right: `<div class="fit">${L.body.slice(2).map(p => `<p class="letter-p">${esc(p)}</p>`).join('')}
        <p class="letter-close">${esc(L.close)}</p>
        <p class="letter-sign script">${esc(L.sign)}</p>
        <p class="letter-full">${esc(L.signFull)}</p>
        ${L.photos && L.photos[1] ? `<figure class="letter-photo tilt-r">${img(L.photos[1], 'Mom with the Blue Book')}</figure>` : ''}</div>`,
      after(root) {
        fitLetter(root);
        // Photos loading in or the window changing size re-fits it.
        const ro = new ResizeObserver(() => requestAnimationFrame(() => {
          if (!root.classList.contains('screen-letter') || !$('.fit', root) || !$('.fit', root).isConnected) return ro.disconnect();
          fitLetter(root);
        }));
        $$('.leaf, .fit', root).forEach(el => ro.observe(el));
      },
    };
  };
  // On two pages the letter shrinks just enough that neither page needs scrolling (never below 70%).
  function fitLetter(root) {
    const leaves = $$('.leaf', root), fits = $$('.fit', root);
    const over = () => leaves.some(l => l.scrollHeight > l.clientHeight + 1);
    const set = z => fits.forEach(f => { f.style.zoom = z; });
    set(1);
    if (!document.documentElement.classList.contains('two-page') || !over()) return;
    let lo = 0.7, hi = 1;
    for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; set(mid); if (over()) hi = mid; else lo = mid; }
    set(lo);
  }

  /* Kitchen conversions */
  const VOL = { tsp: 1, tbsp: 3, 'fl oz': 6, cup: 48, pint: 96, quart: 192, gallon: 768, ml: 0.202884, l: 202.884 };
  const WT = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
  Screens.conversions = () => {
    const dry = [['1 cup', '16 tbsp', '48 tsp', '8 fl oz', '237 ml'], ['¾ cup', '12 tbsp', '36 tsp', '6 fl oz', '177 ml'], ['⅔ cup', '10 tbsp + 2 tsp', '32 tsp', '5 ⅓ fl oz', '158 ml'],
      ['½ cup', '8 tbsp', '24 tsp', '4 fl oz', '118 ml'], ['⅓ cup', '5 tbsp + 1 tsp', '16 tsp', '2 ⅔ fl oz', '79 ml'], ['¼ cup', '4 tbsp', '12 tsp', '2 fl oz', '59 ml'],
      ['⅛ cup', '2 tbsp', '6 tsp', '1 fl oz', '30 ml'], ['1 tbsp', '—', '3 tsp', '½ fl oz', '15 ml'], ['1 tsp', '—', '—', '—', '5 ml']];
    const liquid = [['1 gallon', '4 quarts', '8 pints', '16 cups', '128 fl oz', '3.8 L'], ['½ gallon', '2 quarts', '4 pints', '8 cups', '64 fl oz', '1.9 L'],
      ['1 quart', '—', '2 pints', '4 cups', '32 fl oz', '946 ml'], ['1 pint', '—', '—', '2 cups', '16 fl oz', '473 ml'], ['1 cup', '—', '—', '—', '8 fl oz', '237 ml']];
    const table = (head, rows) => `<div class="tbl-wrap noswipe"><table class="tbl"><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const opts = (o, sel) => Object.keys(o).map(k => `<option${k === sel ? ' selected' : ''}>${k}</option>`).join('');
    return {
      cls: 'screen-conv', label: 'Kitchen Conversions',
      left: `<div class="kicker">Kitchen</div><h1 class="script">Conversions</h1>
        <h2 class="sub">Quick converter</h2>
        <form class="calc" id="calc" autocomplete="off" onsubmit="return false">
          <input id="calc-n" inputmode="decimal" value="1" aria-label="Amount">
          <select id="calc-from" aria-label="From"><optgroup label="Volume">${opts(VOL, 'cup')}</optgroup><optgroup label="Weight">${opts(WT)}</optgroup><optgroup label="Oven"><option>°F</option><option>°C</option></optgroup></select>
          <span class="calc-eq">=</span>
          <output id="calc-out"></output>
          <select id="calc-to" aria-label="To"><optgroup label="Volume">${opts(VOL, 'tbsp')}</optgroup><optgroup label="Weight">${opts(WT)}</optgroup><optgroup label="Oven"><option>°F</option><option>°C</option></optgroup></select>
        </form>
        <h2 class="sub">Measuring spoons &amp; cups</h2>${table(['Cups', 'Tablespoons', 'Teaspoons', 'Fluid oz', 'Milliliters'], dry)}`,
      right: `<h2 class="sub">Liquids</h2>${table(['Gallons', 'Quarts', 'Pints', 'Cups', 'Fluid oz', 'Liters'], liquid)}
        <h2 class="sub">Handy to know</h2>
        <ul class="handy">
          <li><b>1 stick butter</b> = ½ cup = 8 tbsp = 4 oz = 113 g</li>
          <li><b>1 lb</b> = 16 oz = 454 g</li>
          <li><b>1 can (15 oz) beans</b> ≈ 1 ½ cups drained</li>
          <li><b>1 lemon</b> ≈ 2-3 tbsp juice · <b>1 lime</b> ≈ 2 tbsp</li>
          <li><b>1 clove garlic</b> ≈ 1 tsp minced</li>
          <li><b>A pinch</b> ≈ ⅛ tsp or less · <b>a dash</b> ≈ a few shakes</li>
        </ul>`,
      after(root) {
        const n = $('#calc-n', root), from = $('#calc-from', root), to = $('#calc-to', root), out = $('#calc-out', root);
        const run = () => {
          const v = Scale.num(n.value.replace(/\s+/g, ' ')), a = from.value, b = to.value;
          out.parentElement.classList.remove('mismatch');
          if (!isFinite(v)) return (out.textContent = '—');
          let r;
          if (/°/.test(a) || /°/.test(b)) r = a === b ? v : /°/.test(a) && /°/.test(b) ? (a === '°F' ? (v - 32) * 5 / 9 : v * 9 / 5 + 32) : null;
          else if (VOL[a] && VOL[b]) r = v * VOL[a] / VOL[b];
          else if (WT[a] && WT[b]) r = v * WT[a] / WT[b];
          if (r == null) out.parentElement.classList.add('mismatch');
          out.textContent = r == null ? 'pick two of the same kind' : (/°/.test(b) ? Math.round(r) + b : (r >= 20 ? Math.round(r) : Scale.frac(r) || '0'));
        };
        [n, from, to].forEach(el => el.addEventListener('input', run));
        run();
      },
    };
  };

  Screens.index = () => {
    const all = Store.all();
    const count = s => tagSection(s.id) ? tagged(s.id).length : all.filter(r => r.section === s.id).length;
    const row = s => {
      const n = count(s);
      return `<li data-id="${esc(s.id)}"><a class="toc-row c-${colorOf(s)}" href="#/s/${encodeURIComponent(s.id)}">
        <span class="toc-name">${esc(s.short || s.name)}</span><span class="toc-count">${n} recipe${n === 1 ? '' : 's'}</span>${icon('chev-right')}</a></li>`;
    };
    const fam = cloud(), ups = fam ? Store.updates().length : 0, nNew = fam ? Store.boxNew(Store.boxSeen()).length : 0;
    return {
      cls: 'screen-index', label: 'Index',
      left: `<div class="toc-head"><div><h1 class="script">Index</h1></div>
          <div class="add-menu"><button class="btn ghost sm" data-act="add-menu" data-sections="1" aria-expanded="false">${icon('plus')} Add</button></div></div>
        <ol class="toc">${Store.sections().map(row).join('')}</ol>`,
      right: `${fam ? `<a class="toc-family" href="#/box">${icon('book')}<span><b>Blue Book Recipes</b><small>The family’s shared recipes${nNew || ups ? '<span class="toc-tags">' + (nNew ? `<i class="badge new">${nNew} new</i>` : '') + (ups ? `<i class="badge">${ups} updated</i>` : '') + '</span>' : ''}</small></span>${icon('chev-right')}</a>` : ''}
        <p class="fine toc-fine">${all.length} recipes · ${all.filter(r => r.blueBook).length} from Mom’s Blue Book</p>`,
      after(root) { sortable($('.toc', root), ids => { Store.setSectionOrder(ids); render(); }); },
    };
  };

  /* Press and hold a row (or click and drag with a mouse), then move it up or down. */
  let sorting = false;
  function sortable(list, onDrop) {
    if (!list) return;
    let timer = null, drag = null, sx = 0, sy = 0, swallow = false, lastTouch = 0;
    const scroller = () => { for (let p = list.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; } return document.scrollingElement; };
    const renumber = () => [...list.children].forEach((li, i) => { const n = li.querySelector('.rnum'); if (n) n.textContent = i + 1; });
    // The row it passes slides out of the way.
    const slide = (el, fn) => {
      const a = el.offsetTop; fn(); const d = a - el.offsetTop;
      el.style.transition = 'none'; el.style.transform = `translateY(${d}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform .15s'; el.style.transform = ''; }));
    };
    const lift = (row, y) => {
      timer = null; sorting = true;
      const sc = scroller();
      drag = { row, y, sc, st: sc.scrollTop, lastY: y, raf: 0 };
      row.classList.add('lifted'); list.classList.add('sorting');
      if (navigator.vibrate) navigator.vibrate(10);
      const tick = () => {
        if (!drag) return;
        const r = drag.sc === document.scrollingElement ? { top: 0, bottom: innerHeight } : drag.sc.getBoundingClientRect();
        const edge = 60, y2 = drag.lastY;
        const step = y2 < r.top + edge ? -Math.ceil((r.top + edge - y2) / 6) : y2 > r.bottom - edge ? Math.ceil((y2 - r.bottom + edge) / 6) : 0;
        if (step) { drag.sc.scrollTop += step; move(drag.lastY); }
        drag.raf = requestAnimationFrame(tick);
      };
      drag.raf = requestAnimationFrame(tick);
    };
    const move = y => {
      drag.lastY = y;
      const r = drag.row;
      const dy = () => y - drag.y + (drag.sc.scrollTop - drag.st);
      for (let n = r.nextElementSibling; n && dy() > n.offsetHeight / 2; n = r.nextElementSibling) {
        const before = r.offsetTop; slide(n, () => list.insertBefore(n, r)); drag.y += r.offsetTop - before;
      }
      for (let p = r.previousElementSibling; p && dy() < -p.offsetHeight / 2; p = r.previousElementSibling) {
        const before = r.offsetTop; slide(p, () => list.insertBefore(r, p)); drag.y += r.offsetTop - before;
      }
      renumber();
      r.style.transform = `translateY(${dy()}px)`;
    };
    const end = () => {
      clearTimeout(timer); timer = null;
      if (!drag) return;
      const r = drag.row; cancelAnimationFrame(drag.raf); drag = null;
      r.style.transition = 'transform .15s'; r.style.transform = '';
      swallow = true; setTimeout(() => { swallow = false; }, 400);
      setTimeout(() => { sorting = false; r.classList.remove('lifted'); list.classList.remove('sorting'); onDrop([...list.children].map(li => li.dataset.id)); }, 170);
    };
    const rowAt = t => { const li = t.closest && t.closest('li'); return li && li.parentElement === list ? li : null; };

    list.addEventListener('touchstart', e => {
      lastTouch = Date.now();
      const row = rowAt(e.target);
      if (!row || e.touches.length > 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      timer = setTimeout(() => lift(row, sy), 450);
    }, { passive: true });
    list.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (drag) { e.preventDefault(); move(t.clientY); }
      else if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 8) { clearTimeout(timer); timer = null; }
    }, { passive: false });
    list.addEventListener('touchend', end);
    list.addEventListener('touchcancel', end);
    // A mouse just clicks and drags.
    list.addEventListener('mousedown', e => {
      if (e.button !== 0 || Date.now() - lastTouch < 800) return;
      const row = rowAt(e.target);
      if (!row) return;
      sx = e.clientX; sy = e.clientY;
      const mm = ev => { if (drag) move(ev.clientY); else if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { lift(row, sy); move(ev.clientY); } };
      const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); end(); };
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });
    list.addEventListener('dragstart', e => e.preventDefault());
    list.addEventListener('contextmenu', e => { if (drag || timer) e.preventDefault(); });
    list.addEventListener('click', e => { if (swallow) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  function recipeList(rs, numbered = true) {
    if (!rs.length) return '<p class="empty">No recipes here yet.</p>';
    return `<ol class="rlist${numbered ? '' : ' plain'}">${rs.map((r, i) => `<li data-id="${esc(r.id)}"><a href="#/r/${encodeURIComponent(r.id)}">
      ${numbered ? `<span class="rnum">${i + 1}</span>` : ''}${thumb(r)}
      <span class="rtext"><span class="rtitle">${esc(r.title)}</span><span class="rfrom">${kitchen(r.from)}</span></span>
      ${Store.isBookmarked(r.id) ? icon('ribbon', 'icon mark') : ''}</a></li>`).join('')}</ol>`;
  }

  // Holiday and Seasonal are filled by tags, so a recipe can be in Soups and in Fall at the same time.
  const HOLIDAYS = () => BB.menus.map(m => m.tag).concat(['Easter', 'Fourth of July']);
  const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
  const tagSection = id => id === 'holiday' || id === 'seasonal';
  const tagged = id => {
    const tags = id === 'holiday' ? HOLIDAYS() : SEASONS;
    return Store.all().filter(r => (id === 'holiday' && r.section === 'holiday') || (r.tags || []).some(t => tags.includes(t)));
  };

  Screens.section = ({ id }) => {
    const s = sectionOf(id);
    if (!s) return Screens.index();
    const byTag = tagSection(id);
    const rs = byTag ? tagged(id) : bySection(id);
    let right = recipeList(rs);
    if (byTag) {
      const all = Store.all(), blocks = [];
      if (id === 'holiday') {
        for (const tag of HOLIDAYS()) {
          const m = BB.menus.find(x => x.tag === tag) || { tag, name: tag };
          const order = m.order || [];
          const list = all.filter(r => (r.tags || []).includes(tag))
            .sort((a, b) => ((order.indexOf(a.id) + 1) || 999) - ((order.indexOf(b.id) + 1) || 999));
          if (list.length) blocks.push(`<h2 class="sub">${esc(m.name)} (${list.length})</h2>${recipeList(list, false)}${m.note ? `<div class="menu-note"><p class="hand">${esc(m.note)}</p>${(m.photos || []).map(p => img(p, '', 'menu-pic')).join('')}</div>` : ''}`);
        }
        const loose = all.filter(r => r.section === 'holiday' && !(r.tags || []).some(t => HOLIDAYS().includes(t)));
        if (loose.length) blocks.push(`<h2 class="sub">More holiday recipes (${loose.length})</h2>${recipeList(loose, false)}`);
      } else {
        for (const t of SEASONS) {
          const list = all.filter(r => (r.tags || []).includes(t));
          if (list.length) blocks.push(`<h2 class="sub">${t} (${list.length})</h2>${recipeList(list, false)}`);
        }
      }
      right = blocks.join('') || '<p class="empty">Nothing here yet.</p>';
    }
    const p = headerPhoto(s, rs);
    return {
      cls: `screen-section c-${colorOf(s)}`, label: s.name, section: id,
      left: `<div class="sec-band"></div><div class="kicker">Section</div>
        <h1 class="script sec-name">${esc(s.name)}</h1>
        <button type="button" class="sec-photo${p ? '' : ' ph'}" data-act="sec-photo" data-id="${esc(id)}" aria-label="Change the header picture">${p ? img(p, '') : icon('pot')}<span class="cam">${icon('camera')}</span></button>
        ${byTag ? `<p class="fine tag-note">Tag recipes with ${id === 'holiday' ? 'a holiday' : 'a season'} to add them here.</p>` : ''}`,
      right: `${byTag ? '' : `<h2 class="sub sub-row">Recipes (${rs.length}) <button class="btn ghost sm" data-act="new-recipe" data-section="${esc(id)}">${icon('plus')} Add</button></h2>`}${right}`,
      // Holiday and Seasonal follow Mom's menus and the seasons, so they aren't reordered.
      after(root) {
        fitTitle($('.sec-name', root));
        if (!byTag) sortable($('.rlist', root), ids => { Store.setRecipeOrder(id, ids); render(); });
      },
    };
  };
  // A section title never runs past two lines: long ones shrink just enough to fit.
  function fitTitle(el) {
    if (!el) return;
    el.style.fontSize = '';
    const lines = () => Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).fontSize) * 1.08));
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (lines() > 2 && size > 18) { size -= 1; el.style.fontSize = size + 'px'; }
  }
  window.addEventListener('resize', () => fitTitle($('.screen-section .sec-name')));
  if (document.fonts) document.fonts.ready.then(() => fitTitle($('.screen-section .sec-name')));

  /* Recipe page */
  function servesFor(r) { return scaleState[r.id] ?? r.serves ?? 4; }

  function ingredientsHtml(r) {
    const base = r.serves || 4, now = servesFor(r), f = now / base;
    let out = '', open = false;
    for (const l of lines(r.ing)) {
      if (l.startsWith('#')) { if (open) out += '</ul>'; out += `<h3 class="grp">${esc(l.replace(/^#\s*/, ''))}</h3><ul class="ing">`; open = true; continue; }
      if (!open) { out += '<ul class="ing">'; open = true; }
      out += `<li>${Scale.line(l, f, now).html}</li>`;
    }
    if (open) out += '</ul>';
    return out || '<p class="empty">No ingredients yet.</p>';
  }

  function stepsHtml(r) {
    let out = '<ol class="steps">', inStep = false, inSub = false;
    const close = () => { if (inSub) { out += '</ul>'; inSub = false; } if (inStep) { out += '</li>'; inStep = false; } };
    for (const l of lines(r.steps)) {
      if (l.startsWith('#')) { close(); out += `<li class="step-h">${esc(l.replace(/^#\s*/, ''))}</li>`; continue; }
      if (l.startsWith('- ')) {
        if (!inStep) { out += '<li class="step">'; inStep = true; }
        if (!inSub) { out += '<ul class="sub-steps">'; inSub = true; }
        out += `<li>${esc(l.slice(2))}</li>`; continue;
      }
      close(); out += `<li class="step">${esc(l)}`; inStep = true;
    }
    close();
    return out + '</ol>';
  }

  function servesHtml(r) {
    const base = r.serves || 4, now = servesFor(r), changed = Math.abs(now - base) > 1e-9;
    const tip = changed && Scale.panTip((r.ing || '') + ' ' + (r.steps || ''), now / base);
    // "batch (frosts a 9x13 cake)": on phones the part in parentheses gets its own small line under the row.
    const m = /^(.*?)\s*\((.+)\)\s*$/.exec(r.makes || ''), mk = m && m[1] ? { unit: m[1], detail: m[2] } : { unit: r.makes || '', detail: '' };
    mk.unit = Scale.unit(mk.unit, now);
    return `<div class="serves${changed ? ' changed' : ''}">
        <span class="lbl">${r.makes ? 'Makes' : 'Serves'}</span>
        <button class="sv-btn" data-act="less" aria-label="Fewer">−</button>
        ${r.box ? `<b class="sv-n">${Scale.frac(now)}</b>` : `<button class="sv-n" data-act="set-serves" title="Change how many this recipe ${r.makes ? 'makes' : 'serves'}">${Scale.frac(now)}</button>`}
        <button class="sv-btn" data-act="more" aria-label="More">+</button>
        ${r.makes ? `<span class="sv-unit">${esc(mk.unit)}${mk.detail ? `<span class="sv-paren"> (${esc(mk.detail)})</span>` : ''}</span>` : ''}
        <span class="hd">${[[1 / 2, 'Half', '½'], [2, 'Double', '2×']].map(([m, t, short]) =>
          `<button data-act="mult" data-m="${m}" aria-label="${t} it"${Math.abs(now / base - m) < 1e-9 ? ' class="on"' : ''}><span class="hd-long">${t}<span class="hd-it"> it</span></span><span class="hd-short">${short}</span></button>`).join('')}</span>
      </div>
      ${mk.detail ? `<p class="sv-detail">${esc(mk.detail)}</p>` : ''}
      ${changed ? `<p class="scaled-note">Amounts are for <b>${Scale.frac(now)}</b>${r.makes ? ' ' + esc(Scale.unit(r.makes, now)) : ''} — the recipe is written for ${Scale.frac(base)}. <button class="link" data-act="reset-scale">Back to ${Scale.frac(base)}</button>${tip ? `<span class="pan-tip">${icon('pan')} ${esc(tip)}</span>` : ''}</p>` : ''}`;
  }

  const cloud = () => Store.mode === 'cloud';
  const inFamily = () => cloud() && !!Store.family();
  const when = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  /* mode 'mine' = a recipe in your book; 'box' = the family version in Blue Book Recipes. */
  function recipePage(r, mode) {
    if (!r) return { cls: 'screen-missing', label: 'Not found', left: `<h1 class="script">Hmm…</h1><p>${mode === 'box' ? 'That recipe isn’t in Blue Book Recipes anymore.' : 'That recipe isn’t in your book anymore.'}</p><a class="btn" href="${mode === 'box' ? '#/box' : '#/index'}">${mode === 'box' ? 'Back to Blue Book Recipes' : 'Go to the index'}</a>`, right: '' };
    const mine = mode === 'mine';
    const s = sectionOf(r.section) || { name: r.sectionName || '', color: 'sage' };
    // One time on the page: Ready in, else Cook, else Prep (the others stay in Edit).
    const time = [['Ready in', r.ready], ['Cook', r.cook], ['Prep', r.prep]].find(x => x[1]);
    const meta = time ? `<span class="meta-i"><span class="lbl">${time[0]}</span> ${esc(time[1])}</span>` : '';
    const extra = [r.rating ? `<span class="stars" aria-label="${r.rating} of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` : '',
      r.difficulty ? `<span>${esc(r.difficulty)}</span>` : '', r.source ? `<span>Source: ${/^https?:\/\//.test(r.source) ? `<a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(siteName(r.source))}</a>` : esc(r.source)}</span>` : '', r.tools ? `<span>Tools: ${esc(r.tools)}</span>` : ''].filter(Boolean).join('<i>·</i>');
    const marked = mine && Store.isBookmarked(r.id);
    const layout = r.layout || 'side';

    // A newer family version waiting for you
    const upd = mine && cloud() ? Store.updates().find(u => u.mine.id === r.id) : null;
    const banner = upd ? `<div class="upd-banner">${icon('sparkle')}<div><b>${esc(upd.family.updatedByName || 'Someone')}</b> changed this recipe in Blue Book Recipes${upd.family.updated ? ' on ' + when(upd.family.updated) : ''}.
        <div class="upd-btns"><button class="btn primary sm" data-act="see-update">See what changed</button><button class="btn ghost sm" data-act="take-update">Update my copy</button><button class="link" data-act="keep-mine">Keep mine</button></div></div></div>` : '';
    const boxBanner = !mine ? `<div class="box-banner">${icon('book')}<span>The family version in <a href="#/box">Blue Book Recipes</a>${r.updatedByName && r.version > 1 ? ` · last changed by ${esc(r.updatedByName)} ${when(r.updated)}` : ''}</span></div>` : '';

    // Edit, share and history live in the ⋯ menu at the top, so the end of the recipe stays clean.
    let more, tools = '', top = '';
    if (mine) {
      let share = '';
      if (inFamily() && !upd) {
        if (!r.shared) share = `<button data-act="share">${icon('share')} Share with the family</button>`;
        else if (!Store.sameAsFamily(r.id)) share = `<button data-act="share">${icon('share')} Send my changes to the family</button>`;
        else share = `<a href="#/box/${encodeURIComponent(r.origin.id)}">${icon('check')} Same as the family version</a>`;
      }
      more = `<button data-act="write-page">${icon('marker')} Write on the page</button><button data-act="stickers">${icon('sticker')} Add stickers</button><button data-act="edit">${icon('pencil')} Edit</button>${share}${cloud() ? `<button data-act="history">${icon('undo')} History</button>` : ''}`;
    } else {
      const copy = Store.mine(r.id);
      top = copy ? `<a class="btn ghost sm" href="#/r/${encodeURIComponent(copy.id)}">${icon('book')} Open my copy</a>` : `<button class="btn ghost sm" data-act="add-from-box">${icon('plus')} Add to my book</button>`;
      more = `<button data-act="edit">${icon('pencil')} Edit the family version</button><button data-act="history">${icon('undo')} History</button>
        ${r.by && r.by === (Store.user() || {}).uid ? `<button class="danger-text" data-act="unshare">${icon('trash')} Take out of Blue Book Recipes</button>` : ''}`;
      tools = `<p class="fine r-shared">Shared by ${esc(r.byName || 'the family')}</p>`;
    }
    const moreBtn = `<button class="btn ghost sm r-more" data-act="recipe-menu" aria-label="More" title="Edit, share, history">⋯</button><template class="r-more-items">${more}</template>`;
    // iPhone: the menu is a plain pencil at the end of the Serves row instead.
    const penBtn = `<button class="r-pen" data-act="recipe-menu" aria-label="Edit and more" title="Edit, share, history">${icon('pencil')}</button><template class="r-more-items">${more}</template>`;

    const head = `<div class="r-head">${banner}${boxBanner}
        ${mine ? `<button class="ribbon${marked ? ' on' : ''}" data-act="bookmark" aria-pressed="${marked}" aria-label="Bookmark">${icon('ribbon')}</button>` : ''}
        <h1 class="script r-title">${esc(r.title)}</h1>
        ${r.from || (r.tags || []).length ? `<p class="r-from">${[r.from ? kitchen(r.from) : '', ...(r.tags || []).map(t => `<a class="r-tag" href="#/search?tag=${encodeURIComponent(t)}">${esc(t)}</a>`)].filter(Boolean).join('<i> · </i>')}</p>` : ''}
        ${r.story ? `<p class="r-story">${esc(r.story)}</p>` : ''}
        <div class="r-meta">${servesHtml(r)}${penBtn}<div class="meta-row">${meta}<div class="r-actions"><button class="btn primary sm" data-act="cook">${icon('pot')} Start cooking</button>
          ${mine ? '' : top}${moreBtn}</div></div></div>
        ${extra ? `<p class="r-extra">${extra}</p>` : ''}
      </div>`;
    const photo = `<figure class="r-photo">${r.photo
      ? `${img(r.photo, r.title)}${mine ? `<button class="photo-edit" data-act="photo" aria-label="Change photo">${icon('camera')}</button>` : ''}`
      : mine ? `<button class="photo-ph" data-act="photo">${icon('camera')}<span>Add your family photo</span></button>` : `<span class="photo-ph">${icon('pot')}<span>No photo yet</span></span>`}</figure>`;
    const ing = `<section class="r-ing"><h2 class="sub">Ingredients</h2><div id="ing-list">${ingredientsHtml(r)}</div></section>`;
    const dir = `<section class="r-dir"><h2 class="sub">Directions</h2>${stepsHtml(r)}</section>`;
    // Notes: one ruled card for typed notes and handwriting. On two pages it fills the rest of the page.
    const notes = `<section class="r-notes"><h2 class="sub notes-h">Notes <button class="notes-pen" data-act="notes-pen" aria-label="Add a note" title="Type or write a note">${icon('pencil')}</button></h2>
      <div class="ink-pad notes-pad" data-fill="1"><div class="notes-typed">${lines(r.notes || '').map(n => `<p class="hand">${esc(n)}</p>`).join('')}</div></div></section>`;

    let left, right;
    // Two pages (iPad sideways, desktop): ⋯ lives in the right page's top corner instead of beside Start cooking.
    const corner = `<div class="r-corner">${moreBtn}</div>`;
    if (layout === 'top') { left = photo + head + ing; right = corner + dir + notes + tools; }
    else if (layout === 'bottom') { left = head + ing; right = corner + dir + notes + photo + tools; }
    else { left = head + `<div class="ph-ing">${photo}${ing}</div>`; right = corner + dir + notes + tools; }

    return {
      cls: `screen-recipe layout-${layout} c-${colorOf(sectionOf(r.section))}${mine ? '' : ' is-box'}`,
      label: mine ? s.name : 'Blue Book Recipes', section: mine ? r.section : null, left, right,
      after(root) {
        const paint = () => { if (!Ink.active()) Ink.paint(root, r.ink); };
        fitServes(root);
        paint(); // now, so Notes is already its full size when the page shows
        requestAnimationFrame(paint);
        // photos change the page height once they load
        root.querySelectorAll('img').forEach(im => im.addEventListener('load', paint, { once: true }));
      },
    };
  }
  Screens.recipe = ({ id }) => recipePage(Store.get(id), 'mine');
  Screens.boxr = ({ id }) => recipePage(Store.boxGet(id), 'box');

  /* Blue Book Recipes — everything the family has shared, starting with Mom's book. */
  Screens.box = ({ q }) => {
    const fam = Store.family();
    if (!fam) return {
      cls: 'screen-box', label: 'Blue Book Recipes',
      left: `<div class="kicker">The family’s</div><h1 class="script">Blue Book Recipes</h1>
        <p>This is where the family’s shared recipes live. Start a family or join one with an invite code to see it.</p>
        <button class="btn primary" data-act="settings">${icon('gear')} Join or start a family</button>`, right: '',
    };
    if (boxSince === null) boxSince = Store.boxSeen();
    const fresh = Store.boxNew(boxSince);
    const all = Store.box(), filter = (q && q.get('f')) || 'all';
    const updates = Store.updates();
    const notMine = all.filter(b => !Store.mine(b.id));
    const shown = filter === 'new' ? notMine : filter === 'updates' ? updates.map(u => u.family) : all;
    const groups = Store.sections().map(s => [s, shown.filter(b => b.section === s.id)])
      .concat([[{ id: '_', name: 'Other recipes', color: 'sage' }, shown.filter(b => !sectionOf(b.section))]])
      .filter(g => g[1].length);
    const row = b => {
      const copy = Store.mine(b.id);
      return `<li><a href="#/box/${encodeURIComponent(b.id)}">${thumb(b)}
        <span class="rtext"><span class="rtitle">${esc(b.title)}</span><span class="rfrom">${b.blueBook ? 'Mom’s Blue Book' : 'Shared by ' + esc(b.byName || '')}${b.version > 1 ? ' · changed by ' + esc(b.updatedByName || '') : ''}</span></span>
        ${copy ? `<span class="have">${icon('check')}</span>` : ''}</a>
        ${copy ? '' : `<button class="btn ghost sm add-btn" data-act="box-add" data-id="${esc(b.id)}">${icon('plus')} Add</button>`}</li>`;
    };
    const chip = (f, t, n) => `<a class="chip${filter === f ? ' on' : ''}" href="#/box${f === 'all' ? '' : '?f=' + f}">${t}${n != null ? ` <em>${n}</em>` : ''}</a>`;
    return {
      cls: 'screen-box', label: 'Blue Book Recipes',
      left: `<div class="kicker">${esc(fam.name || 'The family')}’s</div><h1 class="script">Blue Book Recipes</h1>
        <p>Every recipe the family has shared, starting with Mom’s Blue Book. New ones land here first — tap <b>Add</b> to put one in your own book.</p>
        <div class="chips">${chip('all', 'All', all.length)}${chip('new', 'Not in my book', notMine.length)}${updates.length ? chip('updates', 'Updated', updates.length) : ''}</div>
        <p class="fine">To share one of yours, open it in your book and tap <b>Share with the family</b>.</p>`,
      right: (fresh.length && filter === 'all' ? `<h2 class="sub box-new">${icon('sparkle')} New since your last visit</h2><ol class="rlist plain box-list">${fresh.map(row).join('')}</ol>` : '')
        + (groups.length ? groups.map(([s, l]) => `<h2 class="sub c-${colorOf(sectionOf(s.id) && s)}">${esc(s.name)}</h2><ol class="rlist plain box-list">${l.map(row).join('')}</ol>`).join('')
        : `<p class="empty">${filter === 'new' ? 'You have every family recipe in your book.' : 'Nothing here yet.'}</p>`),
      after() { if (!boxMarked) { boxMarked = true; Store.markBoxSeen(); } },
    };
  };

  /* Signing in */
  Screens.signin = () => {
    const mode = authMode;
    return {
      cls: 'screen-signin', label: '',
      left: `<div class="signin-cover"><img src="cover-portrait.jpg" alt="" onerror="this.remove()"></div>`,
      right: `<img class="signin-icon" src="icon-512.png" alt="" onerror="this.remove()">
        <div class="kicker">Our family’s</div><h1 class="script signin-title">Blue Book Recipes</h1>
        <form class="signin" id="signin" autocomplete="on">
          ${mode === 'up' ? `<label class="fld"><span>Your name</span><input name="name" autocomplete="given-name" required placeholder="Name"></label>` : ''}
          <label class="fld"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="fld"><span>Password</span><input name="password" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required minlength="6">
            ${mode === 'up' ? '<small>At least 6 characters.</small>' : ''}</label>
          <p class="form-err" id="signin-err" hidden></p>
          <button class="btn primary wide" type="submit">${mode === 'up' ? 'Make my book' : 'Open my book'}</button>
          ${mode === 'up' ? '<p class="fine signin-fine">Your book starts with all of Mom’s recipes.</p>' : ''}
          <p class="signin-links">${mode === 'in'
            ? '<button type="button" class="link" data-act="forgot">Forgot your password?</button><span>New here? <button type="button" class="link" data-mode="up">Create an account</button></span>'
            : '<span>Already have a book? <button type="button" class="link" data-mode="in">Sign in</button></span>'}</p>
        </form>`,
      after(root) {
        $$('[data-mode]', root).forEach(b => b.addEventListener('click', () => { authMode = b.dataset.mode; render(); }));
        const f = $('#signin', root), errEl = $('#signin-err', root);
        f.addEventListener('submit', async e => {
          e.preventDefault();
          errEl.hidden = true;
          const btn = f.querySelector('[type=submit]'); btn.disabled = true;
          try {
            if (authMode === 'up') await Store.signUp(f.name.value.trim(), f.email.value.trim(), f.password.value);
            else await Store.signIn(f.email.value.trim(), f.password.value);
          } catch (x) {
            errEl.textContent = authError(x); errEl.hidden = false; btn.disabled = false;
          }
        });
      },
    };
  };
  let authMode = 'in';
  function authError(x) {
    const c = (x && x.code) || '';
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return 'That email and password don’t match. Try again, or tap “Forgot your password?”';
    if (/email-already-in-use/.test(c)) return 'There’s already a book for that email — tap “Sign in” instead.';
    if (/weak-password/.test(c)) return 'Pick a password with at least 6 characters.';
    if (/invalid-email/.test(c)) return 'That email doesn’t look right.';
    if (/network/.test(c)) return 'No internet connection right now.';
    if (/operation-not-allowed|configuration-not-found/.test(c)) return 'Sign-in isn’t switched on yet for Blue Book.';
    if (/too-many/.test(c)) return 'Too many tries — wait a minute and try again.';
    return 'Something went wrong (' + (c || x.message || 'unknown') + ').';
  }

  Screens.needsNet = () => ({ cls: 'screen-loading', label: '', left: `<p class="loading-msg">${icon('book')} Connect to the internet once to open your book — after that it works offline too.</p>`, right: '' });
  Screens.loading = () => ({ cls: 'screen-cover', label: 'Open the book', left: coverHtml(true), right: '', after: loadCover });

  // While you're in Blue Book Recipes the New list stays; it clears once you leave.
  let boxSince = null, boxMarked = false;

  /* First time in: join the family's book or start it. */
  Screens.welcome = () => ({
    cls: 'screen-welcome', label: 'Welcome',
    left: `<div class="kicker">Welcome</div><h1 class="script">Hi, ${esc((Store.user() || {}).name || 'there')}!</h1>
      <p>Your book is ready — it already has all of Mom’s Blue Book recipes in it. They’re your copies, so change them however your family likes them.</p>
      <p><b>Blue Book Recipes</b> is the family’s shared shelf. When someone shares a recipe or improves one, it shows up there, and you decide whether to add it or update yours.</p>`,
    right: `<div class="choice">
        <h2 class="sub">Join the family</h2>
        <p class="fine">Got an invite code from someone in the family?</p>
        <form id="join-form" class="row-form"><input name="code" placeholder="Invite code" autocapitalize="characters" autocomplete="off" required maxlength="12"><button class="btn primary" type="submit">Join</button></form>
        <p class="form-err" id="join-err" hidden></p>
      </div>
      <div class="choice">
        <h2 class="sub">Or start it</h2>
        <p class="fine">First one here? Start the family’s Blue Book Recipes and get a code to send everyone.</p>
        <form id="start-form" class="row-form"><input name="name" value="Our Family" aria-label="Family name"><button class="btn ghost" type="submit">Start</button></form>
      </div>
      <button class="link" data-act="skip-family">Not now — just open my book</button>`,
    after(root) {
      $('#join-form', root).addEventListener('submit', e => { e.preventDefault(); joinFamily(e.target.code.value, $('#join-err', root)); });
      $('#start-form', root).addEventListener('submit', e => { e.preventDefault(); startFamily(e.target.name.value.trim()); });
    },
  });

  Screens.search = ({ q }) => {
    const term = (q && q.get('q')) || '', tag = (q && q.get('tag')) || '';
    const tags = Store.tags().filter(t => Store.all().some(r => (r.tags || []).includes(t)));
    return {
      cls: 'screen-search', label: 'Search',
      left: `<div class="kicker">Find a recipe</div><h1 class="script">Search</h1>
        <label class="search-box">${icon('search')}<input id="q" type="search" placeholder="Try “chicken”, “Nona” or “cookies”" value="${esc(term)}" autocomplete="off" enterkeyhint="search"></label>
        <p class="fine">Searches recipe names, ingredients, who it’s from, stories and notes.</p>
        ${tags.length ? `<h2 class="sub">Tags</h2><div class="chips" id="tag-chips">${tags.map(t => `<button class="chip${t === tag ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}`,
      right: `<div id="results"></div>`,
      after(root) {
        const input = $('#q', root);
        let cur = tag;
        const run = () => { $('#results', root).innerHTML = searchResults(input.value, cur); fillPhotos($('#results', root)); };
        input.addEventListener('input', () => { run(); history.replaceState(null, '', '#/search' + (input.value || cur ? '?' + new URLSearchParams(Object.assign(input.value ? { q: input.value } : {}, cur ? { tag: cur } : {})) : '')); });
        $$('#tag-chips .chip', root).forEach(b => b.addEventListener('click', () => {
          cur = cur === b.dataset.tag ? '' : b.dataset.tag;
          $$('#tag-chips .chip', root).forEach(x => x.classList.toggle('on', x.dataset.tag === cur));
          run();
        }));
        run();
        if (!matchMedia('(pointer: coarse)').matches || !term) setTimeout(() => input.focus({ preventScroll: true }), 50);
      },
    };
  };

  function searchResults(text, tag) {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length && !tag) return '<p class="empty">Type above, or tap a tag.</p>';
    const hits = [];
    for (const r of Store.all()) {
      if (tag && !(r.tags || []).includes(tag)) continue;
      const title = r.title.toLowerCase(), ing = (r.ing || '').toLowerCase();
      const rest = [r.from, r.story, r.notes, r.steps, (r.tags || []).join(' '), (sectionOf(r.section) || {}).name].join(' ').toLowerCase();
      let score = 0, ok = true;
      for (const w of words) {
        const s = (title.includes(w) ? 3 : 0) + (ing.includes(w) ? 2 : 0) + (rest.includes(w) ? 1 : 0);
        if (!s) { ok = false; break; }
        score += s;
      }
      if (!ok) continue;
      const line = words.length ? lines(r.ing).find(l => words.some(w => l.toLowerCase().includes(w)) && !l.startsWith('#')) : null;
      hits.push({ r, score, line });
    }
    hits.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title));
    if (!hits.length) return '<p class="empty">Nothing found. Try a different word.</p>';
    const mark = s => { let h = esc(s); for (const w of words) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); return h; };
    return `<p class="fine">${hits.length} recipe${hits.length === 1 ? '' : 's'}</p><ol class="rlist plain">${hits.map(({ r, line }) => `<li><a href="#/r/${encodeURIComponent(r.id)}">
      ${thumb(r)}<span class="rtext"><span class="rtitle">${mark(r.title)}</span>
      <span class="rfrom">${esc((sectionOf(r.section) || {}).tab || '')}${r.from ? ' · ' + esc(r.from) : ''}</span>
      ${line && !r.title.toLowerCase().includes(words[0]) ? `<span class="rsnip">${mark(line)}</span>` : ''}</span></a></li>`).join('')}</ol>`;
  }

  Screens.bookmarks = () => {
    const rs = Store.bookmarks().map(id => Store.get(id)).filter(Boolean);
    return {
      cls: 'screen-bookmarks', label: 'Bookmarks',
      left: `<div class="kicker">Saved for later</div><h1 class="script">Bookmarks</h1>
        <p class="fine">Tap the ribbon at the top of any recipe to save it here.</p>`,
      right: rs.length ? recipeList(rs, false) : `<p class="empty">${icon('ribbon')} No bookmarks yet.</p>`,
    };
  };

  /* ---------- Drawing the book ---------- */
  let lastKey = null, inkFor = null;
  Ink.onStop = () => { inkFor = null; pendingRender = false; render(); };
  Cook.onClose = () => render();
  // "Tap to open" sits under the book on the cover.
  const coverHint = document.createElement('a');
  coverHint.className = 'cover-hint'; coverHint.hidden = true;
  book.appendChild(coverHint);

  function render() {
    if (sorting) return;
    applyDesign();
    let scr = parse(location.hash);
    if (window.BB_NEEDS_INTERNET) scr = { t: 'needsNet' };
    else if (cloud()) {
      if (!Store.authKnown) scr = { t: 'loading' };
      else if (!Store.user()) scr = { t: 'signin' };
      else if (!Store.ready) scr = { t: 'loading' };
      else if (Store.needsFamilyChoice()) scr = { t: 'welcome' };
      else if (Store.hasLocalData() && !importAsked) { importAsked = true; setTimeout(askImport, 400); }
    }
    const seq = sequence();
    const key = keyOf(scr);
    const from = seq.findIndex(s => keyOf(s) === lastKey), to = seq.findIndex(s => keyOf(s) === key);
    const dir = from >= 0 && to >= 0 && from !== to ? (to > from ? 'next' : 'prev') : (lastKey && lastKey !== key && !lastKey.startsWith('loading:') ? 'fade' : '');
    const same = lastKey === key;
    lastKey = key;

    if (Ink.active() && keyOf(scr) !== lastKey) { Ink.stop(true); return; }
    if (scr.t !== 'box' && scr.t !== 'boxr' && boxMarked) { boxSince = null; boxMarked = false; }
    // Arrows and keys turn the page with the same flip a swipe does (a finished swipe has already flipped it).
    const flipDir = (dir === 'next' || dir === 'prev') && !same && !flipDone && flipOk(seq[from], seq[to]) ? dir : '';
    const oldPage = flipDir ? snapshot() : null;
    const swiped = flipDone; flipDone = false;
    const out = (Screens[scr.t] || Screens.cover)(scr);
    const keep = same ? [spread.scrollTop, ...$$('.leaf', spread).map(l => l.scrollTop)] : null;
    spread.className = 'spread ' + (out.cls || '');
    spread.innerHTML = `<section class="leaf left">${out.left}</section><section class="leaf right">${out.right || ''}</section>`;
    if (keep) { spread.scrollTop = keep[0]; $$('.leaf', spread).forEach((l, i) => { l.scrollTop = keep[i + 1] || 0; }); }
    else { spread.scrollTop = 0; }
    if (dir && !same && !flipDir && !swiped && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spread.classList.add('turn-' + dir);
      spread.addEventListener('animationend', () => spread.classList.remove('turn-' + dir), { once: true });
    }
    book.classList.toggle('is-cover', ['cover', 'signin', 'loading', 'welcome', 'needsNet'].includes(scr.t));
    const onCover = ['cover', 'loading'].includes(scr.t);
    book.classList.toggle('on-cover', onCover);
    coverHint.hidden = !onCover;
    if (onCover) {
      const opening = scr.t === 'loading';
      coverHint.classList.toggle('opening', opening);
      coverHint.innerHTML = opening ? 'Opening your book…' : `Tap to open ${icon('chev-right')}`;
      if (opening) coverHint.removeAttribute('href'); else coverHint.setAttribute('href', '#/letter');
    }
    book.classList.toggle('no-pager', ['signin', 'welcome', 'needsNet'].includes(scr.t));
    document.body.classList.toggle('signed-out', ['signin', 'loading', 'welcome', 'needsNet'].includes(scr.t));
    fillPhotos(spread);
    if (out.after) out.after(spread);
    if (flipDir) { const f = makeFlip(flipDir, oldPage, snapshot()); f.play(1, 520, () => f.done()); }

    // Tabs down the edge, one per section.
    const active = out.section || (scr.t === 'section' ? scr.id : null);
    tabs.innerHTML = Store.sections().map(s => `<a class="tab c-${colorOf(s)}${s.id === active ? ' on' : ''}" href="#/s/${encodeURIComponent(s.id)}" title="${esc(s.name)}"><span>${esc(s.tab || s.name)}</span></a>`).join('');

    // Page turner along the bottom.
    const prev = to > 0 ? seq[to - 1] : null, next = to >= 0 && to < seq.length - 1 ? seq[to + 1] : null;
    let label = out.label || '';
    if (scr.t === 'recipe' && to >= 0) {
      const inSec = seq.filter(s => s.t === 'recipe' && (Store.get(s.id) || {}).section === out.section);
      const n = inSec.findIndex(s => s.id === scr.id) + 1;
      label = `${out.label || ''} · ${n} of ${inSec.length}`;
    }
    pager.innerHTML = `<a class="pg prev${prev ? '' : ' off'}" ${prev ? `href="${hrefOf(prev)}"` : 'aria-disabled="true"'} aria-label="Previous page">${icon('chev-left')}</a>
      <span class="pg-label">${esc(label)}</span>
      <a class="pg next${next ? '' : ' off'}" ${next ? `href="${hrefOf(next)}"` : 'aria-disabled="true"'} aria-label="Next page">${icon('chev-right')}</a>`;
    $$('.topbar [data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === scr.t));
    setTimeout(() => prefetch([next, prev]), 600);
    document.title = scr.t === 'recipe' && Store.get(scr.id) ? Store.get(scr.id).title + ' · Blue Book Recipes' : 'Blue Book Recipes';
  }

  function turn(step) {
    const seq = sequence(), i = seq.findIndex(s => keyOf(s) === keyOf(parse(location.hash)));
    const t = seq[i + step];
    if (i >= 0 && t) location.hash = hrefOf(t);
  }

  /* ---------- Turning pages: the page swings over on its spine, following your finger ---------- */
  let flipDone = false;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The cover is a different shape, so pages to and from it just fade.
  const flipOk = (a, b) => !reduceMotion() && a && b && a.t !== 'cover' && b.t !== 'cover';
  // A copy of the page as it looks right now (scroll positions included).
  // Copying a page doesn't copy what's drawn on its canvases (handwriting, Notes), so that's copied over by hand.
  function cloneDrawn(src) {
    const c = src.cloneNode(true);
    const from = src.querySelectorAll('canvas'), to = c.querySelectorAll('canvas');
    from.forEach((cv, i) => {
      const t = to[i]; if (!t || !cv.width || !cv.height) return;
      t.width = cv.width; t.height = cv.height;
      try { t.getContext('2d').drawImage(cv, 0, 0); } catch (e) {}
    });
    return c;
  }
  function snapshot() {
    const c = cloneDrawn(spread);
    c.removeAttribute('id');
    c._scroll = [spread.scrollTop, ...$$('.leaf', spread).map(l => l.scrollTop)];
    return c;
  }
  // A page that isn't showing yet, drawn off to the side so it can be turned to.
  function pageFor(scr) {
    const out = (Screens[scr.t] || Screens.cover)(scr);
    const c = document.createElement('div');
    c.className = 'spread ' + (out.cls || '');
    c.innerHTML = `<section class="leaf left">${out.left}</section><section class="leaf right">${out.right || ''}</section>`;
    c._scroll = [0, 0, 0];
    // Its writing is drawn once it's on screen in the turning sheet (it has to be laid out to be sized).
    if (scr.t === 'recipe' || scr.t === 'boxr') { const r = scr.t === 'recipe' ? Store.get(scr.id) : Store.boxGet(scr.id); c._ink = r && r.ink; c._recipe = true; }
    fillPhotos(c);
    return c;
  }
  // One side of a sheet: the whole page (one-page view) or one leaf of it (two-page view).
  function face(src, part) {
    const f = document.createElement('div');
    f.className = src.className + ' flip-face';
    f.style.cssText = part === 'all' ? '' : 'display: grid; grid-template-columns: 1fr;';
    if (part === 'all') [...src.children].forEach(n => f.appendChild(cloneDrawn(n)));
    else { const l = src.querySelector('.leaf.' + part); if (l) f.appendChild(cloneDrawn(l)); }
    return f;
  }
  function restoreScroll(f, src, part) {
    const sc = src._scroll || [];
    if (part === 'all') f.scrollTop = sc[0] || 0;
    $$('.leaf', f).forEach(l => { l.scrollTop = sc[l.classList.contains('left') ? 1 : 2] || 0; });
  }
  // Builds the turning sheet over the page: from the old page (a) to the new one (b).
  function makeFlip(dir, a, b) {
    const two = document.documentElement.classList.contains('two-page');
    const layer = document.createElement('div');
    layer.className = 'flip-layer' + (two ? ' two' : '');
    layer.style.cssText = `left:${spread.offsetLeft}px; top:${spread.offsetTop}px; width:${spread.offsetWidth}px; height:${spread.offsetHeight}px;`;
    const base = document.createElement('div'), sheet = document.createElement('div');
    base.className = 'flip-base'; sheet.className = 'flip-sheet ' + dir;
    const add = (parent, src, part, cls) => { const f = face(src, part); if (cls) f.classList.add(cls); parent.appendChild(f); return [f, src, part]; };
    const placed = [];
    if (two) {
      // Next: the right page lifts and lands on the left. Back: the left page lifts and lands on the right.
      placed.push(add(base, dir === 'next' ? a : b, 'left'), add(base, dir === 'next' ? b : a, 'right'));
      placed.push(add(sheet, a, dir === 'next' ? 'right' : 'left', 'front'));
      placed.push(add(sheet, b, dir === 'next' ? 'left' : 'right', 'back'));
    } else {
      // Next: this page lifts off its spine and turns away. Back: the page before swings back over it.
      placed.push(add(base, dir === 'next' ? b : a, 'all'));
      placed.push(add(sheet, dir === 'next' ? a : b, 'all', 'front'));
      const back = document.createElement('div'); back.className = 'flip-face back blank'; sheet.appendChild(back);
    }
    layer.append(base, sheet);
    spread.parentElement.appendChild(layer);
    $$('.sec-name', layer).forEach(fitTitle);
    // A page that hasn't been shown yet (swiping to it) gets its Notes sized and writing drawn here.
    placed.forEach(([f, src]) => { if (src._recipe) try { Ink.paint(f, src._ink); } catch (e) {} });
    placed.forEach(([f, src, part]) => restoreScroll(f, src, part));
    $$('img[data-ref]:not([src])', layer).forEach(async el => { const src = await getPhoto(el.dataset.ref); if (src) el.src = src; });
    spread.style.visibility = 'hidden';
    let p = 0;
    // One page: past 90° the sheet is behind the spine, so it only needs to swing that far to be gone.
    const angle = q => two ? (dir === 'next' ? -180 * q : 180 * q) : (dir === 'next' ? -95 * q : -95 * (1 - q));
    const set = q => { p = Math.max(0, Math.min(1, q)); sheet.style.transform = `rotateY(${angle(p)}deg)`; layer.style.setProperty('--p', p.toFixed(3)); };
    set(0);
    return {
      set,
      get p() { return p; },
      play(to, ms, cb) {
        const from = p, t0 = performance.now(), d = Math.max(120, ms * Math.abs(to - from));
        const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const step = now => { const t = Math.min(1, (now - t0) / d); set(from + (to - from) * ease(t)); if (t < 1) requestAnimationFrame(step); else cb && cb(); };
        requestAnimationFrame(step);
      },
      done() { spread.style.visibility = ''; layer.remove(); },
    };
  }

  // Swipe sideways anywhere on the page: the page follows your finger. Past a third (or a quick flick) it turns.
  let sw = null;
  book.addEventListener('touchstart', e => {
    sw = null;
    if (e.touches.length !== 1 || sorting || Ink.active() || e.target.closest('input, textarea, select, .noswipe, .lifted')) return;
    sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), mode: '' };
  }, { passive: true });
  book.addEventListener('touchmove', e => {
    if (!sw || sorting) { sw = null; return; }
    const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; } // scrolling up/down
      const step = dx < 0 ? 1 : -1;
      const seq = sequence(), i = seq.findIndex(s => keyOf(s) === keyOf(parse(location.hash)));
      const target = i >= 0 ? seq[i + step] : null;
      if (!target) { sw = null; return; }
      sw.target = target; sw.step = step;
      if (flipOk(seq[i], target)) { sw.mode = 'flip'; sw.flip = makeFlip(step > 0 ? 'next' : 'prev', snapshot(), pageFor(target)); }
      else sw.mode = 'plain';
    }
    e.preventDefault();
    sw.dx = dx; sw.last = { x: t.clientX, time: Date.now() };
    if (sw.mode === 'flip') {
      const w = document.documentElement.classList.contains('two-page') ? spread.offsetWidth / 2 : spread.offsetWidth;
      sw.flip.set((sw.step > 0 ? -dx : dx) / (w * 0.95));
    }
  }, { passive: false });
  const swipeEnd = () => {
    if (!sw || !sw.mode) { sw = null; return; }
    const s = sw; sw = null;
    const v = (s.dx || 0) / Math.max(1, Date.now() - s.t);
    const flick = Math.abs(v) > 0.45 && Math.sign(s.dx) === -s.step;
    if (s.mode === 'plain') { if (Math.abs(s.dx) > 60 || flick) location.hash = hrefOf(s.target); return; }
    const go = s.flip.p > 0.33 || flick;
    s.flip.play(go ? 1 : 0, 420, () => {
      if (go) { flipDone = true; location.hash = hrefOf(s.target); requestAnimationFrame(() => setTimeout(() => s.flip.done(), 60)); }
      else s.flip.done();
    });
  };
  book.addEventListener('touchend', swipeEnd);
  book.addEventListener('touchcancel', swipeEnd);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || !$('#sheet-wrap').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') turn(1);
    if (e.key === 'ArrowLeft') turn(-1);
  });

  /* ---------- Recipe page actions ---------- */
  function currentRecipe() { const p = parse(location.hash); return p.t === 'recipe' ? Store.get(p.id) : p.t === 'boxr' ? Store.boxGet(p.id) : null; }
  function refreshScale(r) {
    const m = $('.r-meta', spread);
    m.querySelector('.serves').remove();
    m.querySelectorAll('.scaled-note, .sv-detail').forEach(x => x.remove());
    m.insertAdjacentHTML('afterbegin', servesHtml(r));
    fitServes(spread);
    $('#ing-list', spread).innerHTML = ingredientsHtml(r);
  }
  // Phones: if a long "Makes" word (sandwiches) can't fit on the row, the little MAKES label steps aside for it.
  function fitServes(root) {
    const sv = $('.serves', root), u = sv && $('.sv-unit', sv);
    if (!u) return;
    sv.classList.remove('tight');
    if (u.scrollWidth > u.clientWidth + 1 || u.getClientRects().length > 1 || u.offsetHeight > 24) sv.classList.add('tight');
  }

  const actions = {
    'recipe-menu'(r, el) { openMenu(el, el.nextElementSibling.innerHTML); },
    less(r) { const n = servesFor(r); scaleState[r.id] = n > 1 ? (Number.isInteger(n) ? n - 1 : Math.floor(n)) : Math.max(0.25, n / 2); refreshScale(r); },
    more(r) { const n = servesFor(r); scaleState[r.id] = n < 1 ? Math.min(1, n * 2) : (Number.isInteger(n) ? n + 1 : Math.ceil(n)); refreshScale(r); },
    // Half it / Double it; tapping the one that's on goes back to the recipe's own amount.
    mult(r, el) { const base = r.serves || 4, m = +el.dataset.m; if (Math.abs(servesFor(r) / base - m) < 1e-9) delete scaleState[r.id]; else scaleState[r.id] = base * m; refreshScale(r); },
    'reset-scale'(r) { delete scaleState[r.id]; refreshScale(r); },
    // Tap the number: change how many the recipe itself serves (Half / Double are just for today).
    async 'set-serves'(r) {
      const v = await ask(r.makes ? `How many ${Scale.unit(r.makes, 2)} does this recipe make?` : 'How many does this recipe serve?', { ok: 'Save', input: String(r.serves || 4) });
      if (v == null) return;
      const n = Scale.num(v);
      if (!isFinite(n) || n <= 0) return toast('Type a number, like 4.');
      const mine = Store.get(r.id); if (!mine) return;
      Store.save(Object.assign({}, mine, { serves: n, est: false }));
      delete scaleState[r.id]; render();
    },
    bookmark(r, el) {
      const on = Store.toggleBookmark(r.id);
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on));
      toast(on ? 'Bookmarked' : 'Bookmark removed');
    },
    async photo(r) {
      const data = await pickImage();
      if (!data) return;
      r.photo = await Photos.put(data);
      Store.save(r); render(); toast('Photo added');
    },
    edit(r) { openEditor(r, null, r.box ? { box: true } : {}); },
    cook(r) { Cook.open(r, servesFor(r), n => { scaleState[r.id] = n; }); },
    // where: 'pad' (the Notes card, from its ✎) or 'page' (right on the recipe, from ⋯). tool 'sticker' opens with stickers.
    write(r, where = 'page', tool = 'pen') {
      inkFor = r.id; render();
      Ink.start(spread, Store.get(r.id), { where, tool }, (ink, size) => {
        if (size > 800000) toast('This recipe has a lot of writing — it may be getting too big to save. Try the eraser on old notes.', 5000);
        Store.saveInk(r.id, ink);
      });
    },
    async share(r) {
      const again = r.shared;
      const ok = await ask(again
        ? 'Send your changes to the family? Blue Book Recipes gets your version, and everyone who has this recipe will be asked if they want to update theirs.'
        : 'Share this recipe with the family? It goes into Blue Book Recipes (with its photo and notes) for everyone to add to their own book.', { ok: again ? 'Send my changes' : 'Share it' });
      if (!ok) return;
      try { await Store.share(r.id); toast(again ? 'Sent to Blue Book Recipes' : 'Shared with the family'); render(); }
      catch (e) { console.warn(e); toast('That didn’t go through — check your internet and try again.', 4000); }
    },
    history(r) { openHistory(r); },
    'see-update'(r) { openUpdate(r); },
    async 'take-update'(r) {
      if (!await ask('Replace your copy with the family’s new version? Your current version is saved in History, so you can go back.', { ok: 'Update my copy' })) return;
      delete scaleState[r.id]; Store.updateFromBox(r.id); toast('Updated');
    },
    'keep-mine'(r) { Store.keepMine(r.id); toast('Kept your version'); },
    // ✎ beside Notes: type or write on your copy. On a family version it takes you to your own copy first.
    async 'notes-pen'(r, el) {
      if (r.box) {
        let copy = Store.mine(r.id);
        if (!copy) {
          if (!await ask('Add this to your book to write notes on it?', { ok: 'Add' })) return;
          const id = Store.addFromBox(r.id); if (!id) return;
          toast('Added to your book');
          copy = { id };
        }
        location.hash = '#/r/' + encodeURIComponent(copy.id);
        return setTimeout(() => { const n = $('.r-notes', spread); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 500);
      }
      openMenu(el, `<button data-act="note-type">${icon('pencil')} Type a note</button><button data-act="note-write">${icon('marker')} Write or draw</button>`);
    },
    'note-write'(r) { actions.write(r, 'pad'); },
    'write-page'(r) { actions.write(r, 'page'); },
    stickers(r) { actions.write(r, 'page', 'sticker'); },
    // Type right on the lines; it saves when you tap away (or Done).
    'note-type'(r) {
      const box = $('.notes-typed', spread); if (!box) return;
      box.innerHTML = `<textarea class="notes-input hand" rows="1" placeholder="Type a note…">${esc(r.notes || '')}</textarea>`;
      const ta = $('textarea', box), h = $('.notes-h', spread);
      h.insertAdjacentHTML('beforeend', '<button class="link notes-done">Done</button>');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(32, Math.ceil(ta.scrollHeight / 32) * 32) + 'px'; Ink.paint(spread, r.ink); };
      ta.addEventListener('input', grow);
      let saved = false;
      const save = () => {
        if (saved) return; saved = true;
        const mine = Store.get(r.id), v = ta.value.replace(/\s+$/, '');
        if (mine && v !== (mine.notes || '')) Store.save(Object.assign({}, mine, { notes: v }));
        setTimeout(render, 0);
      };
      ta.addEventListener('blur', save);
      h.querySelector('.notes-done').addEventListener('click', save);
      grow(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    },
    'add-from-box'(r) { const id = Store.addFromBox(r.id); toast('Added to your book'); if (id) setTimeout(() => { location.hash = '#/r/' + encodeURIComponent(id); }, 300); },
    async unshare(r) {
      if (!await ask('Take this recipe out of Blue Book Recipes? It stays in everyone’s own book if they already added it.', { ok: 'Take it out', danger: true })) return;
      await Store.removeFromBox(r.id); location.hash = '#/box'; toast('Taken out of Blue Book Recipes');
    },
  };

  document.addEventListener('click', async e => {
    // "+ Add" menus (Index and the top bar): any tap closes an open one; tapping a button opens it.
    const open = $('.add-pop.floating');
    if (open) { open.remove(); if (open._from && open._from.contains(e.target)) return; }
    const am = e.target.closest('[data-act="add-menu"]');
    if (am) return openAddMenu(am);
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'new-recipe') return openEditor(null, el.dataset.section);
    if (act === 'new-section') return newSection();
    if (act === 'import-link') return importLink();
    if (act === 'import-text') return importText();
    if (act === 'sec-photo') return pickSectionPhoto(el.dataset.id);
    if (act === 'settings') return openSettings();
    if (act === 'box-add') { e.preventDefault(); Store.addFromBox(el.dataset.id); return toast('Added to your book'); }
    if (act === 'skip-family') { await Store.skipFamily(); location.hash = '#/index'; return; }
    if (act === 'forgot') return forgot();
    if (act === 'sign-out') { if (await ask('Sign out of Blue Book on this device?', { ok: 'Sign out' })) { closeSheet(); await Store.signOut(); } return; }
    if ((el.closest('#spread') || el.closest('.add-pop.floating')) && actions[act]) {
      const r = currentRecipe();
      if (r) { e.preventDefault(); actions[act](r, el); }
    }
  });

  /* ---------- Sheets, dialogs, toasts ---------- */
  const wrap = $('#sheet-wrap'), sheet = $('#sheet');
  let sheetClose = null;
  function openSheet(html, onClose) {
    sheet.innerHTML = html; wrap.hidden = false; sheet.scrollTop = 0;
    document.body.classList.add('sheet-open');
    sheetClose = onClose || null;
    requestAnimationFrame(() => wrap.classList.add('show'));
  }
  let pendingRender = false;
  function closeSheet() {
    wrap.classList.remove('show'); document.body.classList.remove('sheet-open');
    if (pendingRender) { pendingRender = false; setTimeout(render, 0); }
    setTimeout(() => { wrap.hidden = true; sheet.innerHTML = ''; }, 200);
    if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
  }
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden && $('#dialog-wrap').hidden) closeSheet(); });

  function ask(message, { ok = 'OK', cancel = 'Cancel', danger = false, input = null } = {}) {
    return new Promise(resolve => {
      const dw = $('#dialog-wrap'), d = $('#dialog');
      d.innerHTML = `<p>${esc(message)}</p>${input != null ? `<input id="dlg-in" value="${esc(input)}">` : ''}
        <div class="dlg-btns"><button class="btn ghost" data-v="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(ok)}</button></div>`;
      dw.hidden = false;
      const inp = $('#dlg-in', d);
      if (inp) { inp.focus(); inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); }); }
      const done = v => { dw.hidden = true; resolve(input != null ? (v ? inp.value.trim() : null) : v); };
      d.onclick = e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); };
    });
  }

  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- Sections ---------- */
  async function newSection() {
    const name = await ask('Name the new section', { ok: 'Add', input: '' });
    if (!name) return;
    const id = Store.addSection(name);
    location.hash = '#/s/' + id;
  }
  // Pick a section's header picture: one of its recipe photos, your own, or back to the Blue Book one.
  function pickSectionPhoto(id) {
    const s = sectionOf(id); if (!s) return;
    const rs = tagSection(id) ? tagged(id) : bySection(id);
    const mine = (Store.settings().sectionPhotos || {})[id];
    const cur = headerPhoto(s, rs);
    const refs = [...new Set(rs.map(r => r.photo).filter(Boolean))];
    const save = ref => {
      const all = Object.assign({}, Store.settings().sectionPhotos || {});
      if (ref) all[id] = ref; else delete all[id];
      Store.setSetting('sectionPhotos', Object.keys(all).length ? all : null);
      closeSheet(); render();
    };
    openSheet(`<div class="sec-pick"><div class="sheet-head"><button type="button" class="btn ghost" data-close>Cancel</button><h2>Header picture</h2><span></span></div>
      <p class="fine">For <b>${esc(s.short || s.name)}</b> in your book.</p>
      <button type="button" class="btn ghost" id="sp-upload">${icon('camera')} Upload a photo…</button>
      ${mine ? `<button type="button" class="link" id="sp-default">Use the Blue Book picture</button>` : ''}
      ${refs.length ? `<span class="lbl">Photos in this section</span><div class="pick-grid">${refs.map(ref => `<button type="button" class="${ref === cur ? 'on' : ''}" data-ref-pick="${esc(ref)}">${img(ref, '')}</button>`).join('')}</div>` : ''}
    </div>`);
    fillPhotos(sheet);
    sheet.onclick = async e => {
      const b = e.target.closest('[data-ref-pick]');
      if (b) return save(b.dataset.refPick);
      if (e.target.closest('#sp-default')) return save(null);
      if (e.target.closest('#sp-upload')) { const data = await pickImage(); if (data) save(await Photos.put(data)); }
    };
  }

  /* ---------- Adding recipes: new, import from a link, or paste the text ---------- */
  // A small menu under a button (the "+ Add" menus and a recipe's ⋯).
  function openMenu(btn, html) {
    const m = document.createElement('div');
    m.className = 'add-pop floating'; m._from = btn;
    m.innerHTML = html;
    document.body.appendChild(m);
    const b = btn.getBoundingClientRect();
    m.style.top = (b.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, b.right - m.offsetWidth)) + 'px';
  }
  function openAddMenu(btn) {
    openMenu(btn, `<button data-act="new-recipe">${icon('pot')} New recipe</button>
      <button data-act="import-link">${icon('share')} Import from a link</button>
      <button data-act="import-text">${icon('pencil')} Paste recipe text</button>
      ${btn.dataset.sections ? `<button data-act="new-section">${icon('index')} New section</button>` : ''}`);
  }
  const siteName = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  const helperUrl = () => (typeof importHelperUrl !== 'undefined' && importHelperUrl) || '';

  // Text from a web page can carry &amp; and friends.
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value.replace(/\s+/g, ' ').trim(); };
  // "PT1H20M" → "1 hr 20 min"
  function duration(iso) {
    const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso || '');
    if (!m || !(m[1] || m[2] || m[3])) return '';
    const all = ((+m[1] || 0) * 24 + (+m[2] || 0)) * 60 + (+m[3] || 0), h = Math.floor(all / 60), min = all % 60;
    return [h ? h + ' hr' : '', min ? min + ' min' : ''].filter(Boolean).join(' ');
  }
  // "Makes 24 cookies" → makes, "Serves 4" → serves
  function servings(y) {
    // A plain number is the servings; otherwise use the first description ("Makes 2 dozen").
    const s = decode(Array.isArray(y) ? y.find(x => /^\s*\d+\s*$/.test(String(x))) || y[0] : y);
    const n = parseInt((s.match(/\d+/) || [])[0], 10);
    if (!n) return {};
    const word = (s.replace(/^[^\d]*\d+(?:\s*(?:-|to)\s*\d+)?\s*/, '').match(/^[a-z]+/i) || [''])[0].toLowerCase();
    return word && !/^(servings?|serves|people|persons?|portions?|plates?)$/.test(word) ? { serves: n, makes: word } : { serves: n };
  }
  // The page's "recipe card" data (schema.org Recipe), wherever it's tucked.
  function findRecipe(blocks) {
    const isRecipe = o => o && [].concat(o['@type'] || []).some(t => /recipe/i.test(t));
    const walk = o => {
      if (!o || typeof o !== 'object') return null;
      if (isRecipe(o)) return o;
      for (const v of Array.isArray(o) ? o : [o['@graph'], o.mainEntity, o.itemListElement].filter(Boolean)) { const f = walk(v); if (f) return f; }
      return null;
    };
    for (const b of blocks || []) { try { const f = walk(JSON.parse(b)); if (f) return f; } catch (e) {} }
    return null;
  }
  function steps(ins) {
    const out = [];
    const add = x => {
      if (!x) return;
      if (typeof x === 'string') return decode(x).split(/\n+|(?<=\.)\s{2,}/).map(t => t.trim()).filter(Boolean).forEach(t => out.push(t));
      if (Array.isArray(x)) return x.forEach(add);
      if (/HowToSection/i.test([].concat(x['@type'] || []).join())) { if (x.name) out.push('# ' + decode(x.name)); return add(x.itemListElement); }
      add(x.text || x.name || '');
    };
    add(ins);
    return out.map(t => t.startsWith('# ') ? t : t.replace(/^(step\s*)?\d+[.):]\s*/i, '')).join('\n');
  }
  const imageOf = im => { im = Array.isArray(im) ? im[im.length - 1] : im; return typeof im === 'string' ? im : (im && (im.url || im.contentUrl)) || ''; };

  async function photoFrom(url) {
    try {
      const r = await fetch(helperUrl() + '?img=' + encodeURIComponent(url));
      if (!r.ok) return null;
      return await Photos.put(await shrink(await r.blob()));
    } catch (e) { return null; }
  }

  async function importLink() {
    const link = await ask('Paste the link to the recipe.', { ok: 'Import', input: '' });
    if (!link) return;
    if (!/^https?:\/\//i.test(link)) return toast('That doesn’t look like a web link.', 3000);
    if (!helperUrl()) { toast('Importing from links isn’t set up yet — try Paste recipe text.', 4000); return importText(); }
    if (!navigator.onLine) return toast('You’re offline — importing a link needs the internet.', 3500);
    toast('Getting the recipe…', 15000);
    let page;
    try {
      const r = await fetch(helperUrl() + '?url=' + encodeURIComponent(link));
      page = await r.json();
      if (!r.ok) throw new Error(page.error || r.status);
    } catch (e) { return toast('That page couldn’t be opened. Try Paste recipe text instead.', 4500); }
    // Some sites (Allrecipes, Simply Recipes…) turn the helper away.
    if (page.status >= 400 && !findRecipe(page.ld)) { toast(`${siteName(link)} doesn’t allow importing — copy the recipe from the page and paste it here instead.`, 6000); return importText(); }
    const rec = findRecipe(page.ld);
    let draft;
    if (rec) {
      draft = Object.assign({
        title: decode(rec.name || page.ogTitle || page.title),
        story: decode(rec.description || '').slice(0, 400),
        prep: duration(rec.prepTime), cook: duration(rec.cookTime), ready: duration(rec.totalTime),
        ing: [].concat(rec.recipeIngredient || rec.ingredients || []).map(decode).filter(Boolean).join('\n'),
        steps: steps(rec.recipeInstructions),
      }, servings(rec.recipeYield));
    } else {
      draft = parseRecipeText(page.text || '');
      draft.title = decode(page.ogTitle || page.title) || draft.title;
    }
    draft.source = page.url || link;
    const img = rec ? imageOf(rec.image) : page.ogImage;
    if (img) { toast('Getting the photo…', 15000); draft.photo = await photoFrom(new URL(img, page.url || link).href); }
    toast(rec ? 'Check it over, pick a section, and save.' : 'That page had no recipe card — check what was filled in.', 4000);
    openEditor(null, null, { draft });
  }

  // Copied text (a website, an email, a text message) → title, ingredients and steps.
  function parseRecipeText(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.replace(/^[\s•▢☐□✓*·–-]+/, '').trim()).filter(Boolean);
    const d = { title: '', story: '', ing: '', steps: '' };
    const ingHead = /^(ingredients?|you(?:'|’)ll need|what you need)\s*:?\s*$/i;
    const stepHead = /^(directions|instructions|method|steps|preparation|how to make( it)?)\s*:?\s*$/i;
    const qty = /^([\d½⅓⅔¼¾⅛⅜⅝⅞]|a (pinch|dash|handful)|one |two |three |half )/i;
    let mode = 'top';
    const ing = [], st = [], top = [];
    for (const l of lines) {
      if (ingHead.test(l)) { mode = 'ing'; continue; }
      if (stepHead.test(l)) { mode = 'steps'; continue; }
      let m;
      if ((m = l.match(/^(?:serves|servings|yield|makes)\s*:?\s*(.+)$/i))) { Object.assign(d, servings(m[1])); continue; }
      if ((m = l.match(/^prep(?:aration)?(?: time)?\s*:\s*(.+)$/i))) { d.prep = m[1]; continue; }
      if ((m = l.match(/^cook(?:ing)?(?: time)?\s*:\s*(.+)$/i))) { d.cook = m[1]; continue; }
      if (mode === 'ing') ing.push(l);
      else if (mode === 'steps') st.push(l.replace(/^(step\s*)?\d+[.):]\s*/i, ''));
      else top.push(l);
    }
    // No headings: amounts at the start of a line are ingredients, sentences after them are steps.
    if (!ing.length && !st.length) {
      let seen = false;
      for (const l of top.splice(1)) {
        if (qty.test(l) && l.length < 90 && !st.length) { ing.push(l); seen = true; }
        else if (seen) st.push(l.replace(/^(step\s*)?\d+[.):]\s*/i, ''));
        else top.push(l);
      }
    }
    d.title = (top.shift() || '').slice(0, 120);
    d.story = top.join(' ').slice(0, 400);
    d.ing = ing.join('\n'); d.steps = st.join('\n');
    return d;
  }
  function importText() {
    openSheet(`<form class="paste-in" id="paste-form"><div class="sheet-head"><button type="button" class="btn ghost" data-close>Cancel</button><h2>Paste a recipe</h2><button class="btn primary" type="submit">Fill in</button></div>
      <p class="fine">Copy the recipe from a website, email or text — the name, ingredients and directions — and paste it here. You’ll check it before it’s saved.</p>
      <textarea name="text" rows="14" placeholder="Grandma’s Banana Bread&#10;&#10;Ingredients&#10;3 ripe bananas&#10;1 cup sugar&#10;…&#10;&#10;Directions&#10;Heat the oven to 350°…"></textarea>
    </form>`);
    $('#paste-form', sheet).addEventListener('submit', e => {
      e.preventDefault();
      const t = e.target.text.value.trim();
      if (!t) return toast('Paste the recipe first.');
      const draft = parseRecipeText(t);
      if (!draft.ing && !draft.steps) toast('Couldn’t tell the ingredients from the steps — fill those in below.', 4000);
      openEditor(null, null, { draft });
    });
  }

  /* ---------- Stickers: the Blue Book set, something you copied, or a photo ---------- */
  // Your own pictures keep see-through edges (a "Copy Subject" cutout stays a cutout).
  async function stickerData(blob, max = 600) {
    const url = URL.createObjectURL(blob);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = false;
      for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { clear = true; break; }
      return clear ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
  }
  function pickFile() {
    return new Promise(resolve => {
      const input = $('#file'); input.value = '';
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }
  Ink.say = msg => toast(msg, 2200);
  Ink.pickSticker = () => new Promise(resolve => {
    let picked = null;
    const finish = async (blob, ref) => {
      try {
        if (blob) { toast('Adding your sticker…', 8000); ref = await Photos.put(await stickerData(blob)); toast('Drag it, pinch to size and turn it.', 3000); }
        picked = { ref, builtIn: !blob };
      } catch (e) { toast('That picture couldn’t be used.', 3000); }
      closeSheet();
    };
    openSheet(`<div class="stk-pick"><div class="sheet-head"><button type="button" class="btn ghost" data-close>Cancel</button><h2>Add a sticker</h2><span></span></div>
      <div class="row-btns"><button type="button" class="btn ghost" id="stk-paste">${icon('share')} Paste</button><button type="button" class="btn ghost" id="stk-photo">${icon('camera')} Photos…</button></div>
      <p class="fine">Tip: in Photos, press and hold someone or something in a picture, tap <b>Copy</b>, then come back and tap <b>Paste</b> — it comes in cut out, like a real sticker.</p>
      <span class="lbl">Blue Book stickers</span>
      <div class="stk-grid">${BBStickers.map(s => `<button type="button" data-stk="${s.id}" aria-label="${esc(s.name)}">${s.svg}</button>`).join('')}</div>
    </div>`, () => resolve(picked));
    sheet.onclick = async e => {
      const b = e.target.closest('[data-stk]');
      if (b) return finish(null, 'bb:' + b.dataset.stk);
      if (e.target.closest('#stk-photo')) { const f = await pickFile(); if (f) finish(f); return; }
      if (e.target.closest('#stk-paste')) {
        try {
          for (const item of await navigator.clipboard.read()) {
            const t = item.types.find(x => x.startsWith('image/'));
            if (t) return finish(await item.getType(t));
          }
          toast('There’s no picture to paste — copy one first.', 3500);
        } catch (x) { toast('There’s no picture to paste — copy one first.', 3500); }
      }
    };
  });

  async function renameSection(id) {
    const s = sectionOf(id); if (!s) return;
    const name = await ask('Rename this section', { ok: 'Save', input: s.short || s.name });
    if (!name) return;
    Store.renameSection(id, name); render();
  }

  /* ---------- Editor ---------- */
  const onePanUnit = t => /\b(cheese)?cake\b|\btorte\b/i.test(t) ? 'cake' : /\bpie\b/i.test(t) ? 'pie' : /\bbrownies?\b|\bbars\b|\bblondies\b/i.test(t) ? 'pan' : '';
  function openEditor(r, sectionId, opts = {}) {
    const isNew = !r, toBox = !!opts.box;
    const me = Store.settings().name;
    r = r || Object.assign({ title: '', from: me || '', section: sectionId || (parse(location.hash).t === 'section' ? parse(location.hash).id : 'entrees'), serves: 4, est: false, layout: 'side', tags: [], ing: '', steps: '', notes: '' }, opts.draft || {});
    let photo = r.photo || null;
    const tags = new Set(r.tags || []);
    const layouts = [['side', 'Photo beside ingredients'], ['top', 'Photo on top'], ['bottom', 'Photo on the bottom']];
    const mini = l => `<span class="mini mini-${l}"><i class="m-photo"></i><i class="m-a"></i><i class="m-b"></i></span>`;

    openSheet(`<form class="editor" id="editor" autocomplete="off">
      <div class="sheet-head"><button type="button" class="btn ghost" data-close>Cancel</button><h2>${isNew ? 'New recipe' : toBox ? 'Edit the family version' : 'Edit recipe'}</h2><button class="btn primary" type="submit">Save</button></div>
      ${toBox ? `<p class="box-note">${icon('book')} This changes the recipe in Blue Book Recipes. Everyone who has it gets asked if they want your changes — nobody’s own copy changes by itself.</p>` : ''}
      <label class="fld"><span>Recipe name</span><input name="title" required value="${esc(r.title)}" placeholder="Nona’s Goulash"></label>
      <div class="fld-row">
        <label class="fld"><span>From ___’s Kitchen</span><input name="from" value="${esc(r.from || '')}" placeholder="Mom"></label>
        <label class="fld"><span>Section</span><select name="section">${sectionOf(r.section) ? '' : `<option value="${esc(r.section || 'entrees')}" selected>${esc(r.sectionName || 'Other')}</option>`}${Store.sections().filter(s => s.id !== 'seasonal').map(s => `<option value="${esc(s.id)}"${s.id === r.section ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">+ New section…</option></select></label>
      </div>
      <label class="fld"><span>A little story <em>(optional)</em></span><textarea name="story" rows="2" placeholder="Where it came from, who loves it…">${esc(r.story || '')}</textarea></label>
      <fieldset class="fld serves-fld"><legend>How much it makes</legend>
        <div class="seg"><label><input type="radio" name="kind" value="serves"${r.makes ? '' : ' checked'}> Serves</label><label><input type="radio" name="kind" value="makes"${r.makes ? ' checked' : ''}> Makes</label></div>
        <input name="serves" class="num" inputmode="decimal" value="${esc(Scale.frac(r.serves || 4))}" aria-label="Number">
        <input name="makes" class="unit" value="${esc(r.makes || '')}" placeholder="dozen, loaves…" aria-label="What it makes"${r.makes ? '' : ' hidden'}>
        <label class="check"><input type="checkbox" name="est"${r.est ? ' checked' : ''}> This is a guess</label>
      </fieldset>
      <div class="fld-row three">
        <label class="fld"><span>Prep</span><input name="prep" value="${esc(r.prep || '')}" placeholder="15 min"></label>
        <label class="fld"><span>Cook</span><input name="cook" value="${esc(r.cook || '')}" placeholder="45 min"></label>
        <label class="fld"><span>Ready in</span><input name="ready" value="${esc(r.ready || '')}" placeholder="1 hr"></label>
      </div>
      <fieldset class="fld"><legend>Page layout</legend><div class="layouts">${layouts.map(([v, t]) =>
        `<label class="lay"><input type="radio" name="layout" value="${v}"${(r.layout || 'side') === v ? ' checked' : ''}>${mini(v)}<span>${t}${v === 'side' ? ' <em>(usual)</em>' : ''}</span></label>`).join('')}</div></fieldset>
      <div class="fld"><span class="fld-l">Photo</span><div class="photo-pick" id="photo-pick"></div></div>
      <label class="fld"><span>Ingredients</span><textarea name="ing" rows="10" placeholder="1 lb ground beef&#10;1 onion, chopped&#10;# Sauce&#10;2 cups tomato sauce">${esc(r.ing || '')}</textarea>
        <small>One per line. Start a line with <b>#</b> to make a heading, like <b># Dressing</b>. Put the amount first (“1 ½ cups flour”) so it can change with the servings.</small></label>
      <label class="fld"><span>Directions</span><textarea name="steps" rows="10" placeholder="Brown the beef and drain the fat.&#10;Add the onion…">${esc(r.steps || '')}</textarea>
        <small>One step per line. Start a line with <b>-</b> for a smaller step under the one above, or <b>#</b> for a heading.</small></label>
      <label class="fld"><span>Notes &amp; tweaks</span><textarea name="notes" rows="3" placeholder="Nick likes extra garlic…">${esc(r.notes || '')}</textarea></label>
      <div class="fld"><span class="fld-l">Tags</span><div class="chips" id="ed-tags"></div>
        <div class="tag-add"><input id="tag-new" placeholder="Add your own tag (like Gluten-Free)"><button type="button" class="btn ghost" id="tag-add">Add</button></div></div>
      <details class="fld more"${r.rating || r.difficulty || r.source || r.tools ? ' open' : ''}><summary>More details</summary>
        <div class="fld-row">
          <label class="fld"><span>Rating</span><select name="rating"><option value="">—</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}"${+r.rating === n ? ' selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></label>
          <label class="fld"><span>Difficulty</span><select name="difficulty"><option value="">—</option>${['Easy', 'Medium', 'Hard'].map(d => `<option${r.difficulty === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        </div>
        <label class="fld"><span>Source</span><input name="source" value="${esc(r.source || '')}" placeholder="A cookbook, a website, Aunt Judy…"></label>
        <label class="fld"><span>Tools needed</span><input name="tools" value="${esc(r.tools || '')}" placeholder="Crock pot, 9x13 pan…"></label>
      </details>
      ${isNew || toBox ? '' : `<div class="danger-zone">
        ${r.blueBook && r.edited ? `<button type="button" class="btn ghost" id="ed-restore">${icon('undo')} Go back to Mom’s original</button>` : ''}
        <button type="button" class="btn ghost danger-text" id="ed-remove">${icon('trash')} Remove from my book</button>
      </div>`}
    </form>`);

    const form = $('#editor', sheet);
    const drawPhoto = async () => {
      const pp = $('#photo-pick', form);
      const src = photo && await Photos.get(photo);
      pp.innerHTML = src ? `<img src="${esc(src)}" alt=""><div><button type="button" class="btn ghost" data-ph="change">${icon('camera')} Change</button><button type="button" class="btn ghost" data-ph="remove">Remove</button></div>`
        : `<button type="button" class="btn ghost" data-ph="change">${icon('camera')} Add a photo</button>`;
    };
    form.addEventListener('click', async e => {
      const b = e.target.closest('[data-ph]'); if (!b) return;
      if (b.dataset.ph === 'remove') { photo = null; return drawPhoto(); }
      const data = await pickImage();
      if (data) { photo = await Photos.put(data); drawPhoto(); }
    });
    drawPhoto();

    const drawTags = () => {
      const all = [...new Set(BB.builtInTags.concat(Store.tags(), [...tags]))];
      $('#ed-tags', form).innerHTML = all.map(t => `<button type="button" class="chip${tags.has(t) ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
    };
    $('#ed-tags', form).addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (!b) return; tags.has(b.dataset.tag) ? tags.delete(b.dataset.tag) : tags.add(b.dataset.tag); drawTags(); });
    const addTag = () => {
      const v = $('#tag-new', form).value.trim(); if (!v) return;
      tags.add(v); $('#tag-new', form).value = '';
      const s = Store.settings(); Store.setSetting('customTags', [...new Set((s.customTags || []).concat(v))]);
      drawTags();
    };
    $('#tag-add', form).addEventListener('click', addTag);
    $('#tag-new', form).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
    drawTags();

    form.kind.forEach(x => x.addEventListener('change', () => { form.makes.hidden = form.kind.value !== 'makes'; if (!form.makes.hidden) form.makes.focus(); }));
    // A new cake, pie or pan of brownies/bars starts as "Makes 1 cake/pie/pan" (until you change it yourself).
    if (isNew && !(opts.draft && opts.draft.makes)) {
      let auto = false, touched = false;
      const fit = () => {
        if (touched) return;
        const unit = onePanUnit(form.title.value);
        if (unit) { auto = true; form.serves.value = '1'; form.kind.value = 'makes'; form.makes.value = unit; form.makes.hidden = false; }
        else if (auto) { auto = false; form.serves.value = String(r.serves || 4); form.kind.value = r.makes ? 'makes' : 'serves'; form.makes.value = r.makes || ''; form.makes.hidden = !r.makes; }
      };
      [form.serves, form.makes].forEach(f => f.addEventListener('input', () => { touched = true; }));
      form.kind.forEach(x => x.addEventListener('change', () => { touched = true; }));
      form.title.addEventListener('input', fit);
      fit();
    }
    const startServes = form.serves.value;
    form.serves.addEventListener('input', () => { if (form.serves.value !== startServes) form.est.checked = false; });
    form.section.addEventListener('change', async () => {
      if (form.section.value !== '__new') return;
      const name = await ask('Name the new section', { ok: 'Add', input: '' });
      if (!name) { form.section.value = r.section; return; }
      const id = Store.addSection(name);
      form.section.insertAdjacentHTML('afterbegin', `<option value="${esc(id)}">${esc(name)}</option>`);
      form.section.value = id;
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = n => form[n].value.trim();
      const serves = Scale.num(v('serves'));
      const out = Object.assign({}, r, {
        title: v('title'), from: v('from'), section: v('section'), story: v('story'),
        serves: isFinite(serves) && serves > 0 ? serves : 4, makes: form.kind.value === 'makes' ? (v('makes') || 'batches') : undefined,
        est: form.est.checked, prep: v('prep'), cook: v('cook'), ready: v('ready'), layout: form.layout.value,
        ing: form.ing.value.trim(), steps: form.steps.value.trim(), notes: form.notes.value.trim(), tags: [...tags],
        rating: +form.rating.value || undefined, difficulty: v('difficulty'), source: v('source'), tools: v('tools'), photo,
      });
      if (!out.title) return form.title.focus();
      if (isNew) { out.id = Store.newId(out.title); out.created = Date.now(); }
      if (toBox) {
        closeSheet();
        Store.boxUpdate(r.id, out).then(() => toast('Saved to Blue Book Recipes')).catch(e => { console.warn(e); toast('That didn’t save — check your internet and try again.', 4000); });
        return;
      }
      Store.save(out);
      delete scaleState[out.id];
      if (out.from && !me && isNew) Store.setSetting('name', out.from);
      closeSheet();
      if (location.hash === '#/r/' + encodeURIComponent(out.id)) render(); else location.hash = '#/r/' + encodeURIComponent(out.id);
      toast(isNew ? 'Recipe added to your book' : 'Saved');
    });

    const restore = $('#ed-restore', form);
    if (restore) restore.addEventListener('click', async () => {
      if (!await ask(cloud() ? 'Go back to the recipe exactly as it is in Mom’s Blue Book? Your current version is kept in History.' : 'Go back to the recipe exactly as it is in Mom’s Blue Book? Your changes to it will be lost.', { ok: 'Go back to original' })) return;
      Store.restore(r.id); delete scaleState[r.id]; closeSheet(); render(); toast('Back to Mom’s original');
    });
    const remove = $('#ed-remove', form);
    if (remove) remove.addEventListener('click', async () => {
      const canPutBack = r.blueBook || r.shared;
      const msg = canPutBack ? 'Remove this recipe from your book? You can put it back any time from Settings.' : 'Delete this recipe? This can’t be undone.' + (inFamily() ? ' (Share it with the family first if you want to keep it in Blue Book Recipes.)' : '');
      if (!await ask(msg, { ok: canPutBack ? 'Remove' : 'Delete', danger: true })) return;
      const sec = r.section;
      Store.remove(r.id); closeSheet(); location.hash = '#/s/' + encodeURIComponent(sec); toast('Removed from your book');
    });
  }

  /* ---------- History ---------- */
  const preview = r => `<div class="hist-preview">
      ${r.from ? `<p class="r-from">${kitchen(r.from)}</p>` : ''}<p class="fine">${r.makes ? 'Makes' : 'Serves'} ${Scale.frac(r.serves || 4)}${r.makes ? ' ' + esc(r.makes) : ''}</p>
      <h3 class="grp">Ingredients</h3><ul class="ing">${lines(r.ing).map(l => l.startsWith('#') ? `<li class="grp-li">${esc(l.slice(1).trim())}</li>` : `<li>${esc(l)}</li>`).join('')}</ul>
      <h3 class="grp">Directions</h3><ol class="plain-steps">${lines(r.steps).map(l => `<li>${esc(l.replace(/^[-#]\s*/, ''))}</li>`).join('')}</ol>
      ${r.notes ? `<h3 class="grp">Notes</h3>${lines(r.notes).map(n => `<p class="hand">${esc(n)}</p>`).join('')}` : ''}</div>`;

  async function openHistory(r) {
    const kind = r.box ? 'box' : 'mine';
    openSheet(`<div class="history"><div class="sheet-head"><span></span><h2>History</h2><button class="btn primary" data-close>Done</button></div>
      <p class="fine">${kind === 'box' ? 'Every earlier version of the family recipe. Restoring one makes it the family version again (and saves the current one here too).' : 'Earlier versions of your copy. Restoring one saves your current version here first.'}</p>
      <div id="hist-list"><p class="empty">Loading…</p></div></div>`);
    let list = [];
    try { list = await Store.history(kind, r.id); } catch (e) { console.warn(e); }
    const orig = Store.original((r.origin && r.origin.id) || r.id);
    const entries = list.map(h => ({ label: kind === 'box' ? `Version ${h.version || 1}` : 'Your earlier version', who: h.byName, at: h.at, recipe: h.recipe }));
    if (orig && !entries.some(e => JSON.stringify(e.recipe) === JSON.stringify(orig))) entries.push({ label: 'Mom’s original', who: 'Mom’s Blue Book', recipe: orig, original: true });
    const box = $('#hist-list', sheet); if (!box) return;
    box.innerHTML = `<div class="hist-now"><b>Now:</b> ${kind === 'box' ? `version ${r.version || 1}${r.updatedByName ? ' · ' + esc(r.updatedByName) : ''}${r.updated ? ' · ' + when(r.updated) : ''}` : 'your current copy'}</div>`
      + (entries.length ? entries.map((e, i) => `<details class="hist-item"><summary><span>${esc(e.label)}</span><em>${e.who ? esc(e.who) : ''}${e.at ? ' · ' + when(e.at) : ''}</em></summary>
          ${preview(e.recipe)}<button class="btn primary" data-restore="${i}">${icon('undo')} Restore this version</button></details>`).join('')
        : '<p class="empty">No earlier versions yet. Every time this recipe is changed, the old version is saved here.</p>');
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-restore]'); if (!b) return;
      const entry = entries[+b.dataset.restore];
      if (!await ask(kind === 'box' ? 'Make this the family version again? Everyone with the recipe will be asked if they want it.' : 'Go back to this version of your copy?', { ok: 'Restore' })) return;
      if (kind === 'box') await Store.boxUpdate(r.id, entry.recipe);
      else if (entry.original) Store.restore(r.id);
      else Store.save(Object.assign({}, Store.get(r.id), entry.recipe, { id: r.id }));
      delete scaleState[r.id]; closeSheet(); toast('Restored');
    });
  }

  /* What the family changed vs your copy, line by line. */
  function diffLines(a, b) {
    const A = lines(a), Bl = lines(b);
    const out = [];
    Bl.forEach(l => out.push(A.includes(l) ? `<li>${esc(l)}</li>` : `<li class="add">${esc(l)}</li>`));
    A.filter(l => !Bl.includes(l)).forEach(l => out.push(`<li class="del">${esc(l)}</li>`));
    return out.join('');
  }
  function openUpdate(r) {
    const u = Store.updates().find(x => x.mine.id === r.id); if (!u) return;
    const f = u.family, m = u.mine;
    const part = (t, k) => (m[k] || '') === (f[k] || '') ? '' : `<h3 class="grp">${t}</h3><ul class="diff">${diffLines(m[k], f[k])}</ul>`;
    const small = [['Name', 'title'], ['From', 'from'], ['Story', 'story'], ['Serves', 'serves'], ['Prep', 'prep'], ['Cook', 'cook']]
      .filter(([, k]) => String(m[k] ?? '') !== String(f[k] ?? '')).map(([t, k]) => `<li><b>${t}:</b> <span class="del">${esc(m[k] ?? '—')}</span> → <span class="add">${esc(f[k] ?? '—')}</span></li>`).join('');
    openSheet(`<div class="update"><div class="sheet-head"><button class="btn ghost" data-close>Close</button><h2>What changed</h2><span></span></div>
      <p class="fine"><b>${esc(f.updatedByName || 'Someone')}</b> changed this in Blue Book Recipes${f.updated ? ' on ' + when(f.updated) : ''}. <span class="add">Green</span> is new, <span class="del">red</span> is in your copy but not theirs.</p>
      ${small ? `<ul class="diff-small">${small}</ul>` : ''}${part('Ingredients', 'ing')}${part('Directions', 'steps')}${part('Notes', 'notes')}
      ${JSON.stringify(f.ink || null) !== JSON.stringify(m.ink || null) ? '<p class="fine">The handwritten notes are different too.</p>' : ''}
      ${(f.photo || null) !== (m.photo || null) ? '<p class="fine">The photo is different too.</p>' : ''}
      <div class="row-btns"><button class="btn primary" data-up="take">Update my copy</button><button class="btn ghost" data-up="keep">Keep mine</button></div></div>`);
    sheet.querySelector('.update').addEventListener('click', e => {
      const b = e.target.closest('[data-up]'); if (!b) return;
      if (b.dataset.up === 'take') { delete scaleState[r.id]; Store.updateFromBox(r.id); toast('Updated — your old version is in History'); }
      else { Store.keepMine(r.id); toast('Kept your version'); }
      closeSheet();
    });
  }

  /* ---------- Family ---------- */
  async function joinFamily(code, errEl) {
    try { await Store.joinFamily(code); toast('You’re in! Blue Book Recipes is in the index.', 3500); location.hash = '#/box'; }
    catch (e) {
      const msg = e.message === 'nocode' ? 'That code doesn’t match a family. Check it and try again.' : 'Couldn’t join right now — check your internet and try again.';
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; } else toast(msg, 4000);
    }
  }
  async function startFamily(name) {
    try {
      toast('Setting up Blue Book Recipes…', 6000);
      const code = await Store.createFamily(name || 'Our Family');
      toast('Done! Your invite code is ' + code, 5000); location.hash = '#/box';
    } catch (e) { console.warn(e); toast('Couldn’t start the family right now. Try again in a minute.', 4000); }
  }
  async function forgot() {
    const email = await ask('Type your email and we’ll send a link to pick a new password.', { ok: 'Send link', input: (($('#signin') || {}).email || {}).value || '' });
    if (!email) return;
    try { await Store.resetPassword(email); toast('Sent! Check your email (and the spam folder).', 4500); }
    catch (e) { toast(authError(e), 4500); }
  }
  let importAsked = false;
  async function askImport() {
    if (!await ask('This device has changes from before you signed in (edits, recipes you added, bookmarks or photos). Bring them into your account?', { ok: 'Bring them in', cancel: 'No thanks' })) { Store.skipImport(); return; }
    toast('Bringing them in…', 4000);
    try { await Store.importLocal(); toast('Done — your changes are in your account now'); } catch (e) { console.warn(e); toast('Some changes couldn’t be brought in.', 4000); }
  }

  /* ---------- Settings ---------- */
  function openSettings() {
    const s = Store.settings();
    const removed = Store.removed();
    const sections = Store.sections();
    const d = design();
    loadExtraFonts();
    const fam = Store.family(), u = Store.user();
    const familyCard = !cloud() ? '' : fam ? `<div class="fld fam-card"><span class="fld-l">Family</span>
        <div class="fam-name"><b>${esc(fam.name || 'Our Family')}</b> <button class="link" id="fam-rename">Rename</button></div>
        <div class="code-box"><span class="lbl">Invite code</span><b class="code">${esc(fam.code)}</b>
          <button class="btn ghost sm" id="code-copy">Copy</button>${navigator.share ? '<button class="btn ghost sm" id="code-share">Send…</button>' : ''}</div>
        <small>Send this code to family. They open Blue Book, tap “Create an account,” then type the code in to join. <button class="link" id="code-new">Make a new code</button> (the old one stops working).</small>
        <ul class="people">${Object.entries(fam.names || {}).map(([id, n]) => `<li>${icon('heart')} ${esc(n)}${id === u.uid ? ' <em>(you)</em>' : ''}</li>`).join('')}</ul>
        <button class="btn ghost danger-text sm" id="fam-leave">Leave the family</button></div>`
      : `<div class="fld fam-card"><span class="fld-l">Family</span>
        <small>Join the family’s Blue Book Recipes with an invite code, or start it.</small>
        <form id="set-join" class="row-form"><input name="code" placeholder="Invite code" autocapitalize="characters" autocomplete="off" required><button class="btn primary" type="submit">Join</button></form>
        <form id="set-start" class="row-form"><input name="name" value="Our Family" aria-label="Family name"><button class="btn ghost" type="submit">Start a family</button></form></div>`;
    openSheet(`<div class="settings">
      <div class="sheet-head"><span></span><h2>Settings</h2><button class="btn primary" data-close>Done</button></div>
      ${familyCard}
      <label class="fld"><span>Your name</span><input id="set-name" value="${esc(s.name || '')}" placeholder="Bella">
        <small>New recipes you add will say “From <b id="name-echo">${esc(s.name || 'your')}</b>’s Kitchen.”</small></label>
      <div class="fld"><span class="fld-l">Cover</span>
        <div class="cover-picks">
          <div class="cover-pick"><div class="cp-img tall" id="cp-portrait"></div><button class="btn ghost" data-cover="coverPortrait">Upright cover…</button></div>
          <div class="cover-pick"><div class="cp-img wide" id="cp-landscape"></div><button class="btn ghost" data-cover="coverLandscape">Sideways cover…</button></div>
        </div>
        ${s.coverPortrait || s.coverLandscape ? `<button class="link" id="cover-reset">Use the Blue Book cover again</button>` : ''}
        <small>Upright shows when the iPad or phone is held tall; sideways shows when it’s turned. About 1536 × 2048 and 2048 × 1536 fit best.</small></div>
      <div class="fld design"><span class="fld-l">Design</span>
        <span class="lbl">Font</span>
        <div class="font-picks">${FONTS.map(f => `<button type="button" class="font-pick${f.id === d.font ? ' on' : ''}" data-font-pick="${f.id}" style="--pf-t: ${f.t}; --pf-w: ${f.w}; --pf-a: ${f.a}; --pf-b: ${f.b}"><b>Nona’s Goulash</b><small>${f.name}</small></button>`).join('')}</div>
        <span class="lbl">Tab colors</span>
        <div class="swatches">
          ${Object.entries(PALETTES).filter(([id]) => id === 'blue').map(([id, p]) => `<button type="button" class="swatch${d.palette === id ? ' on' : ''}" data-palette="${id}" style="--sw: linear-gradient(180deg, ${p.to}, ${p.from})"><i></i><small>${p.name}</small></button>`).join('')}
          <button type="button" class="swatch${d.palette === 'rainbow' ? ' on' : ''}" data-palette="rainbow" style="--sw: linear-gradient(180deg, ${RAINBOW.map((c, i) => `${c} ${i * 100 / RAINBOW.length}% ${(i + 1) * 100 / RAINBOW.length}%`).join(', ')})"><i></i><small>Rainbow</small></button>
          ${Object.entries(PALETTES).filter(([id]) => id !== 'blue').map(([id, p]) => `<button type="button" class="swatch${d.palette === id ? ' on' : ''}" data-palette="${id}" style="--sw: linear-gradient(180deg, ${p.to}, ${p.from})"><i></i><small>${p.name}</small></button>`).join('')}
        </div>
        <span class="lbl">Text size</span>
        <div class="seg text-seg">${[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']].map(([v, t]) => `<button type="button" class="${d.text === v ? 'on' : ''}" data-text-size="${v}">${t}</button>`).join('')}</div>
        <small>Changing the text size moves words around, so handwriting written right on a page may not line up anymore (notes on the Notes pad are fine).</small>
        <button type="button" class="link" id="design-reset"${d.font === 'classic' && d.palette === 'blue' && d.text === 'medium' ? ' hidden' : ''}>Back to Blue Book style</button></div>
      <div class="fld"><span class="fld-l">Sections</span><ul class="set-list">${sections.map(c => `<li><span>${esc(c.short || c.name)}</span>
        <button class="btn ghost" data-sec-rename="${esc(c.id)}">Rename</button>${c.custom ? `<button class="btn ghost danger-text" data-sec-del="${esc(c.id)}">Delete</button>` : ''}</li>`).join('')}</ul></div>
      ${Store.hasCustomOrder() ? `<div class="fld"><span class="fld-l">Order</span>
        <small>You’ve moved some sections or recipes around.</small>
        <button class="btn ghost" id="order-reset">Reset to Mom’s order</button></div>` : ''}
      <div class="fld"><span class="fld-l">Removed recipes</span>
        ${removed.length ? `<ul class="set-list">${removed.map(r => `<li><span>${esc(r.title)}</span><button class="btn ghost" data-putback="${esc(r.id)}">Put back</button></li>`).join('')}</ul>` : '<small>Recipes you remove from your book show up here, so you can put them back.</small>'}</div>
      ${cloud() ? `<div class="fld about"><span class="fld-l">Account</span>
        <small>Signed in as <b>${esc(u.email)}</b>. Your book is saved to your account, so it’s the same on your phone, iPad and laptop.</small>
        <button class="btn ghost" data-act="sign-out">Sign out</button></div>`
      : `<div class="fld about"><span class="fld-l">About</span>
        <small>Blue Book · ${Store.all().length} recipes, saved on this device only.</small>
        <button class="btn ghost danger-text" id="reset-all">Start over (erase my changes on this device)</button></div>`}
    </div>`, render);

    const name = $('#set-name', sheet);
    let nameT;
    name.addEventListener('input', () => {
      $('#name-echo', sheet).textContent = name.value.trim() || 'your';
      clearTimeout(nameT); nameT = setTimeout(() => Store.setSetting('name', name.value.trim()), 700);
    });
    const sj = $('#set-join', sheet), ss = $('#set-start', sheet);
    if (sj) sj.addEventListener('submit', async e => { e.preventDefault(); await joinFamily(sj.code.value); closeSheet(); });
    if (ss) ss.addEventListener('submit', async e => { e.preventDefault(); closeSheet(); await startFamily(ss.name.value.trim()); });
    const drawCovers = async () => {
      const cur = Store.settings();
      for (const [k, el, file] of [['coverPortrait', '#cp-portrait', 'cover-portrait.jpg'], ['coverLandscape', '#cp-landscape', 'cover-landscape.jpg']]) {
        const src = await Photos.get(cur[k] || file);
        const box = $(el, sheet); if (!box) continue;
        box.innerHTML = `<img alt="" src="${esc(src)}" onerror="this.remove()">`;
      }
    };
    drawCovers();
    sheet.onclick = async e => {
      if (e.target.closest('#code-copy')) { try { await navigator.clipboard.writeText(fam.code); toast('Code copied'); } catch (x) { toast('Code: ' + fam.code, 4000); } return; }
      if (e.target.closest('#code-share')) { navigator.share({ text: `Join our family’s Blue Book recipes! Open ${location.origin + location.pathname}, tap “Create an account,” then use invite code ${fam.code}` }).catch(() => {}); return; }
      if (e.target.closest('#code-new')) { if (await ask('Make a new invite code? The old one will stop working (people already in the family stay in).', { ok: 'New code' })) { await Store.changeCode(); openSettings(); } return; }
      if (e.target.closest('#fam-rename')) { const n = await ask('Family name', { ok: 'Save', input: fam.name || '' }); if (n) { await Store.renameFamily(n); openSettings(); } return; }
      if (e.target.closest('#fam-leave')) { if (await ask('Leave the family? Your own book stays exactly as it is; you just won’t see Blue Book Recipes until you join again.', { ok: 'Leave', danger: true })) { await Store.leaveFamily(); openSettings(); } return; }
      // Design changes show right away; the page behind redraws when Settings closes.
      const fp = e.target.closest('[data-font-pick]'), pl = e.target.closest('[data-palette]'), ts = e.target.closest('[data-text-size]');
      if (fp || pl || ts || e.target.closest('#design-reset')) {
        const reset = !!e.target.closest('#design-reset');
        if (fp || reset) Store.setSetting('designFont', reset || fp.dataset.fontPick === 'classic' ? null : fp.dataset.fontPick);
        if (pl || reset) Store.setSetting('designPalette', reset || pl.dataset.palette === 'blue' ? null : pl.dataset.palette);
        if (ts || reset) Store.setSetting('designText', reset || ts.dataset.textSize === 'medium' ? null : ts.dataset.textSize);
        applyDesign(); render();
        const nd = curDesign;
        $$('[data-font-pick]', sheet).forEach(b => b.classList.toggle('on', b.dataset.fontPick === nd.font));
        $$('[data-palette]', sheet).forEach(b => b.classList.toggle('on', b.dataset.palette === nd.palette));
        $$('[data-text-size]', sheet).forEach(b => b.classList.toggle('on', b.dataset.textSize === nd.text));
        $('#design-reset', sheet).hidden = nd.font === 'classic' && nd.palette === 'blue' && nd.text === 'medium';
        return;
      }
      const c = e.target.closest('[data-cover]');
      if (c) { const data = await pickImage(); if (data) { Store.setSetting(c.dataset.cover, await Photos.put(data)); openSettings(); } return; }
      if (e.target.closest('#order-reset')) { if (await ask('Put every section and recipe back in Mom’s order?', { ok: 'Reset' })) { Store.resetOrder(); render(); } return openSettings(); }
      if (e.target.closest('#cover-reset')) { Store.setSetting('coverPortrait', null); Store.setSetting('coverLandscape', null); return openSettings(); }
      const pb = e.target.closest('[data-putback]');
      if (pb) { Store.putBack(pb.dataset.putback); toast('Put back in your book'); return openSettings(); }
      const rn = e.target.closest('[data-sec-rename]');
      if (rn) { await renameSection(rn.dataset.secRename); return openSettings(); }
      const sd = e.target.closest('[data-sec-del]');
      if (sd) {
        if (Store.all().some(r => r.section === sd.dataset.secDel)) return toast('Move or remove the recipes in that section first.', 3500);
        Store.deleteSection(sd.dataset.secDel); return openSettings();
      }
      if (e.target.closest('#reset-all')) {
        if (!await ask('Erase every change, photo, bookmark and recipe you’ve added on this device and go back to Mom’s Blue Book as it started?', { ok: 'Erase and start over', danger: true })) return;
        await Store.reset(); location.reload();
      }
    };
  }

  /* ---------- Start ---------- */
  // No pinch-zoom (iPhones ignore the viewport setting, so stop the gesture itself). Text size lives in Settings.
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && e.scale !== undefined && e.scale !== 1) e.preventDefault(); }, { passive: false });
  const mq = matchMedia('(orientation: landscape) and (min-width: 900px) and (min-height: 540px)');
  const setMode = () => document.documentElement.classList.toggle('two-page', mq.matches);
  // Turning the iPad or resizing the window re-flows the page, so the writing is redrawn to match.
  mq.addEventListener('change', () => { setMode(); if (Ink.active()) Ink.stop(true); else render(); }); setMode();
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const r = currentRecipe(); fitServes(spread); if (r && !Ink.active()) Ink.paint(spread, r.ink); }, 250); });

  // A little note when there's no internet; everything still works and syncs later.
  const offline = document.createElement('div');
  offline.className = 'offline-pill'; offline.hidden = navigator.onLine;
  offline.textContent = cloud() ? 'Offline — your changes will sync when you’re back online' : 'Offline';
  document.body.appendChild(offline);
  addEventListener('online', () => { offline.hidden = true; });
  addEventListener('offline', () => { offline.hidden = false; });
  window.addEventListener('hashchange', render);
  // Changes from other devices or family redraw the page, but never while you're typing in it.
  Store.init(() => {
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#spread input, #spread textarea');
    if (document.body.classList.contains('sheet-open') || typing || Ink.active()) pendingRender = true; else render();
  });
  document.addEventListener('focusout', () => { if (pendingRender && !document.body.classList.contains('sheet-open')) setTimeout(() => { if (pendingRender && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#spread input, #spread textarea'))) { pendingRender = false; render(); } }, 300); });
  if (Store.onAuth) Store.onAuth(() => render());
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
