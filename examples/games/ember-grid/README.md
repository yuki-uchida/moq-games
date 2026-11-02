# デスガイヤ (Ember Grid)

Independent, local, single-player tactical example: three lantern wardens cross three frontiers to disperse the ash pack. No network or SDK initialization is required. Open `/moq-games/examples/games/ember-grid/` after `npm run dev`. The root Vite build includes this separate HTML entry; the gallery is managed separately.

## Expedition

- **峡谷の燈**: a long rock spine has a one-square central pass and longer flanks around its northern and southern ends. Near-side groves shelter the approach; a wolf and scout screen the pass, with an armored watchman behind them.
- **風抜けの水路**: staggered stone shelves split the field into winding northern and southern lanes. Central groves link the approaches; two wolves, a scout and an armored watchman threaten the far bank.
- **灰の環城**: broken walls enclose a grove-studded courtyard with a western gate and a northern breach. Wolves threaten the northern edge while a ranged scout guards the southern approach.

The title screen offers a new expedition, continue, reached chapters, settings and help. Choose **カジュアル** to restore fallen allies after victory with their growth up to their fall, or **クラシック** for permanent loss. Difficulty stays fixed for the expedition and is shown in the status and mission list. Unreached chapters are locked. Victory opens a chapter-clear report and offers the next mission. Standard formation moves three squares; guard formation gains four maximum HP per ally but moves only two squares. Both formations retain the sword, bow and mage roles.

Select an ally, then a glowing tile to move; select an outlined enemy to attack. Red squares show where the selected ally could strike after any legal move (or from its current square once it has moved). Hovering, focusing or selecting an enemy without an ally selected shows that enemy's movement (muted blue) and strike range (red). Each unit moves once and attacks once per turn. Attacking, waiting or healing ends its action. A unit that has moved, has no enemy in range and cannot usefully heal (full HP or no potions) also counts as finished. Once every living ally is finished, the enemy turn begins automatically after the last action's presentation; End Turn remains available to pass earlier. Range uses Manhattan distance (including through rocks); there are no counterattacks. Groves reduce incoming damage by two, to a minimum of one. Units may walk through squares held by their own side but must stop on an empty square; rocks and opposing units block movement. Enemies follow the same rule, crossing each other but not allies. Walk animations follow the same path.

Bows deal +3 against wolves, swords +1 against goblins. Shield-marked enemies reduce physical damage by two; magic bypasses their armor. Attack previews include terrain, armor and matchup effects. The two shared recovery potions each restore up to eight HP and consume that unit's action. Healing too early wastes supplies; healing instead of attacking can expose the rest of the team.

Defeat all enemies to win; lose all allies to lose. There is no turn limit. Replay clears the current encounter, including a pending enemy sequence. Help is available through ?. All controls support keyboard focus and Enter/Space. Mission selection also provides brief tactical hints. Human completion time has not been measured.

## View

The 10×10 field is an oblique board in three layers. A square keeps the same projection on desktop and portrait while adding room for flanks; deployments remain close enough for early contact. The floor is the DOM grid of tile buttons, rotated −45° and squashed (`--tilt` 0.6, 0.95 on narrow portrait screens so tiles stay tappable); it carries terrain texture, range tints, selection/target outlines, focus and all pointer, touch and keyboard input. Above it, one transparent three.js canvas (`src/stage.ts`, `pointer-events: none`) draws everything that stands on the field — units, groves, rocks, contact shadows, side/selection rings, arrows and spells — depth-tested in one scene, so nearer trees, rocks and units overlap correctly at every step of a walk. Its orthographic camera reproduces the CSS floor projection exactly (45° azimuth, elevation `asin(--tilt)`, one world unit per unprojected tile, re-fitted on every resize). A second projected grid above the canvas (`#marks`) holds the HP/armour/✓/damage-preview tags, so they are never covered. Units face their walking step or their target; at rest allies and enemies face each other three-quarters toward the camera. Finished units are drawn dimmed.

The floor and surrounding terrain remain procedural CSS/SVG: a turbulence-noise ground texture, mission-specific earth, aqueduct stone or ash paving, one lantern light map sliced across tiles, bevelled tile seams, an earth slab with lit/shaded faces and faint drifting embers (disabled with reduced motion). The paving and surrounding terrain are decorative and do not affect movement. Groves (flat-shaded conifers and shrubs placed toward the back of the tile), faceted canyon and aqueduct rocks, and broken castle masonry are procedural low-poly three.js meshes with shared geometry and materials, lit by a moonlit sky, a cool key from the far-left and a warm lantern light on the ally flank. All rock and masonry tiles are impassable; no image asset is added.

