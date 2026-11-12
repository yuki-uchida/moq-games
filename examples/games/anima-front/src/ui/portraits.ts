/**
 * The radio cast's portraits (viewBox 96×96, framed by CSS): ゲンブ司令, an old Aldabra tortoise with a domed
 * shell, a hooked beak, deep wrinkles, wise heavy-lidded eyes and an officer's cap; and ルリ, a sky-blue
 * budgerigar operator with a white face mask, barred crown, violet cheek patches, throat spots and a headset.
 */

export function genbuSvg(): string {
  // skin and shell tones of an old giant tortoise
  const skin = '#8f8a78'
  const skinDark = '#6c6758'
  const line = '#3f3b31'
  const scutes = [
    'M14 70 L24 60 L36 62 L38 74 L28 82 L16 80 Z',
    'M82 70 L72 60 L60 62 L58 74 L68 82 L80 80 Z',
    'M6 86 L14 80 L26 84 L24 96 L6 96 Z',
    'M90 86 L82 80 L70 84 L72 96 L90 96 Z'
  ]
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<radialGradient id="gb-shell" cx="50%" cy="20%" r="80%"><stop offset="0" stop-color="#7a6650"/><stop offset="0.6" stop-color="#4f4132"/><stop offset="1" stop-color="#2f271e"/></radialGradient>
<radialGradient id="gb-head" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#aaa592"/><stop offset="0.7" stop-color="${skin}"/><stop offset="1" stop-color="${skinDark}"/></radialGradient>
<linearGradient id="gb-neck" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${skinDark}"/><stop offset="0.5" stop-color="${skin}"/><stop offset="1" stop-color="${skinDark}"/></linearGradient>
</defs>
<path d="M2 96 Q2 56 48 50 Q94 56 94 96 Z" fill="url(#gb-shell)"/>
<g fill="none" stroke="#2a2219" stroke-width="1.6" stroke-linejoin="round">${scutes.map((d) => `<path d="${d}"/>`).join('')}</g>
<g fill="#8a7458" opacity="0.35">${scutes.map((d) => `<path d="${d}" transform="translate(1.5 -1.5) scale(0.96)"/>`).join('')}</g>
<path d="M2 96 Q2 56 48 50 Q94 56 94 96" fill="none" stroke="#a08868" stroke-width="1.4" opacity="0.6"/>
<path d="M22 96 L26 80 Q48 72 70 80 L74 96 Z" fill="#253055"/>
<path d="M26 80 Q48 72 70 80 L64 86 Q48 80 32 86 Z" fill="#33416e"/>
<path d="M32 86 L40 96 M64 86 L56 96" stroke="#ff9a3c" stroke-width="2"/>
<rect x="58" y="86" width="9" height="4" rx="1" fill="#e5484d"/><rect x="58" y="90.5" width="9" height="4" rx="1" fill="#f2b33d"/>
<circle cx="34" cy="90" r="2.6" fill="#ffd76e" stroke="#9a6a1c" stroke-width="0.8"/>
<path d="M33 82 Q31 68 35 58 L61 58 Q65 68 63 82 Q48 87 33 82 Z" fill="url(#gb-neck)"/>
<g fill="none" stroke="${line}" stroke-width="1" stroke-linecap="round" opacity="0.55">
<path d="M35 64 Q41 67 46 65 M50 65 Q55 67 61 64"/><path d="M34 70 Q48 74 62 70"/><path d="M33.5 76 Q40 79 46 77.5 M50 77.5 Q56 79 62.5 76"/>
<path d="M41 61 Q44 63 47 61.5"/><path d="M50 61.5 Q53 63 56 61"/>
</g>
<path d="M28 42 Q28 26 48 25 Q68 26 68 42 Q68 52 61 58 Q55 63 48 63 Q41 63 35 58 Q28 52 28 42 Z" fill="url(#gb-head)"/>
<g fill="${skinDark}" opacity="0.55">
<path d="M33 38 L37 35 L41 37 L39 41 L34 41 Z"/><path d="M63 38 L59 35 L55 37 L57 41 L62 41 Z"/>
<path d="M44 33 L48 31 L52 33 L50 36 L46 36 Z"/>
</g>
<path d="M32.5 42.5 Q38.5 39.6 45 38.6" fill="none" stroke="${line}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M51 38.6 Q57.5 39.6 63.5 42.5" fill="none" stroke="${line}" stroke-width="2.2" stroke-linecap="round"/>
<ellipse cx="39.5" cy="45" rx="4.6" ry="3.6" fill="#f3ead2"/><ellipse cx="56.5" cy="45" rx="4.6" ry="3.6" fill="#f3ead2"/>
<circle cx="40" cy="45.6" r="2.7" fill="#3a2414"/><circle cx="56" cy="45.6" r="2.7" fill="#3a2414"/>
<circle cx="40" cy="45.6" r="1.5" fill="#0d0907"/><circle cx="56" cy="45.6" r="1.5" fill="#0d0907"/>
<circle cx="41" cy="44.6" r="0.9" fill="#fff"/><circle cx="57" cy="44.6" r="0.9" fill="#fff"/>
<path d="M34.4 46.6 Q38.5 42.2 44.8 44.6 L44.8 41.2 Q39.5 38.8 34.4 42.4 Z" fill="${skin}"/>
<path d="M51.2 44.6 Q57.5 42.2 61.6 46.6 L61.6 42.4 Q56.5 38.8 51.2 41.2 Z" fill="${skin}"/>
<path d="M34.4 46.6 Q38.5 42.2 44.8 44.6" fill="none" stroke="${line}" stroke-width="1.4" stroke-linecap="round"/>
<path d="M51.2 44.6 Q57.5 42.2 61.6 46.6" fill="none" stroke="${line}" stroke-width="1.4" stroke-linecap="round"/>
<g fill="none" stroke="${line}" stroke-width="0.9" stroke-linecap="round" opacity="0.7">
<path d="M35 49.5 Q39.5 51.5 44 49.5"/><path d="M52 49.5 Q56.5 51.5 61 49.5"/>
<path d="M31 45 L29.5 43.5 M31 47 L29 47 M31.2 49 L29.6 50.4"/><path d="M65 45 L66.5 43.5 M65 47 L67 47 M64.8 49 L66.4 50.4"/>
<path d="M33 53 Q35 56 38 57"/><path d="M63 53 Q61 56 58 57"/>
</g>
<path d="M41 52.5 Q48 50 55 52.5 Q55.5 57.5 51.5 60.5 L48 63.5 L44.5 60.5 Q40.5 57.5 41 52.5 Z" fill="#b9b19b"/>
<ellipse cx="45.6" cy="53.4" rx="0.9" ry="0.7" fill="${line}"/><ellipse cx="50.4" cy="53.4" rx="0.9" ry="0.7" fill="${line}"/>
<path d="M40.4 56 Q41.8 58.6 44.4 58.8 Q48 59.8 51.6 58.8 Q54.2 58.6 55.6 56" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M46 59.6 L48 63.6 L50 59.6" fill="#8f8670" stroke="${line}" stroke-width="0.9" stroke-linejoin="round"/>
<path d="M23 33 Q25 15 48 13 Q71 15 73 33 L71 35 L25 35 Z" fill="#1f2a4a"/>
<path d="M30 20 Q48 12 66 20" fill="none" stroke="#33416e" stroke-width="3" opacity="0.8"/>
<rect x="24" y="31" width="48" height="6" rx="2.5" fill="#2c3a63"/>
<path d="M24 31 L72 31" stroke="#ff9a3c" stroke-width="1.2"/>
<path d="M25 37 Q48 45 71 37 L69 35 Q48 41 27 35 Z" fill="#111830"/>
<circle cx="48" cy="25" r="5.4" fill="#1a2240" stroke="#ffb25c" stroke-width="1.4"/>
<circle cx="48" cy="26.2" r="2" fill="#ffd9a8"/><circle cx="45.6" cy="23.4" r="0.95" fill="#ffd9a8"/><circle cx="48" cy="22.4" r="0.95" fill="#ffd9a8"/><circle cx="50.4" cy="23.4" r="0.95" fill="#ffd9a8"/>
</svg>`
}

export function ruriSvg(): string {
  const bars = [0, 1, 2, 3]
    .map((i) => {
      const y = 21.5 + i * 3.1
      const w = 11 + i * 2.2
      return `<path d="M${48 - w} ${y + 1.6} Q${48 - w / 2} ${y - 1} 48 ${y + 0.8} Q${48 + w / 2} ${y - 1} ${48 + w} ${y + 1.6}"/>`
    })
    .join('')
  const spots = [
    [37, 66],
    [43, 68.5],
    [53, 68.5],
    [59, 66]
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="#16192a"/>`)
    .join('')
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<radialGradient id="ru-body" cx="45%" cy="30%" r="75%"><stop offset="0" stop-color="#8fdcf6"/><stop offset="0.65" stop-color="#3fb0e0"/><stop offset="1" stop-color="#2386b8"/></radialGradient>
<radialGradient id="ru-face" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6eef6"/></radialGradient>
</defs>
<path d="M10 96 Q12 70 48 66 Q84 70 86 96 Z" fill="#2c3a63"/>
<path d="M30 74 Q48 68 66 74 L60 84 Q48 79 36 84 Z" fill="#3a4a7c"/>
<path d="M38 74 L48 86 L58 74" fill="#ff9a3c"/><circle cx="48" cy="80" r="2.6" fill="#ffe2b8"/>
<ellipse cx="48" cy="47" rx="26" ry="27" fill="url(#ru-body)"/>
<path d="M27 34 Q30 20 48 20 Q66 20 69 34 Z" fill="#dff1fa"/>
<g fill="none" stroke="#1f2638" stroke-width="1.25" stroke-linecap="round" opacity="0.8">${bars}</g>
<path d="M27 50 Q26 34 48 32 Q70 34 69 50 Q68 62 59 69 Q48 75 37 69 Q28 62 27 50 Z" fill="url(#ru-face)"/>
<ellipse cx="29" cy="60" rx="4.2" ry="5.2" fill="#6d5bd0"/><ellipse cx="67" cy="60" rx="4.2" ry="5.2" fill="#6d5bd0"/>
${spots}
<circle cx="37.5" cy="45" r="6" fill="#fff" stroke="#d4dbe6" stroke-width="1"/><circle cx="58.5" cy="45" r="6" fill="#fff" stroke="#d4dbe6" stroke-width="1"/>
<circle cx="38" cy="45.6" r="4.3" fill="#1a1f2e"/><circle cx="58" cy="45.6" r="4.3" fill="#1a1f2e"/>
<circle cx="39.6" cy="43.6" r="1.7" fill="#fff"/><circle cx="59.6" cy="43.6" r="1.7" fill="#fff"/>
<circle cx="36.6" cy="47.6" r="0.8" fill="#fff" opacity="0.8"/><circle cx="56.6" cy="47.6" r="0.8" fill="#fff" opacity="0.8"/>
<ellipse cx="48" cy="51.4" rx="5.2" ry="2.6" fill="#7fb4e8"/>
<circle cx="45.8" cy="51.4" r="0.8" fill="#4a77a8"/><circle cx="50.2" cy="51.4" r="0.8" fill="#4a77a8"/>
<path d="M43.6 53.2 Q48 52 52.4 53.2 Q51.8 59.4 48 61.4 Q44.2 59.4 43.6 53.2 Z" fill="#e8c36a" stroke="#b08a3a" stroke-width="0.8"/>
<path d="M45.4 56.4 Q48 57.6 50.6 56.4" fill="none" stroke="#b08a3a" stroke-width="0.7"/>
<ellipse cx="31.5" cy="52" rx="3.6" ry="2" fill="#ff8fa3" opacity="0.5"/><ellipse cx="64.5" cy="52" rx="3.6" ry="2" fill="#ff8fa3" opacity="0.5"/>
<path d="M21 46 Q20 15 48 13 Q76 15 75 46" stroke="#1f2a4a" stroke-width="4" fill="none" stroke-linecap="round"/>
<rect x="15.5" y="41" width="10" height="15" rx="4.5" fill="#1f2a4a"/><rect x="70.5" y="41" width="10" height="15" rx="4.5" fill="#1f2a4a"/>
<rect x="17.5" y="44" width="3" height="9" rx="1.5" fill="#ff9a3c"/>
<path d="M20.5 55 Q22 66 34 66.5" stroke="#1f2a4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<circle cx="35.5" cy="66.5" r="3" fill="#ff9a3c"/>
</svg>`
}
