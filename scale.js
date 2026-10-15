/* Serving adjuster: reads an ingredient line like "1 ½ cups flour" and rewrites the amount
   for a different number of servings ("¾ cup flour"). Anything it can't read stays exactly as written. */
(function () {
  const FR = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
  const U = '½⅓⅔¼¾⅛⅜⅝⅞';
  const NUM = `(?:\\d+\\s*[${U}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${U}])`;
  const UNIT = '(tsp|teaspoons?|tbsp|tbs|tbls|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|quarts?|pints?|gallons?|ml|kg|g|pkgs?|packages?|cans?|sticks?|cloves?|slices?|bags?|box(?:es)?|jars?|bunch(?:es)?|heads?|stalks?|ears?|dozen|racks?)';
  const LEAD = new RegExp(`^(\\s*)(${NUM})(\\s*(?:-|–|to)\\s*(${NUM}))?(?=[\\s(a-zA-Z”"]|$)`);
  const UNIT_AFTER = new RegExp(`^(\\s*(?:\\([^)]*\\)\\s*)?)${UNIT}\\b`, 'i');
  const PER = new RegExp(`(${NUM})\\s*${UNIT}?\\b[^,;()]*?per person`, 'i');
  const PLUS = new RegExp(`(\\s(?:\\+|plus)\\s)(${NUM})(\\s*)${UNIT}?\\b`, 'i');

  function num(s) {
    s = s.trim();
    let m;
    if ((m = s.match(new RegExp(`^(\\d+)\\s*([${U}])$`)))) return +m[1] + FR[m[2]];
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    if (FR[s] != null) return FR[s];
    return parseFloat(s);
  }

  // Kitchen fraction: 0.5 -> "½", 1.333 -> "1 ⅓". Small amounts keep eighths; big ones round.
  const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];
  // Whole things (onions, cans, potatoes) skip the eighths: "⅓ onion", never "⅜ onion".
  const COUNT = NICE.filter(n => [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1].includes(n[0]));
  function frac(v, coarse, count) {
    if (v >= 10) return String(Math.round(v));
    if (v >= 3 || coarse) v = Math.round(v * 2) / 2;
    const set = count ? COUNT : NICE;
    let whole = Math.floor(v), rest = v - whole, best = set[0];
    for (const n of set) if (Math.abs(rest - n[0]) < Math.abs(rest - best[0])) best = n;
    if (best[0] === 1) { whole += 1; best = NICE[0]; }
    if (!whole && !best[1]) return v > 0 ? (count ? '¼' : '⅛') : '0';
    return whole ? (best[1] ? `${whole} ${best[1]}` : String(whole)) : best[1];
  }

  const unitKind = u => {
    u = (u || '').toLowerCase();
    if (/^(tsp|teaspoons?)$/.test(u)) return ['vol', 1];
    if (/^(tbsp|tbs|tbls|tablespoons?)$/.test(u)) return ['vol', 3];
    if (/^cups?$/.test(u)) return ['vol', 48];
    if (/^(lbs?|pounds?)$/.test(u)) return ['lb', 1];
    return null;
  };

  // Volume in teaspoons -> the easiest thing to measure.
  function volume(t) {
    if (t < 0.1) return 'a pinch';
    if (t < 2.75) return `${frac(t)} tsp`;
    if (t < 11.5) {
      const tb = t / 3, whole = Math.floor(tb + 0.0001), rem = Math.round((t - whole * 3) * 2) / 2;
      if (rem === 0) return `${whole} tbsp`;
      if (rem === 1.5) return `${frac(whole + 0.5)} tbsp`;
      if (rem === 3) return `${whole + 1} tbsp`;
      return `${whole} tbsp + ${frac(rem)} tsp`;
    }
    const c = t / 48, CUPS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
    const whole = Math.floor(c), rest = c - whole;
    let near = CUPS.reduce((a, b) => Math.abs(rest - b) < Math.abs(rest - a) ? b : a);
    if (Math.abs(rest - near) * 48 <= 1.5 || c >= 4) return cups(whole + near);
    near = CUPS.filter(x => x <= rest).pop();
    const tb = Math.round((t - (whole + near) * 48) / 3);
    return `${cups(whole + near)} + ${tb} tbsp`;
  }
  const cups = c => `${frac(c)} ${c > 1 ? 'cups' : 'cup'}`;

  function pounds(lb) {
    if (lb < 0.25) return `${frac(lb * 16, true)} oz`;
    return `${frac(lb)} lb${lb > 1 ? 's' : ''}`;
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const q = s => `<b class="q">${s}</b>`;

  function eggTip(v) {
    const f = v - Math.floor(v);
    if (f < 0.3 || f > 0.7) return null;
    const lo = Math.floor(v), hi = Math.ceil(v);
    return lo ? `about ${frac(v)} — use ${lo} large or ${hi} small` : 'use 1 small egg, or half of a beaten egg';
  }

  /* line: one ingredient. factor: new servings ÷ recipe servings. serves: the new servings (for "per person").
     Returns { html, scaled } — html is safe to insert. */
  function line(text, factor, serves) {
    // "1 chicken breast per person" stays the same; show the total for tonight next to it.
    const pm = text.match(PER);
    if (pm) {
      const total = num(pm[1]) * serves;
      return { html: `${esc(text)} <span class="per">= ${q(frac(total) + (pm[2] ? ' ' + pm[2].toLowerCase() : ''))} total</span>`, scaled: true };
    }
    // "About 10 lasagna noodles" scales the 10.
    const about = text.match(/^(about|approx\.?|approximately)\s+/i);
    if (about) {
      const r = line(text.slice(about[0].length), factor, serves);
      return { html: esc(about[0]) + r.html, scaled: r.scaled };
    }
    const m = text.match(LEAD);
    if (!m) return { html: esc(text), scaled: false };
    const a = num(m[2]), b = m[4] ? num(m[4]) : null;
    let rest = text.slice(m[0].length);
    if (factor === 1) return { html: esc(text), scaled: false };

    const um = rest.match(UNIT_AFTER), kind = um && unitKind(um[2]);
    let amount;
    if (kind && !b) {
      const v = a * kind[1] * factor;
      amount = kind[0] === 'vol' ? volume(v) : pounds(v);
      // the unit is now part of the amount; keep any "(15 oz)" that sat between
      rest = (um[1].trim() ? ' ' + um[1].trim() : '') + rest.slice(um[0].length);
    } else if (b != null) {
      const cnt = !kind;
      const lo = frac(a * factor, false, cnt), hi = frac(b * factor, false, cnt);
      amount = lo === hi ? lo : `${lo}-${hi}`;
    } else {
      const v = a * factor;
      const egg = /^\s*(large\s+|small\s+)?eggs?\b/i.test(rest) && eggTip(v);
      amount = frac(v, false, true);
      if (egg) return { html: `${m[1]}${q(amount)}${esc(rest)} <span class="per">(${egg})</span>`, scaled: true };
    }
    let out = m[1] + q(esc(amount)) + esc(rest);
    // "1 cup + 2 tbsp water" / "1 egg plus 1 egg yolk"
    const p = rest.match(PLUS);
    if (p) {
      const pk = p[4] && unitKind(p[4]);
      const pv = num(p[2]) * factor * (pk ? pk[1] : 1);
      const pAmt = pk ? (pk[0] === 'vol' ? volume(pv) : pounds(pv)) : frac(pv) + p[3] + (p[4] || '');
      out = m[1] + q(esc(amount)) + esc(rest.slice(0, p.index)) + esc(p[1]) + q(esc(pAmt)) + esc(rest.slice(p.index + p[0].length));
    }
    return { html: out, scaled: true };
  }

  // A tip about the pan when the amounts change a lot.
  function panTip(allText, factor) {
    const t = allText.toLowerCase().replace(/\s*x\s*/g, 'x');
    const has913 = t.includes('9x13'), has88 = t.includes('8x8');
    if (factor <= 0.6 && has913) return 'Making half? An 8x8 pan works instead of the 9x13.';
    if (factor >= 1.7 && factor <= 2.3 && has88) return 'Doubling? Use a 9x13 instead of the 8x8.';
    if (factor >= 1.7 && has913) return 'Making more? You’ll need two 9x13 pans.';
    return null;
  }

  window.Scale = { line, frac, panTip, num };
})();
