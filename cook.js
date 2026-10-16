/* Cook mode: big text, the screen stays on, tap ingredients off, one step at a time,
   and tap any time in a step ("bake 30 min") to start a timer. Timers keep going if you leave
   cook mode, and they survive a reload (saved in localStorage). */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lines = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean);
  const FR = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75 };

  /* ---------- timers ---------- */
  let timers = [];
  try { timers = JSON.parse(localStorage.getItem('bb-timers') || '[]'); } catch (e) {}
  const keep = () => { try { localStorage.setItem('bb-timers', JSON.stringify(timers)); } catch (e) {} };
  let audio = null, tick = null, ringT = null;

  // "30 min", "1 ½ hours", "8-10 minutes" (starts with the shorter time), "45 seconds"
  const TIME = /(\d+(?:\.\d+)?(?:\s*[½⅓⅔¼¾])?|[½⅓⅔¼¾])(\s*(?:-|–|to)\s*(\d+(?:\.\d+)?(?:\s*[½⅓⅔¼¾])?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b\.?/gi;
  const amount = s => { s = s.trim(); const m = s.match(/^(\d+(?:\.\d+)?)?\s*([½⅓⅔¼¾])?$/); return m ? (+(m[1] || 0) + (FR[m[2]] || 0)) : parseFloat(s); };
  const unitSec = u => /^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1;
  function withTimers(text) {
    let out = '', i = 0;
    text.replace(TIME, (m, a, _r, b, u, at) => {
      const sec = Math.round(amount(a) * unitSec(u));
      out += esc(text.slice(i, at)) + (sec > 0 ? `<button class="tmr" data-sec="${sec}" data-label="${esc(m)}">⏱ ${esc(m)}</button>` : esc(m));
      i = at + m.length; return m;
    });
    return out + esc(text.slice(i));
  }
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  function addTimer(sec, label, recipe) {
    unlockAudio();
    timers.push({ id: Date.now().toString(36), end: Date.now() + sec * 1000, sec, label, recipe });
    keep(); drawTimers(); run(); stayAwake();
  }
  function run() {
    clearInterval(tick);
    if (!timers.length) return drawTimers();
    tick = setInterval(() => {
      const done = timers.filter(t => !t.rang && t.end <= Date.now());
      if (done.length) { done.forEach(t => { t.rang = true; }); keep(); ring(); }
      drawTimers();
    }, 500);
  }
  function unlockAudio() {
    try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {}
  }
  function chime() {
    if (!audio) return;
    const t0 = audio.currentTime;
    [0, .28, .56].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = [880, 1175, 1568][i];
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + .5);
      o.connect(g).connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + .55);
    });
  }
  function ring() {
    clearInterval(ringT);
    const go = () => { if (!timers.some(t => t.rang)) return clearInterval(ringT); chime(); if (navigator.vibrate) navigator.vibrate([300, 150, 300]); };
    go(); ringT = setInterval(go, 3500);
  }
  function drawTimers() {
    let bar = document.getElementById('timer-bar');
    document.documentElement.style.setProperty('--timers', timers.length);
    document.body.classList.toggle('has-timers', timers.length > 0);
    if (!timers.length) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'timer-bar'; bar.className = 'timer-bar'; document.body.appendChild(bar); bar.onclick = timerClick; }
    bar.innerHTML = timers.map(t => {
      const left = (t.end - Date.now()) / 1000;
      return `<div class="timer${t.rang ? ' ringing' : ''}"><span class="t-time">${t.rang ? 'Done!' : fmt(left)}</span>
        <span class="t-label">${esc(t.label)}${t.recipe ? ` · ${esc(t.recipe)}` : ''}</span>
        ${t.rang ? '' : `<button data-t="plus" data-id="${t.id}" aria-label="One more minute">+1</button>`}
        <button data-t="stop" data-id="${t.id}" aria-label="Stop timer">${t.rang ? 'OK' : '✕'}</button></div>`;
    }).join('');
  }
  function timerClick(e) {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = timers.find(x => x.id === b.dataset.id); if (!t) return;
    if (b.dataset.t === 'plus') t.end += 60000;
    else timers = timers.filter(x => x !== t);
    keep(); drawTimers(); run(); stayAwake();
  }

  /* ---------- the cook mode screen ---------- */
  let wake = null, cur = null, asking = false;
  // Keep the screen on while you're in cook mode or any timer is running (or ringing).
  async function stayAwake() {
    const want = !!cur || timers.length > 0;
    if (!want) { if (wake) { wake.release().catch(() => {}); wake = null; } return; }
    if (wake || asking || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    asking = true;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { wake = null; }
    asking = false;
    if (!(cur || timers.length) && wake) stayAwake();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { stayAwake(); if (timers.length) { run(); if (timers.some(t => t.rang)) ring(); } }
  });

  /* r: the recipe. serves/setServes: tonight's servings (shared with the recipe page). */
  function open(r, serves, setServes) {
    const checked = new Set(JSON.parse(sessionStorage.getItem('bb-cook-' + r.id) || '[]'));
    cur = { r, step: +(sessionStorage.getItem('bb-step-' + r.id) || 0), serves, tab: 'ing' };
    const steps = [];
    let head = null;
    for (const l of lines(r.steps)) {
      if (l.startsWith('#')) { head = l.replace(/^#\s*/, ''); continue; }
      if (l.startsWith('- ') && steps.length) { steps[steps.length - 1].subs.push(l.slice(2)); continue; }
      steps.push({ text: l, subs: [], head }); head = null;
    }
    if (!steps.length) steps.push({ text: 'No directions written yet.', subs: [] });
    cur.step = Math.min(cur.step, steps.length - 1);

    const el = document.createElement('div');
    el.className = 'cook'; el.id = 'cook';
    document.body.appendChild(el); document.body.classList.add('cooking');
    stayAwake();

    const draw = () => {
      const base = r.serves || 4, f = cur.serves / base;
      let ingHtml = '', idx = 0;
      for (const l of lines(r.ing)) {
        if (l.startsWith('#')) { ingHtml += `<li class="c-grp">${esc(l.replace(/^#\s*/, ''))}</li>`; continue; }
        const i = idx++;
        ingHtml += `<li class="c-ing${checked.has(i) ? ' got' : ''}" data-i="${i}"><span class="box"></span><span>${Scale.line(l, f, cur.serves).html}</span></li>`;
      }
      const s = steps[cur.step];
      el.innerHTML = `<div class="cook-top">
          <button class="cook-x" data-c="close" aria-label="Leave cook mode">✕</button>
          <h1 class="script">${esc(r.title)}</h1>
          <div class="cook-serves"><span class="lbl">${r.makes ? 'Makes' : 'Serves'}</span><button data-c="less">−</button><b>${Scale.frac(cur.serves)}</b><button data-c="more">+</button>${r.makes ? `<span>${esc(Scale.unit(r.makes, cur.serves))}</span>` : ''}</div>
        </div>
        <div class="cook-tabs"><button data-c="tab-ing" class="${cur.tab === 'ing' ? 'on' : ''}">Ingredients</button><button data-c="tab-steps" class="${cur.tab === 'steps' ? 'on' : ''}">Steps</button></div>
        <div class="cook-body show-${cur.tab}">
          <section class="cook-ing"><h2 class="sub">Ingredients <em>${checked.size ? `${checked.size} of ${idx} ✓` : 'tap to check off'}</em></h2><ul>${ingHtml || '<li>No ingredients listed.</li>'}</ul>
            ${checked.size ? '<button class="link" data-c="uncheck">Uncheck all</button>' : ''}</section>
          <section class="cook-steps">
            <h2 class="sub">Step ${cur.step + 1} of ${steps.length}</h2>
            ${s.head ? `<p class="c-head">${esc(s.head)}</p>` : ''}
            <p class="c-step">${withTimers(s.text)}</p>
            ${s.subs.length ? `<ul class="c-subs">${s.subs.map(x => `<li>${withTimers(x)}</li>`).join('')}</ul>` : ''}
            <div class="c-dots">${steps.map((_, i) => `<button data-c="go" data-n="${i}" class="${i === cur.step ? 'on' : i < cur.step ? 'past' : ''}" aria-label="Step ${i + 1}"></button>`).join('')}</div>
            <div class="c-nav"><button class="btn ghost" data-c="prev" ${cur.step ? '' : 'disabled'}>‹ Back</button>
              ${cur.step < steps.length - 1 ? '<button class="btn primary" data-c="next">Next step ›</button>' : '<button class="btn primary" data-c="close">All done!</button>'}</div>
            ${steps[cur.step + 1] ? `<p class="c-next"><span class="lbl">Next</span> ${esc(steps[cur.step + 1].text)}</p>` : ''}
          </section>
        </div>
        ${'wakeLock' in navigator ? '' : '<p class="c-awake">Tip: this device may still dim the screen — tap it now and then.</p>'}`;
    };
    el.onclick = e => {
      const tb = e.target.closest('.tmr');
      if (tb) return addTimer(+tb.dataset.sec, tb.dataset.label, r.title);
      const li = e.target.closest('.c-ing');
      if (li) { const i = +li.dataset.i; checked.has(i) ? checked.delete(i) : checked.add(i); sessionStorage.setItem('bb-cook-' + r.id, JSON.stringify([...checked])); return draw(); }
      const b = e.target.closest('[data-c]'); if (!b) return;
      const c = b.dataset.c;
      if (c === 'close') return close();
      if (c === 'next') cur.step++;
      if (c === 'prev') cur.step--;
      if (c === 'go') cur.step = +b.dataset.n;
      if (c === 'tab-ing') cur.tab = 'ing';
      if (c === 'tab-steps') cur.tab = 'steps';
      if (c === 'uncheck') { checked.clear(); sessionStorage.removeItem('bb-cook-' + r.id); }
      if (c === 'less' || c === 'more') {
        const n = cur.serves;
        cur.serves = c === 'less' ? (n > 1 ? (Number.isInteger(n) ? n - 1 : Math.floor(n)) : Math.max(0.25, n / 2)) : (n < 1 ? Math.min(1, n * 2) : (Number.isInteger(n) ? n + 1 : Math.ceil(n)));
        setServes(cur.serves);
      }
      sessionStorage.setItem('bb-step-' + r.id, cur.step);
      draw();
      if (c === 'next' || c === 'prev' || c === 'go') el.querySelector('.cook-steps').scrollIntoView({ block: 'start' });
    };
    const key = e => {
      if (!document.getElementById('cook')) return document.removeEventListener('keydown', key);
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && cur.step < steps.length - 1) { cur.step++; draw(); }
      if (e.key === 'ArrowLeft' && cur.step > 0) { cur.step--; draw(); }
    };
    document.addEventListener('keydown', key);
    draw();
  }
  function close() {
    const el = document.getElementById('cook'); if (el) el.remove();
    document.body.classList.remove('cooking');
    cur = null;
    stayAwake(); // lets go only if no timers are running
    if (Cook.onClose) Cook.onClose();
  }

  if (timers.length) { drawTimers(); run(); stayAwake(); }
  window.Cook = { open, close, onClose: null };
})();
