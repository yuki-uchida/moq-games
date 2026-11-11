# 星のハムハム — presentation design

The rules of the game (movement, biting, gimmicks, bosses, stages, story text) are finished and covered by
`tests/`. This file is the contract for everything the player **sees and hears**: art, animation, sound,
music and staging (演出). Code comments are English; all player-facing text is Japanese.

The bar is a commercial downloadable 2D action game: every object on screen is deliberate pixel art, every
action has an animation, a sound and a visual answer, and no screen appears or disappears without a transition.

## 1. Platform and layers

- Directory `examples/games/hoshi-no-hamham/`. Vite config `vite.config.hoshi-no-hamham.mjs` (dev port 5196),
  also an input of the site build. TypeScript, no framework, Canvas 2D for the world, DOM for HUD and menus.
- No image, font or audio files. Art is drawn by code into indexed rasters (`src/art/`), music and sound are
  synthesized with Web Audio from scores in code (`src/audio/`). Fonts are the system's rounded gothic stack.
- Four layers, each only talking to the one below through a small contract:

  | layer | folder                 | role                                                                                   |
  | ----- | ---------------------- | -------------------------------------------------------------------------------------- |
  | sim   | `src/game/`            | deterministic rules; emits `SimEvent`s (`events.ts`); no DOM, no randomness for looks  |
  | art   | `src/art/`             | sheets, tiles, backgrounds as indexed rasters; runs in Node; contract in `contract.ts` |
  | audio | `src/audio/`           | `GameAudio` (`api.ts`): music themes, one-shot effects, loops                          |
  | view  | `src/view/`, `src/ui/` | camera, animation, particles, staging, HUD and screens                                 |

- The sim never knows about particles, camera, shake, text popups or sound. It reports what happened
  (`SimEvent`), and the view decides how that looks and sounds. View randomness never touches the sim's `Rng`.

## 2. Units, camera, scaling

- World unit = one art pixel. `TILE = 64`. The logical view is **640×360** (10 × 5.6 tiles).
- Sharp scaling: the canvas backing store is `640k × 360k` with `k = clamp(ceil(cssWidth × dpr / 640), 1, 4)`.
  Everything is drawn through one `k×` transform with image smoothing off, so every art pixel is exactly `k×k`
  device pixels; CSS then scales the canvas down smoothly by less than 2×. Sprites are placed on whole art pixels;
  the camera may move in steps of `1/k`.
- Camera (view only): follows the hero with horizontal look-ahead toward the facing direction, a vertical dead
  zone, clamped to the map. Shake uses a trauma value (amplitude ∝ trauma², decays in ~0.4 s) and is switched off
  by `prefers-reduced-motion`. Staging may pan the camera to a target and back.
- A character is drawn with the anchor pixel of its frame on the centre-bottom of its physics box.

## 3. Art direction

**Modern pixel art**: 64×64 character cells, 3–4 values per material in clean clusters, hue-shifted ramps
(shadows lean purple/blue, highlights lean warm), light from the top-left, selective outlines (a dark of the
material, plum ink for characters), no single-pixel noise, no gradients inside sprites, no rotation or scaling of
character frames at draw time except the view's squash/stretch. Round, soft, readable silhouettes; faces carry
the emotion (big eyes with one highlight, brows, mouth, blush).

- Palette: `src/art/palette.ts`. Ramps are `[highlight, base, shade, deep, line]`. Modules may register extra
  ramps with `ramp(...)`, but a single sheet stays within about 24 colours.
- Toolkit: `src/art/raster.ts` (`Raster`, `ball`, `shadeEdges`, `outline`, `part`, `Painter`, `bar`, `bayer`).
  Characters are **pose-parametric**: one draw function takes a pose object (body bob, squash, limb phases, eye
  and mouth states, …) and every animation is a list of poses. Never copy a frame to pad an animation: every
  frame of a clip must differ from its neighbours, and loops must close without a pop.
- Characters face **right**; the view mirrors them. Feet sit on the anchor row. Characters read at a glance
  against every stage: keep a 1 px dark rim and avoid the stage's ground colours on the body.

### Cast

