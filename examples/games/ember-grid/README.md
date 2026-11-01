# 燈の境界 / Ember Grid

Independent, local, single-player tactical example: three lantern wardens cross three frontiers to disperse the ash pack. No network or SDK initialization is required. Open `/moq-games/examples/games/ember-grid/` after `npm run dev`. The root Vite build includes this separate HTML entry; the gallery is managed separately.

## Expedition

- **峡谷の燈**: a narrow crossing, three enemies and defensive groves.
- **風抜けの水路**: offset barriers and two approaches, four enemies.
- **灰の環城**: an open central route with flanking cover, five enemies including a ranged ash scout.

Each mission is independently selectable through ⚑. Victory offers the next mission, and the third victory completes the expedition. Allies and supplies fully reset between missions. Standard formation moves three squares; guard formation gains four maximum HP per ally but moves only two squares. Both formations retain the sword, bow and mage roles.

Select an ally, then a highlighted diamond to move; select an outlined enemy to attack. Red squares show where the selected ally could strike after any legal move (or from its current square once it has moved). Hovering, focusing or selecting an enemy without an ally selected shows that enemy's movement (muted blue) and strike range (red). Each unit moves once and attacks once per turn. Attacking, waiting or healing ends its action. A unit that has moved, has no enemy in range and cannot usefully heal (full HP or no potions) also counts as finished. Once every living ally is finished, the enemy turn begins automatically after the last action's presentation; End Turn remains available to pass earlier. Range uses Manhattan distance (including through rocks); there are no counterattacks. Groves reduce incoming damage by two, to a minimum of one. Units may walk through squares held by their own side but must stop on an empty square; rocks and opposing units block movement. Enemies follow the same rule, crossing each other but not allies. Walk animations follow the same path.

Bows deal +3 against wolves, swords +1 against goblins. Shield-marked enemies reduce physical damage by two; magic bypasses their armor. Attack previews include terrain, armor and matchup effects. The two shared recovery potions each restore up to eight HP and consume that unit's action. Healing too early wastes supplies; healing instead of attacking can expose the rest of the team.

Defeat all enemies to win; lose all allies to lose. There is no turn limit. Replay clears the current encounter, including a pending enemy sequence. Help is available through ?. All controls support keyboard focus and Enter/Space. Mission selection also provides brief tactical hints. Human completion time has not been measured.

## Assets and sound

Unmodified first complete 128×112 cells of the already distributed Leaf Squire, Forest Archer, Star Mage, Mischief Goblin and Dusk Wolf textures are referenced directly from `public/tower-defense-art/`. Resting portraits retain these complete cells. Before battle input is enabled, a compact progress overlay prepares all five roles’ eight-direction idle/walk/attack manifests, unique decoded textures and six action sounds. Four animation workers bound transfers and decoding; shared textures are fetched once and retained as decoded blob-backed images across mission changes and replay. Failed/15-second timed-out requests leave battle input disabled and offer retry; successful assets are retained so retry fetches only failures. This moves approximately 16.3 MB of existing art plus action sounds ahead of the first action, including on slow connections, rather than interrupting a move at a new direction. Music remains opt-in. No new public assets are added.

Attack presentation keeps the original portrait visible until every required clip is ready. Each sheet switch sets its first frame coordinates before the next animation frame, preventing the previous walk sheet’s out-of-bounds coordinates from briefly hiding a soldier, goblin or wolf.

Movement and combat reuse the existing eight-direction idle/walk/attack JSON manifests and textures without changing asset bytes. The presentation follows manifest frame durations and hit/release events; logical combat rules remain synchronous and unchanged. Walks follow four-neighbour legal paths (220 ms per tile), attacks keep their recorded timing, and arrows/spells travel for 240 ms after release before the target reacts. Whole-cell recoil, rising HP-loss numbers and a 550 ms death fade preserve anatomy. Reduced-motion mode shortens presentation and reactions. Restart/mission selection cancels an in-flight presentation; temporary overlays never intercept input. No original is overwritten or copied into a new public asset scope. See the repository [asset rights and provenance](../../../ASSETS.md) and [license](../../../LICENSE). Local-only originals and candidates remain untouched.

Sound is off until the player explicitly enables ♫. The existing owner-approved `tower-defense-music/monster-assault.mp3` loops at 14% volume. Existing `tower-defense-sfx/{soldier,archer,mage,goblin,wolf}_attack.wav` recordings accompany combat at the existing hit/release event; `healer_attack.wav` provides quiet movement/recovery feedback. Voices are bounded to four. Music stops at victory/defeat, stops all voices while hidden, and resumes only during an active battle. Muting stops all voices. No generation, transcoding or new sound publication occurs. See [music provenance](../../../public/tower-defense-music/README.md) and [WAV provenance](../../../public/tower-defense-sfx/README.md). Subjective listening quality is separate from browser playback/decoding checks.

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

Playwright starts only its own Vite server on 127.0.0.1:5187 and defaults to installed headless Chrome. Set `PLAYWRIGHT_CHANNEL=chromium` for a Playwright-managed browser. Tests cover desktop, portrait and landscape mobile movement, attack/enemy range display, ally pass-through, automatic turn end, wait, enemy AI, defeat, replay and overflow. Desktop and portrait mobile additionally play all three missions to victory with healing and enabled BGM/SFX, advance missions, and replay. Rule tests verify both formations can complete every mission. Additional presentation tests record native-size desktop/mobile video and verify arrow flight before impact, mute, autoplay rejection/retry, silent reload and browser decoding/nonzero waveforms for every reused sound. Visibility-handler tests synthesize the visibility event; they do not prove OS background lifecycle behavior. Browser audio tests do not establish subjective listening quality.

Screenshots, including `ember-range-*.png` and `ember-enemy-range-1280.png`, are written to ignored `test-results/ember-*.png`.

Background callback verification additionally skips one minute of callbacks during an enemy sequence, then confirms return to the next ally turn, and restarts during another pending sequence to verify cancellation. The turn-based game does not accrue elapsed-time turns: only the already requested finite enemy sequence may finish. Rendering can wait for browser/OS resume; the generation token prevents an old encounter from changing a restarted mission.