## Growth, carry-over and loss

Allies start at Lv 1 and gain EXP whenever their action lands: 10 per hit, plus a defeat bonus of 20, both scaled by the level gap (hit `max(1, 10 + 2·gap)`, defeat bonus `max(5, 20 + 5·gap)`, gap = enemy level − ally level) and 10 per recovery potion. Enemies are Lv 1–2 in the first mission, Lv 3–4 in the second and Lv 5–6 in the third, so later fights pay more. Every 100 EXP is a level up: HP (max and current), attack and defense each rise by one with a per-role chance (sword 80/45/45 %, bow 60/55/25 %, magic 50/65/20 %); if nothing rises, the role’s best-growth stat rises instead. Defense lowers all incoming damage (minimum one). Allies gain nothing while defending and enemies never gain EXP. Rolls use an injectable random source; append `?seed=N` to reproduce them.

After each action the acting ally’s EXP gauge fills; a level up follows with a window in which each raised stat lights with +1 in turn (synthesized Web Audio chime when sound is enabled, no new asset). The gauge alone never holds input; a level-up window briefly does. Neither intercepts pointer events.

Victory shows a chapter report: turns, defeats, survivors, remaining potions and, for each ally, level (▲ gained), EXP, EXP earned, HP/attack/defense and defeats. The MVP has the most defeats, then the most damage dealt; a surviving ally is always preferred over a fallen one.

Level, EXP and stats carry into the next mission; HP is fully restored and potions reset to two.

When an ally falls, a short farewell window shows their last words and “○○は倒れた…”. In classic mode, winning makes the loss permanent: the report marks them 離脱 and they do not deploy in the next mission. In casual mode, they return with their growth up to the fall. The start log and the ⚑ list show each mission’s deployed members (出撃) and lost ones (離脱). A single survivor can still start the next mission alone.

Each mission starts from a recorded party:

- Mission 1 always starts from the fresh Lv 1 party.
- Advancing from a victory records the grown party as the next mission’s start.
- Defeat, ↻ replay and ⚑ selection start the mission from its record, discarding EXP earned and undoing losses in the abandoned attempt (like an FE reset). Unreached missions cannot be selected. The selection list shows each start level and its members.
- If a lost ally is needed, ⚑ an earlier mission whose record still includes them; that also replaces the later records once you advance again.
- Completing the last mission and choosing “最初から遠征” clears the expedition records. The versioned `ember-grid:save:v1` local save contains difficulty, formation, checkpoints, reached and cleared chapters, best turns, and a battle snapshot. Continue restores the snapshot, including random state, or starts the furthest reached chapter from its checkpoint. The snapshot is updated during the ally phase and cleared on victory or defeat. Unavailable storage or invalid saves show a notice and do not prevent play. Starting a new expedition confirms before replacing a save.

Settings are stored under `ember-grid:settings:v1`: BGM/SFX volume, battle speed, attack confirmation, default danger zone, story scenes and reduced motion. Volume, speed and motion apply here; the confirmation, danger-zone and story preferences are exposed for the corresponding features in other branches. The ♫ quick mute remains independent and persists under `ember-grid:sound`.

Later missions add one HP to every enemy, which carried growth offsets.

## Assets and sound

Units are the existing, already published rigged glTF models of the tower-defense game — soldier, archer, mage, goblin and wolf — loaded through its model catalog, `ModelAssetCache` and `ModelUnitVisual` actor (with their material/skinning adapters, foot separation and gait correction); no model, texture or animation byte is changed and no sprite sheet is used any more. Before battle input is enabled, a compact progress overlay loads only those five roles' idle/walk/attack sources — seven GLBs plus the archer's refined walk clip, about 49 MB raw or 23.7 MB as the production build's existing gzip sidecars — and the six action sounds. Geometry and textures are shared between actors; each actor owns only its skeleton and material clones, and the walk/attack rigs are acquired and shader-compiled in the background as soon as an actor appears. Failed requests leave battle input disabled and offer retry; the cache keeps successful models, so retry fetches only failures, and mission changes and replay never refetch. Idle units breathe at half frame rate (frozen under reduced motion); presentations render at full rate. The chapter report shows each ally's idle pose rendered once from its own model. Music is on by default. No new public assets are added.

