/* The Blue Book sticker set. Drawn as SVG so they stay crisp at any size and use the book's own
   fonts. Each has a thick white edge like a die-cut sticker; the page adds the soft shadow.
   A sticker on a recipe is saved as { r: 'bb:<id>' } (or a photo ref for your own pictures). */
(function () {
  const W = '#FFFFFF', BLUE = '#3F5C7A', TERRA = '#A85C42', ROSE = '#C9786F', SAGE = '#6F8A69', GOLD = '#D9A84A', CREAM = '#FBF3E4';
  const script = (x, y, size, color, text, extra = '') =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Dancing Script, cursive" font-weight="700" font-size="${size}" fill="${color}" ${extra}>${text}</text>`;
  const caps = (x, y, size, color, text) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Cormorant Garamond, serif" font-weight="700" font-size="${size}" letter-spacing="1.5" fill="${color}">${text}</text>`;
  const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const scallop = (cx, cy, r, n, fill) => {
    let d = '';
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; d += `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${(r * Math.PI / n * 1.15).toFixed(1)}" fill="${fill}"/>`; }
    return d;
  };
  const star = (cx, cy, R, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; p.push((cx + Math.cos(a) * rad).toFixed(1) + ',' + (cy + Math.sin(a) * rad).toFixed(1)); }
    return p.join(' ');
  };
  const HEART = 'M100 170 C 42 130 18 100 28 66 C 38 34 80 30 100 58 C 120 30 162 34 172 66 C 182 100 158 130 100 170 Z';

  window.BBStickers = [
    { id: 'heart', name: 'Heart', svg: svg(200, 190,
      `<path d="${HEART}" fill="${W}" stroke="${W}" stroke-width="22" stroke-linejoin="round"/>
       <path d="${HEART}" fill="${ROSE}"/><ellipse cx="66" cy="70" rx="14" ry="9" fill="#fff" opacity=".45" transform="rotate(-30 66 70)"/>`) },
    { id: 'star', name: 'Star', svg: svg(200, 200,
      `<polygon points="${star(100, 106, 88, 38)}" fill="${W}" stroke="${W}" stroke-width="22" stroke-linejoin="round"/>
       <polygon points="${star(100, 106, 88, 38)}" fill="${GOLD}"/><polygon points="${star(100, 106, 46, 20)}" fill="#fff" opacity=".22"/>`) },
    { id: 'favorite', name: 'Family favorite', svg: svg(220, 220,
      `${scallop(110, 110, 92, 22, W)}<circle cx="110" cy="110" r="96" fill="${W}"/>${scallop(110, 110, 84, 22, BLUE)}<circle cx="110" cy="110" r="86" fill="${BLUE}"/>
       <circle cx="110" cy="110" r="72" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 6" opacity=".7"/>
       ${script(110, 104, 40, '#fff', 'Family')}${script(110, 146, 40, '#fff', 'favorite!')}
       <path d="M110 66 c -6 -8 -18 -4 -14 6 c 3 6 14 12 14 12 c 0 0 11 -6 14 -12 c 4 -10 -8 -14 -14 -6 z" fill="${ROSE}"/>`) },
    { id: 'moms-pick', name: 'Mom’s pick', svg: svg(280, 120,
      `<path d="M14 30 L44 30 L44 98 L14 98 L30 64 Z M266 30 L236 30 L236 98 L266 98 L250 64 Z" fill="${W}" stroke="${W}" stroke-width="16" stroke-linejoin="round"/>
       <rect x="34" y="14" width="212" height="84" rx="6" fill="${W}" stroke="${W}" stroke-width="16"/>
       <path d="M18 34 L50 34 L50 94 L18 94 L33 64 Z M262 34 L230 34 L230 94 L262 94 L247 64 Z" fill="#8A4632"/>
       <rect x="40" y="20" width="200" height="72" rx="4" fill="${TERRA}"/>
       ${script(140, 70, 44, '#fff', 'Mom’s pick')}`) },
    { id: 'make-again', name: 'Make again!', svg: svg(240, 130,
      `<path d="M40 12 H222 a10 10 0 0 1 10 10 V108 a10 10 0 0 1 -10 10 H40 L8 65 Z" fill="${W}" stroke="${W}" stroke-width="18" stroke-linejoin="round"/>
       <path d="M42 18 H220 a6 6 0 0 1 6 6 V106 a6 6 0 0 1 -6 6 H42 L14 65 Z" fill="${CREAM}" stroke="${BLUE}" stroke-width="3"/>
       <circle cx="38" cy="65" r="8" fill="#fff" stroke="${BLUE}" stroke-width="3"/>
       ${script(132, 79, 36, BLUE, 'Make again!')}`) },
    { id: 'yum', name: 'Yum!', svg: svg(200, 170,
      `<path d="M100 14 C 160 14 188 44 188 76 C 188 110 156 134 108 134 L 70 160 L 76 130 C 34 122 12 100 12 76 C 12 44 40 14 100 14 Z" fill="${W}" stroke="${W}" stroke-width="18" stroke-linejoin="round"/>
       <path d="M100 22 C 154 22 180 48 180 76 C 180 106 152 126 106 126 L 80 146 L 84 124 C 42 118 20 98 20 76 C 20 48 46 22 100 22 Z" fill="#fff" stroke="${TERRA}" stroke-width="4"/>
       ${script(100, 94, 58, TERRA, 'Yum!')}`) },
    { id: 'tape-blue', name: 'Washi tape', svg: svg(260, 70,
      `<path d="M6 10 L14 4 L20 12 L28 4 L34 12 L40 6 L222 6 L228 12 L234 4 L240 12 L246 6 L254 12 L250 64 L242 58 L236 66 L228 58 L222 64 L40 64 L34 58 L26 66 L20 58 L12 66 L8 58 Z" fill="#9FB7CC" opacity=".88"/>
       ${Array.from({ length: 11 }, (_, i) => `<circle cx="${30 + i * 20}" cy="${i % 2 ? 24 : 46}" r="4" fill="#fff" opacity=".8"/>`).join('')}`) },
    { id: 'tape-sage', name: 'Striped tape', svg: svg(260, 70,
      `<defs><pattern id="bbstripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="18" fill="#fff" opacity=".45"/></pattern></defs>
       <path d="M6 8 L14 14 L10 22 L16 30 L10 40 L16 50 L8 62 L252 62 L246 54 L252 44 L246 34 L252 24 L246 14 L254 8 Z" fill="#A9BC9F" opacity=".9"/>
       <path d="M6 8 L14 14 L10 22 L16 30 L10 40 L16 50 L8 62 L252 62 L246 54 L252 44 L246 34 L252 24 L246 14 L254 8 Z" fill="url(#bbstripe)"/>`) },
    { id: 'whisk', name: 'Whisk & spoon', svg: svg(200, 200,
      `<circle cx="100" cy="100" r="92" fill="${W}"/><circle cx="100" cy="100" r="82" fill="${CREAM}" stroke="${BLUE}" stroke-width="3"/>
       <g fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round">
         <path d="M72 150 L72 110"/><path d="M72 110 C 50 90 50 46 72 38 C 94 46 94 90 72 110"/><path d="M72 110 C 62 90 62 54 72 40 C 82 54 82 90 72 110"/>
         <path d="M128 150 L128 96"/><ellipse cx="128" cy="68" rx="18" ry="28"/></g>`) },
    { id: 'pie', name: 'Pie', svg: svg(220, 160,
      `<path d="M20 120 L110 26 L200 120 Q 110 150 20 120 Z" fill="${W}" stroke="${W}" stroke-width="20" stroke-linejoin="round"/>
       <path d="M28 118 L110 34 L192 118 Q 110 142 28 118 Z" fill="#E7B36B"/>
       <path d="M28 118 Q 110 142 192 118 L 192 128 Q 110 154 28 128 Z" fill="#C98B4A"/>
       <path d="M60 92 Q 110 76 160 92" stroke="#C98B4A" stroke-width="4" fill="none"/><path d="M84 66 Q 110 56 136 66" stroke="#C98B4A" stroke-width="4" fill="none"/>
       <circle cx="110" cy="40" r="14" fill="#fff"/>`) },
    { id: 'pumpkin', name: 'Pumpkin', svg: svg(200, 190,
      `<g stroke="${W}" stroke-width="20" stroke-linejoin="round"><ellipse cx="100" cy="112" rx="82" ry="64" fill="${W}"/></g>
       <ellipse cx="62" cy="112" rx="40" ry="58" fill="#D98A3D"/><ellipse cx="138" cy="112" rx="40" ry="58" fill="#D98A3D"/><ellipse cx="100" cy="112" rx="38" ry="62" fill="#E79A48"/>
       <path d="M100 52 C 98 36 104 26 116 20" stroke="${SAGE}" stroke-width="9" fill="none" stroke-linecap="round"/>
       <path d="M108 44 C 126 26 150 34 146 48 C 132 54 116 50 108 44 Z" fill="${SAGE}"/>`) },
    { id: 'holly', name: 'Holly', svg: svg(220, 170,
      `<g fill="${W}" stroke="${W}" stroke-width="20" stroke-linejoin="round"><path d="M110 92 C 80 50 30 40 14 70 C 34 74 40 98 56 108 C 78 110 96 104 110 92 Z"/><path d="M110 92 C 140 50 190 40 206 70 C 186 74 180 98 164 108 C 142 110 124 104 110 92 Z"/><circle cx="110" cy="112" r="34"/></g>
       <path d="M110 92 C 80 50 30 40 14 70 C 34 74 40 98 56 108 C 78 110 96 104 110 92 Z" fill="#4F7A52"/><path d="M110 92 C 140 50 190 40 206 70 C 186 74 180 98 164 108 C 142 110 124 104 110 92 Z" fill="#4F7A52"/>
       <circle cx="96" cy="112" r="16" fill="#B6403A"/><circle cx="124" cy="112" r="16" fill="#B6403A"/><circle cx="110" cy="132" r="16" fill="#B6403A"/>
       <circle cx="92" cy="107" r="4" fill="#fff" opacity=".6"/>`) },
    { id: 'sun', name: 'Sunshine', svg: svg(200, 200,
      `<circle cx="100" cy="100" r="92" fill="${W}"/>
       ${Array.from({ length: 12 }, (_, i) => `<path d="M100 10 L110 34 L90 34 Z" fill="${GOLD}" transform="rotate(${i * 30} 100 100)"/>`).join('')}
       <circle cx="100" cy="100" r="54" fill="#F0C24F"/><circle cx="84" cy="94" r="5" fill="#8A6420"/><circle cx="116" cy="94" r="5" fill="#8A6420"/>
       <path d="M80 112 Q 100 130 120 112" stroke="#8A6420" stroke-width="5" fill="none" stroke-linecap="round"/>`) },
    { id: 'quick', name: 'Quick & easy', svg: svg(220, 220,
      `<circle cx="110" cy="110" r="100" fill="${W}"/><circle cx="110" cy="110" r="90" fill="${SAGE}"/>
       <circle cx="110" cy="84" r="30" fill="none" stroke="#fff" stroke-width="5"/><path d="M110 64 L110 84 L124 92" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
       ${script(110, 150, 28, '#fff', 'Quick & easy')}`) },
    { id: 'gf', name: 'Gluten free', svg: svg(220, 220,
      `<circle cx="110" cy="110" r="100" fill="${W}"/><circle cx="110" cy="110" r="90" fill="${CREAM}" stroke="${SAGE}" stroke-width="4"/>
       <g stroke="${SAGE}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M110 132 L110 56"/>
       ${[64, 80, 96, 112].map(y => `<path d="M110 ${y} C 96 ${y - 6} 92 ${y - 16} 96 ${y - 22}"/><path d="M110 ${y} C 124 ${y - 6} 128 ${y - 16} 124 ${y - 22}"/>`).join('')}</g>
       ${caps(110, 164, 17, SAGE, 'GLUTEN FREE')}`) },
  ];
})();
