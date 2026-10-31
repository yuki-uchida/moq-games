# 燈の境界 / Ember Grid

Independent, local, single-player tactical example: three lantern wardens cross three frontiers to disperse the ash pack. No network or SDK initialization is required. Open `/moq-games/examples/games/ember-grid/` after `npm run dev`. The root Vite build includes this separate HTML entry; the gallery is managed separately.

## Expedition

- **峡谷の燈**: a narrow crossing, three enemies and defensive groves.
- **風抜けの水路**: offset barriers and two approaches, four enemies.
- **灰の環城**: an open central route with flanking cover, five enemies including a ranged ash scout.

Each mission is independently selectable through ⚑. Victory offers the next mission, and the third victory completes the expedition. Allies and supplies fully reset between missions. Standard formation moves three squares; guard formation gains four maximum HP per ally but moves only two squares. Both formations retain the sword, bow and mage roles.

Select an ally, then a highlighted diamond to move; select an outlined enemy to attack. Each unit moves once and attacks once per turn. Attacking ends its action. Wait ends one unit's action; End Turn releases the whole side. Range uses Manhattan distance (including through rocks); there are no counterattacks. Groves reduce incoming damage by two, to a minimum of one. Rocks and occupied squares block movement.

Bows deal +3 against wolves, swords +1 against goblins. Shield-marked enemies reduce physical damage by two; magic bypasses their armor. Attack previews include terrain, armor and matchup effects. The two shared recovery potions each restore up to eight HP and consume that unit's action. Healing too early wastes supplies; healing instead of attacking can expose the rest of the team.

Defeat all enemies to win; lose all allies to lose. There is no turn limit. Replay clears the current encounter, including a pending enemy sequence. Help is available through ?. All controls support keyboard focus and Enter/Space. Mission selection also provides brief tactical hints. Human completion time has not been measured.

## Assets and sound

Unmodified first complete 128×112 cells of the already distributed Leaf Squire, Forest Archer, Star Mage, Mischief Goblin and Dusk Wolf textures are referenced directly from `public/tower-defense-art/`. These are static portraits, not altered animation. No original is overwritten or copied into a new public asset scope. See the repository [asset rights and provenance](../../../ASSETS.md) and [license](../../../LICENSE). Local-only originals and candidates remain untouched.

Sound is off until the player explicitly enables ♫. The existing owner-approved `tower-defense-music/monster-assault.mp3` loops at 14% volume. Existing `tower-defense-sfx/{soldier,archer,mage,goblin,wolf}_attack.wav` recordings accompany combat; `healer_attack.wav` provides quiet movement/recovery feedback. Voices are bounded to four. Music stops at victory/defeat, pauses while hidden, and resumes only during an active battle. Muting stops all voices. No generation, transcoding or new sound publication occurs. See [music provenance](../../../public/tower-defense-music/README.md) and [WAV provenance](../../../public/tower-defense-sfx/README.md). Subjective listening quality is separate from browser playback/decoding checks.

## Verification

Run from the repository root:

```sh
npm run typecheck
npx tsc --noEmit -p examples/games/ember-grid/tsconfig.json
npm run lint
npx prettier --check examples/games/ember-grid
npx vitest run examples/games/ember-grid/tests/game.test.ts --maxWorkers=1
npm run build
npx playwright test --config examples/games/ember-grid/playwright.config.ts
```

Playwright starts only its own Vite server on 127.0.0.1:5186 and defaults to installed headless Chrome. Set `PLAYWRIGHT_CHANNEL=chromium` for a Playwright-managed browser. Tests cover desktop, portrait and landscape mobile movement, wait, enemy AI, defeat, replay and overflow. Desktop and portrait mobile additionally play all three missions to victory with healing and enabled BGM/SFX, advance missions, and replay. Rule tests verify both formations can complete every mission. Screenshots are written to ignored `test-results/ember-*.png`.