Movement and combat sample the models' own authored clips; logical combat rules remain synchronous and unchanged. Walks follow four-neighbour legal paths at 220 ms and one walk cycle per tile. Attacks play the attack clip at the tower game's recorded durations and contact times (`ATTACK_PROFILES`); arrows and spells leave the model's authored release point (bow string, staff tip) and fly for 240 ms before the target reacts. Hits flash and recoil the victim along the attack direction while a rising HP-loss number and the shared pixel contact spark appear as DOM overlays at the projected point; a defeat plays a rig-wide fall and fades out over 550 ms. Reduced-motion mode shortens presentation and reactions. Every step is timed by `pause()` rather than animation frames, and the stage samples the same time-based tracks whenever it renders, so hidden tabs still complete. Restart/mission selection cancels an in-flight presentation; overlays never intercept input. See the repository [asset rights and provenance](../../../ASSETS.md) and [license](../../../LICENSE). Local-only originals and candidates remain untouched.

Sound is on by default (♫); because of browser autoplay policy, music starts at the first pointer or key gesture. Turning ♫ off is remembered in `localStorage` (`ember-grid:sound`) across reloads. The existing owner-approved `tower-defense-music/monster-assault.mp3` loops at a 7% base volume, scaled by the BGM setting. Existing `tower-defense-sfx/{soldier,archer,mage,goblin,wolf}_attack.wav` recordings accompany combat at the existing hit/release event; `healer_attack.wav` provides quiet movement/recovery feedback. Voices are bounded to four. Music stops at victory/defeat and resumes only during an active battle. Hidden tabs keep playing: battle presentation completes on a time basis while hidden (no `requestAnimationFrame`/Web Animations dependency, waits resolve immediately), so enemy turns keep advancing, and music/voices continue so a backgrounded battle stays audible. Muting stops all voices. No generation, transcoding or new sound publication occurs. See [music provenance](../../../public/tower-defense-music/README.md) and [WAV provenance](../../../public/tower-defense-sfx/README.md). Subjective listening quality is separate from browser playback/decoding checks.

## Verification

Run from the repository root:

```sh
npm run typecheck
npx tsc --noEmit -p examples/games/ember-grid/tsconfig.json
npm run lint
npx prettier --check examples/games/ember-grid
npx vitest run examples/games/ember-grid/tests/*.test.ts --maxWorkers=1
npm run build
E2E_PORT=5281 npx playwright test --config examples/games/ember-grid/playwright.config.ts
# With the development server running:
node examples/games/ember-grid/background-check.mjs
```

The Playwright config starts its own server (default port 5187) and does not reuse an existing one. Set `E2E_PORT` when that port is busy, or `E2E_REUSE_SERVER=1` to test an already running dev server.

Playwright starts only its own Vite server on 127.0.0.1:5187 and defaults to installed headless Chrome. Set `PLAYWRIGHT_CHANNEL=chromium` for a Playwright-managed browser. Tests cover desktop, portrait and landscape mobile movement, attack/enemy range display, ally pass-through, automatic turn end, wait, enemy AI, defeat, replay and overflow. Desktop and portrait mobile additionally play all three missions to victory with healing and enabled BGM/SFX, advance missions, and replay. Rule tests verify both formations can complete every mission, EXP amounts, seeded growth rolls, MVP choice, carry-over, permanent loss on victory, loss undone by the mission record and a lone survivor starting the next mission. A loss E2E lets Rio fall in a won first mission, then checks the farewell, the 離脱 report entry, a two-ally second mission (also after ↻) and Rio’s return via ⚑ mission 1. A seeded expedition test checks the chapter report against the Node mirror, captures a level-up window, advances with carried levels and verifies mission records on replay. Preparation tests fail one model, verify retry refetches only it and that mission changes refetch nothing, and sample every role/motion/direction as a visible real mesh without transfers. Additional presentation tests record native-size desktop/mobile video and verify arrow flight before impact, default-on music from the first gesture, mute persistence, autoplay rejection/retry, silent reload and browser decoding/nonzero waveforms for every reused sound. Visibility tests synthesize a hidden document with frozen `requestAnimationFrame`/Web Animations and verify player and enemy turns still complete and music keeps playing; they do not prove OS background lifecycle behavior. Browser audio tests do not establish subjective listening quality.

Screenshots, including `ember-range-*.png`, `ember-enemy-range-1280.png`, `ember-farewell-1280.png`, `ember-lost-chapter-1280.png` and `ember-lost-missions-1280.png`, are written to ignored `test-results/ember-*.png`.

Background callback verification additionally skips one minute of callbacks during an enemy sequence, then confirms return to the next ally turn, and restarts during another pending sequence to verify cancellation. The turn-based game does not accrue elapsed-time turns: only the already requested finite enemy sequence may finish. Rendering can wait for browser/OS resume; the generation token prevents an old encounter from changing a restarted mission.
