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
  const bySection = sid => Store.all().filter(r => r.section === sid)
    .sort((a, b) => (a.order ?? 1e6) - (b.order ?? 1e6) || (a.created || 0) - (b.created || 0));
  const sectionOf = id => Store.sections().find(s => s.id === id);

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
  const img = (ref, alt, cls = '') => ref
    ? `<img class="${cls}" data-ref="${esc(ref)}" alt="${esc(alt || '')}" loading="lazy">`
    : '';
  async function fillPhotos(root) {
    for (const el of $$('img[data-ref]', root)) {
      const src = await Photos.get(el.dataset.ref);
      if (src) el.src = src; else el.replaceWith(Object.assign(document.createElement('span'), { className: el.className + ' missing' }));
    }
  }
  const thumb = r => r.photo ? img(r.photo, '', 'thumb') : `<span class="thumb ph c-${(sectionOf(r.section) || {}).color || 'sage'}">${icon('pot')}</span>`;

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

  Screens.cover = () => {
    const s = Store.settings();
    return {
      cls: 'screen-cover',
      label: 'Open the book',
      left: `<a class="cover" href="#/letter" aria-label="Open the book">
        <div class="cover-default" aria-hidden="true">
          <div class="cover-frame">
            <div class="cover-small">Our Family’s</div>
            <div class="cover-title">Blue Book</div>
            <div class="cover-rule"></div>
            <div class="cover-small">Recipes</div>
            ${icon('heart', 'cover-heart')}
          </div>
        </div>
        <img class="cover-img portrait" data-ref="${esc(s.coverPortrait || 'cover-portrait.jpg')}" alt="">
        <img class="cover-img landscape" data-ref="${esc(s.coverLandscape || 'cover-landscape.jpg')}" alt="">
        <span class="open-hint">Tap to open ${icon('chev-right')}</span>
      </a>`,
      right: '',
      after(root) {
        // A missing cover file just leaves the drawn cover showing.
        $$('.cover-img', root).forEach(async el => {
          const src = await Photos.get(el.dataset.ref);
          if (!src) return el.remove();
          el.onerror = () => el.remove();
          el.onload = () => el.classList.add('loaded');
          el.src = src;
        });
      },
    };
  };

  Screens.letter = () => {
    const L = BB.letter;
    return {
      cls: 'screen-letter', label: 'A Letter from Mom',
      left: `<div class="kicker">A letter from Mom</div>
        <h1 class="script">${esc(L.title)}</h1>
        <p class="letter-to">${esc(L.to)}</p>
        ${L.photos ? `<figure class="letter-photo tilt-l">${img(L.photos[0], 'Mom’s Blue Book')}</figure>` : ''}
        ${L.body.slice(0, 2).map(p => `<p class="letter-p">${esc(p)}</p>`).join('')}`,
      right: `${L.body.slice(2).map(p => `<p class="letter-p">${esc(p)}</p>`).join('')}
        <p class="letter-close">${esc(L.close)}</p>
        <p class="letter-sign script">${esc(L.sign)}</p>
        <p class="letter-full">${esc(L.signFull)}</p>
        ${L.photos && L.photos[1] ? `<figure class="letter-photo tilt-r">${img(L.photos[1], 'Mom with the Blue Book')}</figure>` : ''}
        <p class="letter-ps hand">${esc(L.ps)}</p>`,
    };
  };

  /* Kitchen conversions */
  const VOL = { tsp: 1, tbsp: 3, 'fl oz': 6, cup: 48, pint: 96, quart: 192, gallon: 768, ml: 0.202884, l: 202.884 };
  const WT = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
  Screens.conversions = () => {
    const dry = [['1 cup', '16 tbsp', '48 tsp', '8 fl oz', '237 ml'], ['¾ cup', '12 tbsp', '36 tsp', '6 fl oz', '177 ml'], ['⅔ cup', '10 tbsp + 2 tsp', '32 tsp', '5 ⅓ fl oz', '158 ml'],
      ['½ cup', '8 tbsp', '24 tsp', '4 fl oz', '118 ml'], ['⅓ cup', '5 tbsp + 1 tsp', '16 tsp', '2 ⅔ fl oz', '79 ml'], ['¼ cup', '4 tbsp', '12 tsp', '2 fl oz', '59 ml'],
      ['⅛ cup', '2 tbsp', '6 tsp', '1 fl oz', '30 ml'], ['1 tbsp', '—', '3 tsp', '½ fl oz', '15 ml'], ['1 tsp', '—', '—', '—', '5 ml']];
    const liquid = [['1 gallon', '4 quarts', '8 pints', '16 cups', '128 fl oz', '3.8 L'], ['½ gallon', '2 quarts', '4 pints', '8 cups', '64 fl oz', '1.9 L'],
      ['1 quart', '—', '2 pints', '4 cups', '32 fl oz', '946 ml'], ['1 pint', '—', '—', '2 cups', '16 fl oz', '473 ml'], ['1 cup', '—', '—', '—', '8 fl oz', '237 ml']];
    const temps = [225, 250, 275, 300, 325, 350, 375, 400, 425, 450].map(f => [f, Math.round((f - 32) * 5 / 9 / 5) * 5]);
    const table = (head, rows) => `<div class="tbl-wrap noswipe"><table class="tbl"><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const opts = (o, sel) => Object.keys(o).map(k => `<option${k === sel ? ' selected' : ''}>${k}</option>`).join('');
    return {
      cls: 'screen-conv', label: 'Kitchen Conversions',
      left: `<div class="kicker">Kitchen</div><h1 class="script">Conversions</h1>
        <h2 class="sub">Measuring spoons &amp; cups</h2>${table(['Cups', 'Tablespoons', 'Teaspoons', 'Fluid oz', 'Milliliters'], dry)}
        <h2 class="sub">Liquids</h2>${table(['Gallons', 'Quarts', 'Pints', 'Cups', 'Fluid oz', 'Liters'], liquid)}`,
      right: `<h2 class="sub">Quick converter</h2>
        <form class="calc" id="calc" autocomplete="off" onsubmit="return false">
          <input id="calc-n" inputmode="decimal" value="1" aria-label="Amount">
          <select id="calc-from" aria-label="From"><optgroup label="Volume">${opts(VOL, 'cup')}</optgroup><optgroup label="Weight">${opts(WT)}</optgroup><optgroup label="Oven"><option>°F</option><option>°C</option></optgroup></select>
          <span class="calc-eq">=</span>
          <output id="calc-out"></output>
          <select id="calc-to" aria-label="To"><optgroup label="Volume">${opts(VOL, 'tbsp')}</optgroup><optgroup label="Weight">${opts(WT)}</optgroup><optgroup label="Oven"><option>°F</option><option>°C</option></optgroup></select>
        </form>
        <h2 class="sub">Oven temperatures</h2>
        ${table(['°F', '°C'], temps.map(([f, c]) => [f + '°', c + '°']))}
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
          if (!isFinite(v)) return (out.textContent = '—');
          let r;
          if (/°/.test(a) || /°/.test(b)) r = a === b ? v : /°/.test(a) && /°/.test(b) ? (a === '°F' ? (v - 32) * 5 / 9 : v * 9 / 5 + 32) : null;
          else if (VOL[a] && VOL[b]) r = v * VOL[a] / VOL[b];
          else if (WT[a] && WT[b]) r = v * WT[a] / WT[b];
          out.textContent = r == null ? 'pick two of the same kind' : (/°/.test(b) ? Math.round(r) + b : (r >= 20 ? Math.round(r) : Scale.frac(r) || '0'));
        };
        [n, from, to].forEach(el => el.addEventListener('input', run));
        run();
      },
    };
  };

  Screens.index = () => {
    const secs = Store.sections();
    const all = Store.all();
    const tile = s => {
      const rs = all.filter(r => r.section === s.id), p = firstPhoto(rs);
      return `<a class="tile c-${s.color}" href="#/s/${encodeURIComponent(s.id)}">
        <span class="tile-img">${p ? img(p, '') : icon('pot')}</span>
        <span class="tile-name">${esc(s.name)}</span><span class="tile-count">${rs.length} recipe${rs.length === 1 ? '' : 's'}</span></a>`;
    };
    const menus = BB.menus.filter(m => all.some(r => (r.tags || []).includes(m.tag)));
    return {
      cls: 'screen-index', label: 'Index',
      left: `<div class="kicker">Our family’s</div><h1 class="script">Index</h1>
        <div class="tiles">${secs.map(tile).join('')}
          <button class="tile tile-new" data-act="new-section"><span class="tile-img">${icon('plus')}</span><span class="tile-name">New section</span></button>
        </div>`,
      right: `<h2 class="sub">Also in the book</h2>
        <ul class="links">
          <li><a href="#/letter">${icon('heart')}<span>A letter from Mom</span></a></li>
          <li><a href="#/conversions">${icon('measure')}<span>Kitchen conversions</span></a></li>
          <li><a href="#/bookmarks">${icon('ribbon')}<span>Bookmarks</span><em>${Store.bookmarks().length || ''}</em></a></li>
          <li><a href="#/search">${icon('search')}<span>Search recipes &amp; ingredients</span></a></li>
          ${cloud() ? `<li><a href="#/box">${icon('book')}<span>Blue Book Recipes <small>(the family’s shared recipes)</small></span><em>${Store.updates().length ? `<b class="badge">${Store.updates().length} updated</b>` : Store.family() ? Store.box().length : ''}</em></a></li>` : ''}
          ${menus.map(m => `<li><a href="#/s/holiday">${icon('star')}<span>${esc(m.name)}</span></a></li>`).join('')}
        </ul>
        <button class="btn primary wide" data-act="new-recipe">${icon('plus')} Add a recipe</button>
        <p class="fine">${all.length} recipes · ${all.filter(r => r.blueBook).length} from Mom’s Blue Book</p>`,
    };
  };

  function recipeList(rs, numbered = true) {
    if (!rs.length) return '<p class="empty">No recipes here yet.</p>';
    return `<ol class="rlist${numbered ? '' : ' plain'}">${rs.map((r, i) => `<li><a href="#/r/${encodeURIComponent(r.id)}">
      ${numbered ? `<span class="rnum">${i + 1}</span>` : ''}${thumb(r)}
      <span class="rtext"><span class="rtitle">${esc(r.title)}</span><span class="rfrom">${kitchen(r.from)}</span></span>
      ${Store.isBookmarked(r.id) ? icon('ribbon', 'icon mark') : ''}</a></li>`).join('')}</ol>`;
  }

  Screens.section = ({ id }) => {
    const s = sectionOf(id);
    if (!s) return Screens.index();
    const rs = bySection(id);
    let right = recipeList(rs);
    if (id === 'holiday') {
      const all = Store.all();
      const tags = BB.menus.map(m => m.tag).concat(['Easter', 'Fourth of July']);
      const blocks = [];
      for (const tag of tags) {
        const m = BB.menus.find(x => x.tag === tag) || { tag, name: tag };
        const order = m.order || [];
        const list = all.filter(r => (r.tags || []).includes(tag))
          .sort((a, b) => ((order.indexOf(a.id) + 1) || 999) - ((order.indexOf(b.id) + 1) || 999));
        if (list.length) blocks.push(`<h2 class="sub">${esc(m.name)}</h2>${recipeList(list, false)}${m.note ? `<div class="menu-note"><p class="hand">${esc(m.note)}</p>${(m.photos || []).map(p => img(p, '', 'menu-pic')).join('')}</div>` : ''}`);
      }
      const seasons = ['Spring', 'Summer', 'Fall', 'Winter'].map(t => [t, all.filter(r => (r.tags || []).includes(t))]).filter(x => x[1].length);
      if (seasons.length) blocks.push(`<h2 class="sub">By season</h2>${seasons.map(([t, l]) => `<h3 class="sub2">${t}</h3>${recipeList(l, false)}`).join('')}`);
      right = blocks.join('') || right;
    }
    const p = firstPhoto(rs);
    return {
      cls: `screen-section c-${s.color}`, label: s.name, section: id,
      left: `<div class="sec-band"></div><div class="kicker">Section</div>
        <h1 class="script sec-name">${esc(s.name)}</h1>
        <p class="sec-count">${rs.length} recipe${rs.length === 1 ? '' : 's'}</p>
        ${p ? `<div class="sec-photo">${img(p, '')}</div>` : `<div class="sec-photo ph">${icon('pot')}</div>`}
        <div class="row-btns">
          <button class="btn primary" data-act="new-recipe" data-section="${esc(id)}">${icon('plus')} Add a recipe here</button>
          <button class="btn ghost" data-act="rename-section" data-id="${esc(id)}">${icon('pencil')} Rename</button>
        </div>`,
      right: `${id === 'holiday' ? '' : '<h2 class="sub">Recipes</h2>'}${right}`,
    };
  };

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
    return `<div class="serves${changed ? ' changed' : ''}">
        <span class="lbl">${r.makes ? 'Makes' : 'Serves'}</span>
        <button class="sv-btn" data-act="less" aria-label="Fewer">−</button>
        <b class="sv-n">${Scale.frac(now)}</b>
        <button class="sv-btn" data-act="more" aria-label="More">+</button>
        ${r.makes ? `<span class="sv-unit">${esc(r.makes)}</span>` : ''}
        ${r.est && !changed ? `<button class="est" data-act="est-info">estimated</button>` : ''}
        <button class="sv-x" data-act="times" aria-expanded="false">½× 2×</button>
      </div>
      <div class="times" hidden>${[[1 / 3, '⅓×'], [1 / 2, '½×'], [2 / 3, '⅔×'], [1, '1×'], [1.5, '1½×'], [2, '2×'], [3, '3×']].map(([m, t]) =>
        `<button data-act="mult" data-m="${m}"${Math.abs(now / base - m) < 1e-9 ? ' class="on"' : ''}>${t}</button>`).join('')}</div>
      ${changed ? `<p class="scaled-note">Amounts are for <b>${Scale.frac(now)}</b>${r.makes ? ' ' + esc(r.makes) : ''} — the recipe is written for ${Scale.frac(base)}. <button class="link" data-act="reset-scale">Back to ${Scale.frac(base)}</button>${tip ? `<span class="pan-tip">${icon('pan')} ${esc(tip)}</span>` : ''}</p>` : ''}`;
  }

  const cloud = () => Store.mode === 'cloud';
  const inFamily = () => cloud() && !!Store.family();
  const when = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  /* mode 'mine' = a recipe in your book; 'box' = the family version in Blue Book Recipes. */
  function recipePage(r, mode) {
    if (!r) return { cls: 'screen-missing', label: 'Not found', left: `<h1 class="script">Hmm…</h1><p>${mode === 'box' ? 'That recipe isn’t in Blue Book Recipes anymore.' : 'That recipe isn’t in your book anymore.'}</p><a class="btn" href="${mode === 'box' ? '#/box' : '#/index'}">${mode === 'box' ? 'Back to Blue Book Recipes' : 'Go to the index'}</a>`, right: '' };
    const mine = mode === 'mine';
    const s = sectionOf(r.section) || { name: r.sectionName || '', color: 'sage' };
    const meta = [['Prep', r.prep], ['Cook', r.cook], ['Ready in', r.ready]].filter(x => x[1])
      .map(([k, v]) => `<span class="meta-i"><span class="lbl">${k}</span> ${esc(v)}</span>`).join('');
    const extra = [r.rating ? `<span class="stars" aria-label="${r.rating} of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` : '',
      r.difficulty ? `<span>${esc(r.difficulty)}</span>` : '', r.source ? `<span>Source: ${esc(r.source)}</span>` : '', r.tools ? `<span>Tools: ${esc(r.tools)}</span>` : ''].filter(Boolean).join('<i>·</i>');
    const marked = mine && Store.isBookmarked(r.id);
    const layout = r.layout || 'side';

    // A newer family version waiting for you
    const upd = mine && cloud() ? Store.updates().find(u => u.mine.id === r.id) : null;
    const banner = upd ? `<div class="upd-banner">${icon('sparkle')}<div><b>${esc(upd.family.updatedByName || 'Someone')}</b> changed this recipe in Blue Book Recipes${upd.family.updated ? ' on ' + when(upd.family.updated) : ''}.
        <div class="upd-btns"><button class="btn primary sm" data-act="see-update">See what changed</button><button class="btn ghost sm" data-act="take-update">Update my copy</button><button class="link" data-act="keep-mine">Keep mine</button></div></div></div>` : '';
    const boxBanner = !mine ? `<div class="box-banner">${icon('book')}<span>The family version in <a href="#/box">Blue Book Recipes</a>${r.updatedByName && r.version > 1 ? ` · last changed by ${esc(r.updatedByName)} ${when(r.updated)}` : ''}</span></div>` : '';

    const head = `<div class="r-head">${banner}${boxBanner}
        ${mine ? `<button class="ribbon${marked ? ' on' : ''}" data-act="bookmark" aria-pressed="${marked}" aria-label="Bookmark">${icon('ribbon')}</button>` : ''}
        <h1 class="script r-title">${esc(r.title)}</h1>
        ${r.from ? `<p class="r-from">${kitchen(r.from)}</p>` : ''}
        ${r.story ? `<p class="r-story">${esc(r.story)}</p>` : ''}
        <div class="r-meta">${servesHtml(r)}${meta ? `<div class="meta-row">${meta}</div>` : ''}</div>
        ${(r.tags || []).length ? `<div class="r-tags">${r.tags.map(t => `<a class="chip" href="#/search?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
        ${extra ? `<p class="r-extra">${extra}</p>` : ''}
        <div class="r-actions"><button class="btn primary sm" data-act="cook">${icon('pot')} Start cooking</button>
          ${mine ? `<button class="btn ghost sm" data-act="write">${icon('pencil')} Write on it</button>` : ''}</div>
      </div>`;
    const photo = `<figure class="r-photo">${r.photo
      ? `${img(r.photo, r.title)}${mine ? `<button class="photo-edit" data-act="photo" aria-label="Change photo">${icon('camera')}</button>` : ''}`
      : mine ? `<button class="photo-ph" data-act="photo">${icon('camera')}<span>Add your family photo</span></button>` : `<span class="photo-ph">${icon('pot')}<span>No photo yet</span></span>`}</figure>`;
    const ing = `<section class="r-ing"><h2 class="sub">Ingredients</h2><div id="ing-list">${ingredientsHtml(r)}</div></section>`;
    const dir = `<section class="r-dir"><h2 class="sub">Directions</h2>${stepsHtml(r)}</section>`;
    const notes = (r.notes ? `<section class="r-notes"><h2 class="sub">Notes</h2>${lines(r.notes).map(n => `<p class="hand">${esc(n)}</p>`).join('')}</section>` : '')
      + (Ink.hasPad(r.ink) || (mine && inkFor === r.id) ? `<section class="r-pad"><h2 class="sub">Handwritten notes</h2><div class="ink-pad"></div></section>` : '');

    let tools;
    if (mine) {
      let share = '';
      if (inFamily() && !upd) {
        if (!r.shared) share = `<button class="btn ghost" data-act="share">${icon('share')} Share with the family</button>`;
        else if (!Store.sameAsFamily(r.id)) share = `<button class="btn ghost" data-act="share">${icon('share')} Send my changes to the family</button>`;
        else share = `<a class="shared-note" href="#/box/${encodeURIComponent(r.origin.id)}">${icon('check')} Same as the family version</a>`;
      }
      tools = `<div class="r-tools">
        <button class="btn ghost" data-act="edit">${icon('pencil')} Edit</button>${share}
        ${cloud() ? `<button class="btn ghost" data-act="history">${icon('undo')} History</button>` : ''}
        ${r.edited && !cloud() ? `<span class="edited-note">You’ve changed this recipe</span>` : ''}
      </div>`;
    } else {
      const copy = Store.mine(r.id);
      tools = `<div class="r-tools">
        ${copy ? `<a class="btn primary" href="#/r/${encodeURIComponent(copy.id)}">${icon('book')} Open my copy</a>` : `<button class="btn primary" data-act="add-from-box">${icon('plus')} Add to my book</button>`}
        <button class="btn ghost" data-act="edit">${icon('pencil')} Edit the family version</button>
        <button class="btn ghost" data-act="history">${icon('undo')} History</button>
        ${r.by && r.by === (Store.user() || {}).uid ? `<button class="btn ghost danger-text" data-act="unshare">${icon('trash')} Take out of Blue Book Recipes</button>` : ''}
        <p class="fine">Shared by ${esc(r.byName || 'the family')}. Changes here go to everyone’s Blue Book Recipes; each person decides whether to update their own copy.</p>
      </div>`;
    }

    let left, right;
    if (layout === 'top') { left = photo + head + ing; right = dir + notes + tools; }
    else if (layout === 'bottom') { left = head + ing; right = dir + notes + photo + tools; }
    else { left = head + `<div class="ph-ing">${photo}${ing}</div>`; right = dir + notes + tools; }

    return {
      cls: `screen-recipe layout-${layout} c-${s.color || 'sage'}${mine ? '' : ' is-box'}`,
      label: mine ? s.name : 'Blue Book Recipes', section: mine ? r.section : null, left, right,
      after(root) {
        const paint = () => { if (!Ink.active()) Ink.paint(root, r.ink); };
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
        <button class="btn primary" data-act="settings">${icon('gear')} Family settings</button>`, right: '',
    };
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
        <p>Every recipe the family has shared, starting with Mom’s Blue Book. Add any of them to your own book — your copy is yours to change.</p>
        <div class="chips">${chip('all', 'All', all.length)}${chip('new', 'Not in my book', notMine.length)}${updates.length ? chip('updates', 'Updated', updates.length) : ''}</div>
        <p class="fine">To share one of yours, open it in your book and tap <b>Share with the family</b>.</p>
        <h2 class="sub">The family</h2>
        <ul class="people">${Object.entries(fam.names || {}).map(([uid, n]) => `<li>${icon('heart')} ${esc(n)}${uid === (Store.user() || {}).uid ? ' <em>(you)</em>' : ''}</li>`).join('')}</ul>
        <button class="btn ghost" data-act="settings">${icon('gear')} Invite code &amp; family settings</button>`,
      right: groups.length ? groups.map(([s, l]) => `<h2 class="sub c-${s.color}">${esc(s.name)}</h2><ol class="rlist plain box-list">${l.map(row).join('')}</ol>`).join('')
        : `<p class="empty">${filter === 'new' ? 'You have every family recipe in your book.' : 'Nothing here yet.'}</p>`,
    };
  };

  /* Signing in */
  Screens.signin = () => {
    const mode = authMode;
    return {
      cls: 'screen-signin', label: '',
      left: `<div class="signin-cover"><img src="cover-portrait.jpg" alt="" onerror="this.remove()"></div>`,
      right: `<div class="kicker">Our family’s</div><h1 class="script">Blue Book</h1>
        <form class="signin" id="signin" autocomplete="on">
          <div class="seg wide-seg"><button type="button" class="${mode === 'in' ? 'on' : ''}" data-mode="in">Sign in</button><button type="button" class="${mode === 'up' ? 'on' : ''}" data-mode="up">I’m new</button></div>
          ${mode === 'up' ? `<label class="fld"><span>Your name</span><input name="name" autocomplete="given-name" required placeholder="Bella"></label>` : ''}
          <label class="fld"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="fld"><span>Password</span><input name="password" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required minlength="6">
            ${mode === 'up' ? '<small>At least 6 characters.</small>' : ''}</label>
          <p class="form-err" id="signin-err" hidden></p>
          <button class="btn primary wide" type="submit">${mode === 'up' ? 'Make my book' : 'Open my book'}</button>
          ${mode === 'in' ? '<button type="button" class="link forgot" data-act="forgot">Forgot your password?</button>' : '<p class="fine">Your book starts with all of Mom’s Blue Book recipes. Next you can join the family with an invite code.</p>'}
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
  Screens.loading = () => ({ cls: 'screen-loading', label: '', left: `<p class="loading-msg">${icon('book')} Opening your book…</p>`, right: '' });

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
  function render() {
    let scr = parse(location.hash);
    if (window.BB_NEEDS_INTERNET) scr = { t: 'needsNet' };
    else if (cloud()) {
      if (!Store.user()) scr = { t: 'signin' };
      else if (!Store.ready) scr = { t: 'loading' };
      else if (Store.needsFamilyChoice()) scr = { t: 'welcome' };
      else if (Store.hasLocalData() && !importAsked) { importAsked = true; setTimeout(askImport, 400); }
    }
    const seq = sequence();
    const key = keyOf(scr);
    const from = seq.findIndex(s => keyOf(s) === lastKey), to = seq.findIndex(s => keyOf(s) === key);
    const dir = from >= 0 && to >= 0 && from !== to ? (to > from ? 'next' : 'prev') : (lastKey && lastKey !== key ? 'fade' : '');
    const same = lastKey === key;
    lastKey = key;

    if (Ink.active() && keyOf(scr) !== lastKey) { Ink.stop(true); return; }
    const out = (Screens[scr.t] || Screens.cover)(scr);
    const keep = same ? [spread.scrollTop, ...$$('.leaf', spread).map(l => l.scrollTop)] : null;
    spread.className = 'spread ' + (out.cls || '');
    spread.innerHTML = `<section class="leaf left">${out.left}</section><section class="leaf right">${out.right || ''}</section>`;
    if (keep) { spread.scrollTop = keep[0]; $$('.leaf', spread).forEach((l, i) => { l.scrollTop = keep[i + 1] || 0; }); }
    else { spread.scrollTop = 0; }
    if (dir && !same && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spread.classList.add('turn-' + dir);
      spread.addEventListener('animationend', () => spread.classList.remove('turn-' + dir), { once: true });
    }
    book.classList.toggle('is-cover', ['cover', 'signin', 'loading', 'welcome', 'needsNet'].includes(scr.t));
    book.classList.toggle('no-pager', ['signin', 'loading', 'welcome', 'needsNet'].includes(scr.t));
    document.body.classList.toggle('signed-out', ['signin', 'loading', 'welcome', 'needsNet'].includes(scr.t));
    fillPhotos(spread);
    if (out.after) out.after(spread);

    // Tabs down the edge, one per section.
    const active = out.section || (scr.t === 'section' ? scr.id : null);
    tabs.innerHTML = Store.sections().map(s => `<a class="tab c-${s.color}${s.id === active ? ' on' : ''}" href="#/s/${encodeURIComponent(s.id)}" title="${esc(s.name)}"><span>${esc(s.tab || s.name)}</span></a>`).join('');

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
    document.title = scr.t === 'recipe' && Store.get(scr.id) ? Store.get(scr.id).title + ' · Blue Book' : 'Blue Book';
  }

  function turn(step) {
    const seq = sequence(), i = seq.findIndex(s => keyOf(s) === keyOf(parse(location.hash)));
    const t = seq[i + step];
    if (i >= 0 && t) location.hash = hrefOf(t);
  }

  // Swipe left/right anywhere on the page to turn it.
  let touch = null;
  book.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('input, textarea, select, .noswipe')) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  book.addEventListener('touchend', e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - touch.t < 700) turn(dx < 0 ? 1 : -1);
    touch = null;
  }, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || !$('#sheet-wrap').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') turn(1);
    if (e.key === 'ArrowLeft') turn(-1);
  });

  /* ---------- Recipe page actions ---------- */
  function currentRecipe() { const p = parse(location.hash); return p.t === 'recipe' ? Store.get(p.id) : p.t === 'boxr' ? Store.boxGet(p.id) : null; }
  function refreshScale(r) {
    const m = $('.r-meta', spread);
    const open = !$('.times', m).hidden;
    m.querySelector('.serves').remove(); m.querySelector('.times').remove();
    const note = m.querySelector('.scaled-note'); if (note) note.remove();
    m.insertAdjacentHTML('afterbegin', servesHtml(r));
    if (open) { $('.times', m).hidden = false; $('.sv-x', m).setAttribute('aria-expanded', 'true'); }
    $('#ing-list', spread).innerHTML = ingredientsHtml(r);
  }

  const actions = {
    less(r) { const n = servesFor(r); scaleState[r.id] = n > 1 ? (Number.isInteger(n) ? n - 1 : Math.floor(n)) : Math.max(0.25, n / 2); refreshScale(r); },
    more(r) { const n = servesFor(r); scaleState[r.id] = n < 1 ? Math.min(1, n * 2) : (Number.isInteger(n) ? n + 1 : Math.ceil(n)); refreshScale(r); },
    mult(r, el) { scaleState[r.id] = (r.serves || 4) * +el.dataset.m; refreshScale(r); },
    'reset-scale'(r) { delete scaleState[r.id]; refreshScale(r); },
    times(r, el) { const t = $('.times', spread); t.hidden = !t.hidden; el.setAttribute('aria-expanded', String(!t.hidden)); },
    'est-info'() { toast('Mom’s book didn’t say how many this serves, so this is a guess. Fix it in Edit once you’ve made it.', 5200); },
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
    write(r) {
      inkFor = r.id; render();
      Ink.start(spread, Store.get(r.id), (ink, size) => {
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
    'add-from-box'(r) { const id = Store.addFromBox(r.id); toast('Added to your book'); if (id) setTimeout(() => { location.hash = '#/r/' + encodeURIComponent(id); }, 300); },
    async unshare(r) {
      if (!await ask('Take this recipe out of Blue Book Recipes? It stays in everyone’s own book if they already added it.', { ok: 'Take it out', danger: true })) return;
      await Store.removeFromBox(r.id); location.hash = '#/box'; toast('Taken out of Blue Book Recipes');
    },
  };

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'new-recipe') return openEditor(null, el.dataset.section);
    if (act === 'new-section') return newSection();
    if (act === 'rename-section') return renameSection(el.dataset.id);
    if (act === 'settings') return openSettings();
    if (act === 'box-add') { e.preventDefault(); Store.addFromBox(el.dataset.id); return toast('Added to your book'); }
    if (act === 'skip-family') { await Store.skipFamily(); location.hash = '#/index'; return; }
    if (act === 'forgot') return forgot();
    if (act === 'sign-out') { if (await ask('Sign out of Blue Book on this device?', { ok: 'Sign out' })) { closeSheet(); await Store.signOut(); } return; }
    if (el.closest('#spread') && actions[act]) {
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
  async function renameSection(id) {
    const s = sectionOf(id); if (!s) return;
    const name = await ask('Rename this section', { ok: 'Save', input: s.name });
    if (!name) return;
    Store.renameSection(id, name); render();
  }

  /* ---------- Editor ---------- */
  function openEditor(r, sectionId, opts = {}) {
    const isNew = !r, toBox = !!opts.box;
    const me = Store.settings().name;
    r = r || { title: '', from: me || '', section: sectionId || (parse(location.hash).t === 'section' ? parse(location.hash).id : 'entrees'), serves: 4, est: false, layout: 'side', tags: [], ing: '', steps: '', notes: '' };
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
        <label class="fld"><span>Section</span><select name="section">${sectionOf(r.section) ? '' : `<option value="${esc(r.section || 'entrees')}" selected>${esc(r.sectionName || 'Other')}</option>`}${Store.sections().map(s => `<option value="${esc(s.id)}"${s.id === r.section ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">+ New section…</option></select></label>
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
    const custom = Store.sections().filter(x => x.custom);
    const fam = Store.family(), u = Store.user();
    const familyCard = !cloud() ? '' : fam ? `<div class="fld fam-card"><span class="fld-l">Family</span>
        <div class="fam-name"><b>${esc(fam.name || 'Our Family')}</b> <button class="link" id="fam-rename">Rename</button></div>
        <div class="code-box"><span class="lbl">Invite code</span><b class="code">${esc(fam.code)}</b>
          <button class="btn ghost sm" id="code-copy">Copy</button>${navigator.share ? '<button class="btn ghost sm" id="code-share">Send…</button>' : ''}</div>
        <small>Send this code to family. They open Blue Book, tap “I’m new,” and type it in to join. <button class="link" id="code-new">Make a new code</button> (the old one stops working).</small>
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
      ${custom.length ? `<div class="fld"><span class="fld-l">Your sections</span><ul class="set-list">${custom.map(c => `<li><span>${esc(c.name)}</span>
        <button class="btn ghost" data-sec-rename="${esc(c.id)}">Rename</button><button class="btn ghost danger-text" data-sec-del="${esc(c.id)}">Delete</button></li>`).join('')}</ul></div>` : ''}
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
      if (e.target.closest('#code-share')) { navigator.share({ text: `Join our family’s Blue Book recipes! Open ${location.origin + location.pathname}, tap “I’m new,” and use invite code ${fam.code}` }).catch(() => {}); return; }
      if (e.target.closest('#code-new')) { if (await ask('Make a new invite code? The old one will stop working (people already in the family stay in).', { ok: 'New code' })) { await Store.changeCode(); openSettings(); } return; }
      if (e.target.closest('#fam-rename')) { const n = await ask('Family name', { ok: 'Save', input: fam.name || '' }); if (n) { await Store.renameFamily(n); openSettings(); } return; }
      if (e.target.closest('#fam-leave')) { if (await ask('Leave the family? Your own book stays exactly as it is; you just won’t see Blue Book Recipes until you join again.', { ok: 'Leave', danger: true })) { await Store.leaveFamily(); openSettings(); } return; }
      const c = e.target.closest('[data-cover]');
      if (c) { const data = await pickImage(); if (data) { Store.setSetting(c.dataset.cover, await Photos.put(data)); openSettings(); } return; }
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
  const mq = matchMedia('(orientation: landscape) and (min-width: 900px) and (min-height: 540px)');
  const setMode = () => document.documentElement.classList.toggle('two-page', mq.matches);
  // Turning the iPad or resizing the window re-flows the page, so the writing is redrawn to match.
  mq.addEventListener('change', () => { setMode(); if (Ink.active()) Ink.stop(true); else render(); }); setMode();
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const r = currentRecipe(); if (r && !Ink.active()) Ink.paint(spread, r.ink); }, 250); });

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
