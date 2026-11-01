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