| id           | 名前         | look                                                                                                                                     |
| ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `hero`       | ハム彦       | pink round hamster kid, cream belly and muzzle, deep-pink inner ears, navy scarf with a gold star clasp, visible front teeth when biting |
| `princess`   | ハム姫       | white hamster, pink ears, small gold star tiara, pink ribbon collar, sparkling eyes                                                      |
| `mom`        | ママ・ハム代 | big orange hamster, white apron, hair curlers, ladle raised, furious brows                                                               |
| `king`       | 黒ハム王     | huge dark-purple hamster, crimson high-collar cape, gold spiked crown with a dark star gem, glowing yellow eyes                          |
| `walker`     | ネズミ団員   | grey rat thug, red gang bandana, eye mask                                                                                                |
| `flyer`      | 子ガラス     | small navy crow, yellow beak, red bandana, flaps                                                                                         |
| `jumper`     | カエル団員   | green frog, pale belly, red bandana, hops                                                                                                |
| `spitter`    | リス団員     | red squirrel with stuffed cheeks, spits acorns                                                                                           |
| `tough`      | モグラ隊長   | big brown mole, steel helmet, heavy claws                                                                                                |
| `crowBoss`   | カラス助     | big crow captain, eye patch, red bandana, wide wings                                                                                     |
| `weaselBoss` | いたち丞相   | long sly weasel, scholar cap, feather fan                                                                                                |
| `boarBoss`   | いのしし番長 | boar gang leader, pompadour, long tusks, leaf stalk in mouth                                                                             |
| `wolfBoss`   | おおかみ檄   | grey wolf, scar, red scarf                                                                                                               |
| `bearBoss`   | ヒョウタン熊 | huge violet bear, gourd on a rope, leaves on head                                                                                        |
| `foxBoss`    | きつね旋風   | orange fox, ninja headband, huge tail, spinning dash                                                                                     |
| `apeBoss`    | ごりら警部   | charcoal gorilla, police cap and badge                                                                                                   |
| `beeBoss`    | ハチ女王     | large queen bee, crown, fluffy collar, stinger, hovers                                                                                   |

All gang members wear the same red bandana so they read as one gang (ばくろ団).

### World themes

| theme      | stages | ground                      | backdrop                                                                         |
| ---------- | ------ | --------------------------- | -------------------------------------------------------------------------------- |
| `meadow`   | 1–2    | grass over warm soil        | day sky, drifting clouds, far mountains, rolling hills, flower bushes            |
| `night`    | 3      | teal grass, violet soil     | deep night, large moon with halo, twinkling stars, forest silhouettes, fireflies |
| `cave`     | 4      | violet cave rock            | hideout cave: rock walls, stalactites, crystals, lanterns, wooden beams          |
| `forest`   | 5–6    | dark grass, brown soil      | dense forest: trunks in depth, canopy, light shafts, falling leaves              |
| `fortress` | 7–8    | grey stone blocks           | stone hall: barred windows, chains, banners, torches                             |
| `castle`   | 9      | red brick                   | dark castle: tall windows, pillars, crimson banners, candelabra                  |
| `star`     | 10     | indigo star rock, gold trim | cosmos: nebula, starfield, planet, floating crystal islands                      |

- Terrain is autotiled from the 8 neighbours: exposed tops get a cap (grass lip, stone trim), sides a rim,
  undersides a shadow, inner tiles a calm fill with a few low-contrast details. **Diggable dirt** (`DIRT`) is a
  distinct, brighter, cracked clay in every theme so it always reads as "bite me". Platforms are wooden
  planks/stone ledges with end caps. Spikes are steel with a glint.
- Decorations (tufts, flowers, mushrooms, pebbles, vines, stalactites, chains, crystals) are placed by a position
  hash on exposed tops and undersides. They are smaller and lower-contrast than gameplay props.
- Backdrops are 3–5 parallax layers plus a sky, lighter and less saturated with distance. Nothing in a backdrop
  uses the colours or contrast of gameplay objects.

### Gimmicks must explain themselves

| prop          | idle                                     | when bitten                                                                                                        |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| tree / pine   | sways                                    | shakes, drops leaves, shows a notch; second bite: creaks, falls with easing, crashes into a **visible 4-tile log** |
| dirt          | cracked clay                             | bursts into clods; tiles above and below crumble with their own puff                                               |
| pipe          | drips                                    | bursts: spray, fountain above it, water spreads with an animated surface                                           |
| beehive       | sways on its post, two bees              | cracks open, honey drips, bee swarm with an anger mark                                                             |
| うりぼう      | sleeps, breathing, "Zzz"                 | startles ("!"), charges with a dust trail, knocks enemies away                                                     |
| rock          | solid boulder                            | cracks, then shatters into shards                                                                                  |
| switch / door | sun (1) and moon (2) emblems, gem glints | lever flips, chime, the matching door slides open with dust                                                        |
| goal          | locked: flag down, chain                 | open: flag waves with sparkles                                                                                     |

Switch 1 and its doors are sun-orange with a sun emblem; switch 2 and its doors are moon-blue with a moon
emblem. Colour is never the only cue.

