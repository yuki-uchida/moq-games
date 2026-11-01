# 燈の境界 / Ember Grid

Independent, local, single-player tactical example: three lantern wardens cross three frontiers to disperse the ash pack. No network or SDK initialization is required. Open `/moq-games/examples/games/ember-grid/` after `npm run dev`. The root Vite build includes this separate HTML entry; the gallery is managed separately.

## Expedition

- **峡谷の燈**: a narrow crossing, three enemies and defensive groves.
- **風抜けの水路**: offset barriers and two approaches, four enemies.
- **灰の環城**: an open central route with flanking cover, five enemies including a ranged ash scout.

Each mission is independently selectable through ⚑. Victory opens a chapter-clear report and offers the next mission; the third victory completes the expedition. Standard formation moves three squares; guard formation gains four maximum HP per ally but moves only two squares. Both formations retain the sword, bow and mage roles.

Select an ally, then a glowing tile to move; select an outlined enemy to attack. Red squares show where the selected ally could strike after any legal move (or from its current square once it has moved). Hovering, focusing or selecting an enemy without an ally selected shows that enemy's movement (muted blue) and strike range (red). Each unit moves once and attacks once per turn. Attacking, waiting or healing ends its action. A unit that has moved, has no enemy in range and cannot usefully heal (full HP or no potions) also counts as finished. Once every living ally is finished, the enemy turn begins automatically after the last action's presentation; End Turn remains available to pass earlier. Range uses Manhattan distance (including through rocks); there are no counterattacks. Groves reduce incoming damage by two, to a minimum of one. Units may walk through squares held by their own side but must stop on an empty square; rocks and opposing units block movement. Enemies follow the same rule, crossing each other but not allies. Walk animations follow the same path.

Bows deal +3 against wolves, swords +1 against goblins. Shield-marked enemies reduce physical damage by two; magic bypasses their armor. Attack previews include terrain, armor and matchup effects. The two shared recovery potions each restore up to eight HP and consume that unit's action. Healing too early wastes supplies; healing instead of attacking can expose the rest of the team.

Defeat all enemies to win; lose all allies to lose. There is no turn limit. Replay clears the current encounter, including a pending enemy sequence. Help is available through ?. All controls support keyboard focus and Enter/Space. Mission selection also provides brief tactical hints. Human completion time has not been measured.

## View

The 7×7 field is drawn as an oblique 2.5D board: the DOM grid of tile buttons is rotated −45° and squashed (`--tilt` 0.6, 0.78 on narrow portrait screens so tiles stay tappable). Each tile's `.stand` layer applies the exact inverse transform, so unit sprites, HP tags and terrain props stand upright as billboards. Tiles carry `z-index` 2·depth+1 (far corner `(7,1)` first, near corner `(1,7)` last); walking actors live inside the board and take the depth of each step's nearer end, so nearer trees, rocks and units overlap them correctly. Clicks and keyboard focus remain on the projected tile buttons; overlays never take pointer input. Sprites face the projected screen direction of each step or attack.

Terrain and atmosphere are procedural CSS/SVG only: a turbulence-noise ground texture, one lantern light map sliced across tiles, bevelled tile seams, an earth slab with lit/shaded faces, conifer groves and faceted rocks with ember cracks and contact shadows, and drifting embers (disabled with reduced motion). No image asset is added.

## Growth and carry-over

Allies start at Lv 1 and gain EXP whenever their action lands: 10 per hit, plus a defeat bonus of 20, both scaled by the level gap (hit `max(1, 10 + 2·gap)`, defeat bonus `max(5, 20 + 5·gap)`, gap = enemy level − ally level) and 10 per recovery potion. Enemies are Lv 1–2 in the first mission, Lv 3–4 in the second and Lv 5–6 in the third, so later fights pay more. Every 100 EXP is a level up: HP (max and current), attack and defense each rise by one with a per-role chance (sword 80/45/45 %, bow 60/55/25 %, magic 50/65/20 %); if nothing rises, the role’s best-growth stat rises instead. Defense lowers all incoming damage (minimum one). Allies gain nothing while defending and enemies never gain EXP. Rolls use an injectable random source; append `?seed=N` to reproduce them.

After each action the acting ally’s EXP gauge fills; a level up follows with a window in which each raised stat lights with +1 in turn (synthesized Web Audio chime when sound is enabled, no new asset). Both overlays briefly hold input and never intercept pointer events.

Victory shows a chapter report: turns, defeats, survivors, remaining potions and, for each ally, level (▲ gained), EXP, EXP earned, HP/attack/defense and defeats. The MVP has the most defeats, then the most damage dealt.

Level, EXP and stats carry into the next mission; HP is fully restored and potions reset to two. Fallen allies return with whatever they had earned. Each mission starts from a recorded party:

- Mission 1 always starts from the fresh Lv 1 party.
- Advancing from a victory records the grown party as the next mission’s start.
- ↻ replay and ⚑ selection start the mission from its record, discarding EXP earned in the abandoned attempt; a mission not yet reached starts from the fresh Lv 1 party. The selection list shows each start level.
- Completing the third mission and choosing “最初から遠征” clears all records for a new expedition. Records are kept for the page session only.

