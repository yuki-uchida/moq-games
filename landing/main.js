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