## 4. Animation

Clips, frame counts, sizes and anchors are fixed by `src/art/contract.ts` and checked by
`tests/art-contract.test.ts`. The view adds, on top of the frames:

- squash and stretch on jump, land and bite (scale around the feet, volume preserving, ≤ 18%);
- a blink every 2–4 s and a fidget after 5 s idle; a skid when reversing at speed; run dust on contact frames;
- hit flash (white silhouette) and hit-stop: 40 ms on a bite that connects, 70 ms on a kill, 100 ms when the
  hero is hurt, 450 ms plus slow motion when a boss falls;
- defeated enemies play `defeat` as a ghost after the sim has removed them; the hero's death and cheer are
  view-driven sequences;
- ground shadows under every actor that shrink with height.

Bosses telegraph every attack: `windup` is visible for the whole wind-up time, with a glint or dust cue.

## 5. Effects

`src/view/fx.ts` owns all particles. Every `SimEvent` has a visual answer listed in `src/view/fx-map.ts`:
dust puffs, landing rings, chomp jaws, hit sparks, impact stars, leaves, wood chips, dirt clods, rock shards,
water splashes and droplets, bubbles, honey, hearts, sparkles, smoke, shock rings, explosions, confetti, feathers.
Screen effects: flash, letterbox bars, iris wipe, low-health vignette pulse. Popups (`+1`, `3/8`) use the
outlined rounded font at `k×` resolution.

## 6. Sound

- `GameAudio` in `src/audio/api.ts`. Every `SimEvent`, every menu action and every staging beat has a sound;
  the mapping lives in `src/view/sound-map.ts`.
- Effects are layered synthesis (tone + noise + transient), with per-name voice limits, cooldowns, small random
  pitch variation, stereo position from the screen x, and loudness trims so no effect masks the music.
- Music: one theme per world, a boss theme, a final-boss theme with a second layer for phase 2, title, stage
  select, story, ending, and jingles for stage clear and game over. Each loop is at least 32 bars with an A and a
  B section; melodies are singable; harmony follows a chord chart; loops close on a turnaround.
  `tests/audio-*.test.ts` check keys, ranges, clashes, cadences and loop seams offline.
- The pause menu ducks and muffles the music; under water the music is muffled; volume sliders for music and
  effects are saved.

## 7. Staging (演出)

| moment        | sequence                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| title         | a live demo of the game plays behind the logo; the logo drops in with a shine; start prompt blinks                  |
| screen change | iris or star wipe out, then in; never a hard cut                                                                    |
| story         | illustrated panel (stage backdrop + posed characters), typewriter text with blips, skippable                        |
| stage start   | iris in on the hero, title card slides across, short "ready" beat with input locked (≤ 1.6 s)                       |
| stage 1 start | ハム代 yells behind the hero, the hero jumps in fright, then the chase begins                                       |
| boss wakes    | sim paused; letterbox; camera pans to the boss; `intro` clip and roar; name plate; gate slams; boss music           |
| boss phase 2  | flash, shock ring, `rage` clip, music layer rises                                                                   |
| boss defeated | hit-stop, slow motion, chain of explosions, `defeat` clip, music cut and sting, gate opens, cage breaks, goal arrow |
| goal          | hero cheers, flag rises, confetti, clear jingle, iris out to the result tally (count-up, new record)                |
| hurt / low HP | hit-stop, red vignette pulse; at 2 hearts or fewer the hearts pulse with a heartbeat tick                           |
| death         | freeze, the hero pops up and falls away, game-over jingle, iris out                                                 |
| ending        | illustrated scenes, credits, final statistics                                                                       |

Staging never changes the simulation: it only decides when the app steps the sim, with what input, and what is
drawn. `prefers-reduced-motion` removes shake, flashes and parallax drift and shortens sequences.

## 8. Quality gates

- `tests/art-contract.test.ts`: every sheet matches the contract; `tests/art-complete.test.ts`: nothing is pending (every sheet, terrain and backdrop is drawn; there are no stand-ins); no
  duplicated neighbouring frames inside a clip; per-sheet colour budget.
- `tests/audio-*.test.ts`: scores compile, stay in key, close their loops; every effect renders offline within
  loudness and length limits.
- `tests/view-*.test.ts`: every `SimEvent` type has an effect and a sound; clip selection for every sim state.
- `tests/hoshi-no-hamham-e2e.spec.ts`: title → story → select → play → boss intro → clear → result, death →
  retry, pause, mute, touch layout, reduced motion, no console errors.
- `npm run art:hoshi-no-hamham` writes review sheets to `.build/hoshi-no-hamham-art/`.