Later missions add one HP to every enemy, which carried growth offsets; the fresh Lv 1 party can still clear every mission directly.

## Assets and sound

Unmodified first complete 128×112 cells of the already distributed Leaf Squire, Forest Archer, Star Mage, Mischief Goblin and Dusk Wolf textures are referenced directly from `public/tower-defense-art/`. Resting portraits retain these complete cells. Before battle input is enabled, a compact progress overlay prepares all five roles’ eight-direction idle/walk/attack manifests, unique decoded textures and six action sounds. Four animation workers bound transfers and decoding; shared textures are fetched once and retained as decoded blob-backed images across mission changes and replay. Failed/15-second timed-out requests leave battle input disabled and offer retry; successful assets are retained so retry fetches only failures. This moves approximately 16.3 MB of existing art plus action sounds ahead of the first action, including on slow connections, rather than interrupting a move at a new direction. Music is on by default. No new public assets are added.

Attack presentation keeps the original portrait visible until every required clip is ready. Each sheet switch sets its first frame coordinates before the next animation frame, preventing the previous walk sheet’s out-of-bounds coordinates from briefly hiding a soldier, goblin or wolf.

Movement and combat reuse the existing eight-direction idle/walk/attack JSON manifests and textures without changing asset bytes. The presentation follows manifest frame durations and hit/release events; logical combat rules remain synchronous and unchanged. Walks follow four-neighbour legal paths (220 ms per tile), attacks keep their recorded timing, and arrows/spells travel for 240 ms after release before the target reacts. Whole-cell recoil, rising HP-loss numbers and a 550 ms death fade preserve anatomy. Reduced-motion mode shortens presentation and reactions. Restart/mission selection cancels an in-flight presentation; temporary overlays never intercept input. No original is overwritten or copied into a new public asset scope. See the repository [asset rights and provenance](../../../ASSETS.md) and [license](../../../LICENSE). Local-only originals and candidates remain untouched.

Sound is on by default (♫); because of browser autoplay policy, music starts at the first pointer or key gesture. Turning ♫ off is remembered in `localStorage` (`ember-grid:sound`) across reloads. The existing owner-approved `tower-defense-music/monster-assault.mp3` loops at 14% volume. Existing `tower-defense-sfx/{soldier,archer,mage,goblin,wolf}_attack.wav` recordings accompany combat at the existing hit/release event; `healer_attack.wav` provides quiet movement/recovery feedback. Voices are bounded to four. Music stops at victory/defeat and resumes only during an active battle. Hidden tabs keep playing: battle presentation completes on a time basis while hidden (no `requestAnimationFrame`/Web Animations dependency, waits resolve immediately), so enemy turns keep advancing, and music/voices continue so a backgrounded battle stays audible. Muting stops all voices. No generation, transcoding or new sound publication occurs. See [music provenance](../../../public/tower-defense-music/README.md) and [WAV provenance](../../../public/tower-defense-sfx/README.md). Subjective listening quality is separate from browser playback/decoding checks.

## Verification

Run from the repository root:

```sh
npm run typecheck
npx tsc --noEmit -p examples/games/ember-grid/tsconfig.json
npm run lint
npx prettier --check examples/games/ember-grid
npx vitest run examples/games/ember-grid/tests/*.test.ts --maxWorkers=1
npm run build
npx playwright test --config examples/games/ember-grid/playwright.config.ts
# With the development server running:
node examples/games/ember-grid/background-check.mjs
```

The Playwright config starts its own server (default port 5187) and does not reuse an existing one. Set `E2E_PORT` when that port is busy, or `E2E_REUSE_SERVER=1` to test an already running dev server.

Playwright starts only its own Vite server on 127.0.0.1:5187 and defaults to installed headless Chrome. Set `PLAYWRIGHT_CHANNEL=chromium` for a Playwright-managed browser. Tests cover desktop, portrait and landscape mobile movement, attack/enemy range display, ally pass-through, automatic turn end, wait, enemy AI, defeat, replay and overflow. Desktop and portrait mobile additionally play all three missions to victory with healing and enabled BGM/SFX, advance missions, and replay. Rule tests verify both formations can complete every mission, EXP amounts, seeded growth rolls, MVP choice and carry-over. A seeded expedition test checks the chapter report against the Node mirror, captures a level-up window, advances with carried levels and verifies mission records on replay. Additional presentation tests record native-size desktop/mobile video and verify arrow flight before impact, default-on music from the first gesture, mute persistence, autoplay rejection/retry, silent reload and browser decoding/nonzero waveforms for every reused sound. Visibility tests synthesize a hidden document with frozen `requestAnimationFrame`/Web Animations and verify player and enemy turns still complete and music keeps playing; they do not prove OS background lifecycle behavior. Browser audio tests do not establish subjective listening quality.

Screenshots, including `ember-range-*.png` and `ember-enemy-range-1280.png`, are written to ignored `test-results/ember-*.png`.

Background callback verification additionally skips one minute of callbacks during an enemy sequence, then confirms return to the next ally turn, and restarts during another pending sequence to verify cancellation. The turn-based game does not accrue elapsed-time turns: only the already requested finite enemy sequence may finish. Rendering can wait for browser/OS resume; the generation token prevents an old encounter from changing a restarted mission.
