import './style.css'
import { samples } from './samples.js'
import rabbitersTeam from './rabbiters-team.jpg'

const artRoot = `${import.meta.env.BASE_URL}tower-defense-art/`
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  )

/** Static artwork only: opening the catalog never initializes the game or a renderer. */
function battlefield() {
  const units = [
    ['soldier', 'squire', 47, 52],
    ['tank', 'knight', 32, 66],
    ['mage', 'mage', 64, 66],
    ['archer', 'archer', 61, 35],
    ['slime', 'slime', 75, 47],
    ['goblin', 'goblin', 82, 62]
  ]
  return `<div class="battlefield" aria-hidden="true">
    <div class="scene-halo"></div>
    <svg class="terrain" viewBox="0 0 800 700" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="land" x1="250" y1="150" x2="640" y2="600" gradientUnits="userSpaceOnUse"><stop stop-color="#a9b679"/><stop offset="1" stop-color="#627949"/></linearGradient>
        <linearGradient id="earth" x1="350" y1="500" x2="350" y2="660" gradientUnits="userSpaceOnUse"><stop stop-color="#596249"/><stop offset="1" stop-color="#293e35"/></linearGradient>
        <pattern id="grass" width="42" height="35" patternUnits="userSpaceOnUse"><path d="m11 20 2-5m0 5 4-3m14 12 1-4" stroke="#d5dbab" stroke-opacity=".26" stroke-width="2"/></pattern>
        <filter id="shadow"><feGaussianBlur stdDeviation="17"/></filter>
      </defs>
      <ellipse cx="425" cy="599" rx="279" ry="44" fill="#0d241f" opacity=".4" filter="url(#shadow)"/>
      <path d="M95 325 340 176 715 365 715 447 461 639 95 431Z" fill="url(#earth)"/>
      <path d="m95 325 245-149 375 189-254 189Z" fill="url(#land)"/>
      <path d="m95 325 245-149 375 189-254 189Z" fill="url(#grass)"/>
      <path d="m95 325 366 229 254-189" stroke="#d5d6a0" stroke-opacity=".45" stroke-width="4"/>
      <path d="m95 391 366 227 254-190M461 554v84" stroke="#a2a77a" stroke-opacity=".2" stroke-width="3"/>
      <path d="m181 306 133 82 105-63 110 67-79 59 160 79" stroke="#53623d" stroke-opacity=".3" stroke-width="53" stroke-linejoin="round"/>
      <path d="m181 301 133 82 105-63 110 67-79 59 160 79" stroke="#d7c28c" stroke-width="42" stroke-linejoin="round"/>
      <path d="m181 301 133 82 105-63 110 67-79 59 160 79" stroke="#eddbac" stroke-opacity=".45" stroke-width="3" stroke-dasharray="5 12"/>
      <g fill="#385a41" stroke="#304e3b" stroke-width="3">
        <path d="m129 307 34-78 36 89-33 20Z"/><path d="m177 274 32-76 35 89-32 19Z"/>
        <path d="m322 222 26-66 30 76-28 15Z"/>
        <path d="m636 340 28-77 34 94-32 16Z"/><path d="m654 404 33-86 35 103-35 18Z"/>
        <path d="m154 408 29-78 33 94-30 17Z"/><path d="m539 521 25-68 30 82-29 15Z"/>
      </g>
      <g fill="#6f8d58"><path d="m146 280 17-45 21 56Z"/><path d="m187 247 22-43 20 53Z"/><path d="m648 313 16-43 20 53Z"/><path d="m668 374 20-47 19 58Z"/></g>
      <g stroke="#ece0b9" stroke-width="2"><path d="m240 335 47-27 35 22-46 28Z" fill="#829061"/><path d="m429 276 44-25 37 20-44 28Z" fill="#829061"/><path d="m386 451 44-25 36 21-43 28Z" fill="#829061"/></g>
      <g><path d="m262 300 0-103 41-22 43 25v103l-40 24Z" fill="#bdc4ae"/><path d="m303 175 43 25v103l-40 24Z" fill="#879581"/><path d="m252 195 51-63 55 67-52 30Z" fill="#4c6861"/><path d="m303 132 55 67-52 30Z" fill="#304c49"/><path d="m281 243 0-23 12-6v23Z" fill="#4a6052"/><path d="m315 266 0-24 12 6v25Z" fill="#40554b"/><path d="m305 145 0-76 50 14-50 23" stroke="#d9d2a6" stroke-width="4" fill="#dfad58"/></g>
      <g fill="#bcc49b"><path d="m218 391 16-7 12 9-15 10Z"/><path d="m552 317 13-6 14 9-13 7Z"/><path d="m578 469 18-8 12 10-14 8Z"/></g>
    </svg>
    ${units.map(([unit, name, left, top]) => `<img class="scene-unit ${name}" src="${artRoot}${unit}/portrait.png" alt="" width="112" height="124" style="--x:${left}%;--y:${top}%" decoding="async" draggable="false"/>`).join('')}
  </div>`
}

function gamePreview(art) {
  if (art === 'rabbiters') {
    return `<div class="game-preview rabbiters" aria-hidden="true">
      <img class="rabbit-art" src="${rabbitersTeam}" alt="" width="800" height="1000" loading="lazy" decoding="async" draggable="false" />
    </div>`
  }
  if (art === 'life-survivors') {
    const trouble = (x, y, r, fill, label) =>
      `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${fill}" opacity=".85"/><text y="4" font-size="${Math.round(r * 0.62)}" text-anchor="middle" fill="#fff" font-weight="700">${label}</text></g>`
    return `<div class="game-preview life-survivors" aria-hidden="true">
      <svg class="life-art" viewBox="0 0 220 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <rect width="320" height="260" fill="#2c2438"/>
        <path d="M0 50h220M0 130h220M0 210h220M30 0v260M110 0v260M190 0v260" stroke="#3d3350" stroke-width="2"/>
        <circle cx="110" cy="130" r="64" fill="#a46be022" stroke="#a46be088" stroke-dasharray="6 6"/>
        <path d="M150 168a46 46 0 0 0 6-38" fill="none" stroke="#e0704f" stroke-width="5" stroke-linecap="round" opacity=".6"/>
        ${trouble(52, 44, 18, '#e0b93f', '出費')}
        ${trouble(168, 52, 17, '#b98ae6', '悪口')}
        ${trouble(176, 214, 18, '#5fc2c9', '受験')}
        ${trouble(44, 206, 17, '#7bc47f', '病気')}
        ${trouble(112, 236, 15, '#6d8fd6', '仕事')}
        ${trouble(112, 30, 14, '#e0704f', '上司')}
        <g transform="translate(156 124)"><circle r="12" fill="#e0704f"/><path d="M-6-9l-3-6 6 3M6-9l3-6-6 3" stroke="#e0704f" stroke-width="3"/><circle cx="-4" cy="-1" r="2" fill="#fff"/><circle cx="4" cy="-1" r="2" fill="#fff"/></g>
        <g transform="translate(110 130)">
          <circle r="22" fill="#ffd9b0" stroke="#ffd166" stroke-width="4"/>
          <path d="M-6-20q6-8 10 0" fill="none" stroke="#8a5a3c" stroke-width="3"/>
          <circle cx="-7" cy="-2" r="2.6" fill="#3b2412"/><circle cx="7" cy="-2" r="2.6" fill="#3b2412"/>
          <path d="M-5 8q5 5 10 0" fill="none" stroke="#3b2412" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        <g fill="#69b7ff"><path d="M64 96l4 6-4 6-4-6z"/><path d="M150 176l4 6-4 6-4-6z"/><path d="M80 180l4 6-4 6-4-6z"/></g>
        <text x="166" y="96" font-size="14" font-weight="800" fill="#ffcf4d">25!</text>
      </svg>
    </div>`
  }
  if (art === 'yoru-no-yashiki') {
    return `<div class="game-preview yoru-no-yashiki" aria-hidden="true">
      <svg class="yoru-art" viewBox="0 0 220 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="yoru-glow" cx="50%" cy="42%" r="62%"><stop stop-color="#3a4a44" stop-opacity=".7"/><stop offset="1" stop-color="#080c10"/></radialGradient>
        </defs>
        <rect width="320" height="260" fill="#080c10"/>
        <rect width="220" height="175" fill="url(#yoru-glow)"/>
        <rect y="175" width="220" height="85" fill="#141a18"/>
        <path d="M0 196h220M0 226h220" stroke="#2a322d" stroke-width="2"/>
        <g fill="#4b534a" stroke="#202923" stroke-width="3">
          <rect x="8" y="34" width="88" height="128"/><rect x="124" y="34" width="88" height="128"/>
        </g>
        <g stroke="#101713" stroke-width="4">
          <path d="M8 76h88M8 120h88M52 34v128M124 76h88M124 120h88M168 34v128"/>
        </g>
        <rect x="98" y="24" width="24" height="22" fill="#c8ad72" opacity=".5"/>
        <path d="M110 46v10" stroke="#3a3222" stroke-width="2"/>
        <ellipse cx="110" cy="152" rx="58" ry="74" fill="#a9c3ba" opacity=".07"/>
        <g opacity=".72" transform="translate(110 150)">
          <path d="M0-46c-11 0-19 9-20 21l-6 65c-1 10 10 16 26 16s27-6 26-16l-6-65c-1-12-9-21-20-21Z" fill="#c9d6cd" opacity=".55"/>
          <ellipse cx="0" cy="-48" rx="15" ry="19" fill="#e3e8dc" opacity=".8"/>
          <path d="M-16-52c-2 20-4 40-1 56M16-52c2 20 4 40 1 56" stroke="#101b19" stroke-width="7" stroke-linecap="round" fill="none" opacity=".85"/>
          <circle cx="-6" cy="-48" r="2" fill="#131a18"/><circle cx="6" cy="-48" r="2" fill="#131a18"/>
        </g>
        <g fill="#b9c7b6" opacity=".35"><circle cx="38" cy="70" r="1.5"/><circle cx="182" cy="102" r="1.2"/><circle cx="72" cy="148" r="1"/><circle cx="154" cy="56" r="1.3"/></g>
      </svg>
    </div>`
  }
  if (art === 'mamono-jinkei') {
    // Pixel art from character maps: the four slime heroes in formation around a glowing ring.
    const pixels = (rows, colors, ox, oy, k) =>
      rows
        .flatMap((row, y) =>
          [...row].map((ch, x) =>
            ch === '.'
              ? ''
              : `<rect x="${ox + x * k}" y="${oy + y * k}" width="${k}" height="${k}" fill="${colors[ch]}"/>`
          )
        )
        .join('')
    const body = [
      '....HHbbbb....',
      '..bHHbbbbbbb..',
      '.bHbbbbbbbbbb.',
      '.bbbKwbbbKwbb.',
      'bbbbKKbbbKKbbb',
      'bbbpbbbmbbbpbb',
      'bbbbbbbbbbbbbs',
      '.bbbbbbbbbbbs.',
      '..sssssssss...'
    ]
    const hats = {
      sword: ['....rr..', '...rr...', '..mmmm..', '.mmmmmm.', '.MMMMMM.'],
      mage: ['.......n', '......n.', '....nn..', '...nnn..', '..yyyyy.', '.nnnnnnn'],
      archer: ['......w.', '.....w..', '..eeee..', '.eeeeee.', 'EEEEEEEE'],
      cleric: ['...yy...', '..WWWW..', '..WyyW..', '.WWWWWW.', '.yyyyyy.']
    }
    const slime = (x, y, job, base, hi, shade) =>
      pixels(body, { b: base, H: hi, s: shade, K: '#1a1626', w: '#ffffff', p: '#ff8f9a', m: '#5a1c36' }, x, y, 5) +
      pixels(
        hats[job],
        {
          r: '#ec5b50',
          m: '#c7ccd6',
          M: '#7d8698',
          n: '#3f509a',
          y: '#f2c84a',
          e: '#4f8f52',
          E: '#356a45',
          w: '#ffffff',
          W: '#f3f0ea'
        },
        x + 15,
        y - hats[job].length * 5 + 5,
        5
      )
    return `<div class="game-preview mamono-jinkei" aria-hidden="true">
      <svg class="mamono-art" viewBox="0 0 220 260" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="mamono-sky" cx="50%" cy="38%" r="70%"><stop stop-color="#a9cf72"/><stop offset="1" stop-color="#4f7a3c"/></radialGradient></defs>
        <rect width="320" height="260" fill="url(#mamono-sky)"/>
        <g fill="#628d45">${[18, 62, 150, 196, 34, 178, 120].map((x, i) => `<rect x="${x}" y="${30 + ((i * 53) % 190)}" width="4" height="8"/><rect x="${x + 5}" y="${33 + ((i * 53) % 190)}" width="4" height="5"/>`).join('')}</g>
        <ellipse cx="110" cy="150" rx="78" ry="40" fill="#fff3b8" opacity=".22" shape-rendering="geometricPrecision"/>
        <ellipse cx="110" cy="150" rx="78" ry="40" fill="none" stroke="#f2c84a" stroke-width="3" stroke-dasharray="8 6" shape-rendering="geometricPrecision"/>
        <path d="M110 108 L46 150 L110 192 L174 150 Z" fill="none" stroke="#fff3b8" stroke-width="2" opacity=".7" shape-rendering="geometricPrecision"/>
        ${slime(75, 74, 'cleric', '#f2c84a', '#fff3b8', '#cf8e2e')}
        ${slime(11, 116, 'mage', '#4f8fe8', '#a6dcff', '#3858b8')}
        ${slime(139, 116, 'archer', '#6cc95a', '#d4f59a', '#3a9455')}
        ${slime(75, 158, 'sword', '#ec5b50', '#ffb59a', '#b8344a')}
        <text x="110" y="246" text-anchor="middle" font-size="15" font-weight="800" fill="#fff3b8" stroke="#2e1820" stroke-width="3" paint-order="stroke" shape-rendering="geometricPrecision">四方陣！</text>
      </svg>
    </div>`
  }
  if (art === 'lane-battle') {
    const poop = (
      x,
      y,
      k,
      body,
      smile
    ) => `<g transform="translate(${x} ${y}) scale(${k})" stroke="#3b2412" stroke-width="2.5">
          <path d="M0-74c-4 8-14 10-14 18 0 4 2 6 4 7-14 2-24 10-24 20 0 4 1 7 4 9-17 3-30 11-30 22 0 9 12 16 60 16s60-7 60-16c0-11-13-19-30-22 3-2 4-5 4-9 0-10-10-18-24-20 2-1 4-3 4-7 0-9-10-12-14-18Z" fill="${body}"/>
          <circle cx="-11" cy="-30" r="7" fill="#fff"/><circle cx="11" cy="-30" r="7" fill="#fff"/>
          <circle cx="-9" cy="-29" r="3" fill="#2a170a" stroke="none"/><circle cx="13" cy="-29" r="3" fill="#2a170a" stroke="none"/>
          <path d="M-9-14q9 ${smile} 18 0" fill="none"/>
        </g>`
    return `<div class="game-preview lane-battle" aria-hidden="true">
      <svg class="poop-art" viewBox="0 0 220 260" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0h220v170H0z" fill="#9fd3d8"/>
        <path d="M0 40h220M0 80h220M0 120h220M0 160h220M40 0v170M80 0v170M120 0v170M160 0v170M200 0v170" stroke="#fff" stroke-opacity=".5"/>
        <path d="M0 170h220v90H0z" fill="#d9cfbd"/>
        <path d="M0 196Q110 178 220 196v40Q110 220 0 240z" fill="#fbf8ee"/>
        <g fill="#9ccf5a" opacity=".55"><circle cx="18" cy="170" r="20"/><circle cx="36" cy="152" r="14"/></g>
        ${poop(44, 226, 0.52, '#7a4722', 9)}
        ${poop(96, 218, 0.4, '#8a5229', 9)}
        ${poop(150, 220, 0.42, '#e9f5fb', -6)}
        <g fill="#fff" stroke="#9fb6c2" stroke-width="2"><rect x="192" y="118" width="26" height="52" rx="5"/><path d="M178 162h40q0 24-16 30l4 14h-22l4-14q-10-8-10-30z"/></g>
      </svg>
    </div>`
  }
  if (art === 'hoshi-no-hamham') {
    // hamham-card:begin  Generated by `node scripts/hoshi-no-hamham-card.mjs --write` from the game's art; do not edit by hand.
    const hamhamCard =
      'data:image/png;base64,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'
    // hamham-card:end
    return `<div class="game-preview hoshi-no-hamham" aria-hidden="true">
      <img class="hamham-art" src="${hamhamCard}" alt="" width="320" height="260" />
    </div>`
  }
  const units = ['mage', 'soldier', 'goblin']
  return `<div class="game-preview ${escape(art)}" aria-hidden="true">
    <div class="preview-board"></div>
    ${units.map((unit, index) => `<img src="${artRoot}${unit}/portrait.png" alt="" class="preview-unit preview-unit-${index}" width="112" height="124" loading="lazy" decoding="async" />`).join('')}
  </div>`
}

const container = document.querySelector('#samples')
container.innerHTML = samples
  .map(
    (sample) => `<article class="game-feature" aria-labelledby="${escape(sample.id)}-title">
  <a class="play-button" href="${escape(sample.href)}" aria-label="ゲームをプレイ: ${escape(sample.title)}">
    ${sample.art === 'tower-defense' ? battlefield() : gamePreview(sample.art)}
    <div class="card-label"><h2 id="${escape(sample.id)}-title">${escape(sample.title)}</h2><span class="play-icon" aria-hidden="true">▶</span></div>
  </a>
</article>`
  )
  .join('')
