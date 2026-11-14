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
  ramps with `ramp(...)`, but a prop stays within about 24 colours and a frame of a character within 28.
- Toolkit: `src/art/raster.ts` (`Raster`, `ball`, `shadeEdges`, `outline`, `part`, `Painter`, `bar`, `bayer`) for
  props, terrain, effects and interface; `src/art/rig.ts` and `src/art/motion.ts` for everything alive.
- Characters are **rigs**: a tree of part frames (pelvis, torso, head, ears, limbs, tail, cloth) in which shapes
  are written once and painted wherever the pose puts the part, shaded afterwards in screen space so the light
  never turns with a limb. One draw function takes a pose object; a clip is a few key poses on a track, and the
  soft parts (ears, tails, scarves, capes, hats) follow the body through a spring. Never copy a frame to pad an
  animation: every frame of a clip must differ from its neighbours, and loops must close without a pop.
  `src/art/CHARACTERS.md` is the standard for their design, construction and animation.
- Characters face **right**; the view mirrors them. Feet sit on the anchor row. Characters read at a glance
  against every stage: keep a 1 px dark rim and avoid the stage's ground colours on the body.

### Cast

| id           | 名前         | look                                                                                                                                                                                 |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hero`       | ハム彦       | pink hamster kid, two heads tall: a mochi head with a cream mask, round ears, a three-lock tuft and two front teeth; a navy neckerchief with a swallowtail end and a gold star clasp |
| `princess`   | ハム姫       | the same build in snow white: rose ears, sparkling eyes with lashes, a gold star tiara, a pink ribbon bow at the neck                                                                |
| `mom`        | ママ・ハム代 | the same build a third bigger, in orange: three pink hair curlers, furious brows, a white apron with a heart, a steel ladle                                                          |
| `king`       | 黒ハム王     | the same build at 1.6×, dark purple with a lilac mask: glowing yellow slit eyes, a scar, fangs, a five-spike gold crown with a dark star gem, a crimson cape with a high collar      |
| `walker`     | ネズミ団員   | grey rat look-out on his hind legs: a long snout, a big thin ear, a black bandit mask with shifty eyes, a red neckerchief, a long pink tail                                          |
| `flyer`      | 子ガラス     | navy crow chick, all head: a big yellow beak, the red bandana worn as a pirate head scarf, stubby wings that beat                                                                    |
| `jumper`     | カエル団員   | fat teal frog: two eye bulges with heavy lids over a smug wide mouth, a pale throat sac, a red neckerchief                                                                           |
| `spitter`    | リス団員     | red squirrel sitting up: a bushy question-mark tail taller than his ears, stuffed cream cheeks, an acorn in his paws, a red neckerchief                                              |
| `tough`      | モグラ隊長   | barrel of a mole sergeant: a steel helmet with a red chevron over small eyes, a big pink nose, digging claws held like a boxer's guard                                               |
| `crowBoss`   | カラス助     | pirate captain of a crow: a hooked beak, an eye patch, the red head scarf with long tails, wings of three feather rows about 100 px across                                           |
| `weaselBoss` | いたち丞相   | tall sly weasel courtier: a black scholar's cap with the red band, a pale mask, a dark vest, a white feather fan; drops to all fours to charge                                       |
| `boarBoss`   | いのしし番長 | the heaviest four-legged boss: a glossy black pompadour, a bristle ridge, long cream tusks, a leaf stalk in his mouth, a red neckerchief                                             |
| `wolfBoss`   | おおかみ檄   | forest wolf: a dark saddle over grey fur, pale chest and cheeks, a red scar over the eye, fangs, a red scarf with one long streaming end                                             |
| `bearBoss`   | ヒョウタン熊 | huge sleepy violet bear with a cream belly, a sprig of leaves on his crown and a golden gourd on a rope (the forest's own lord: no gang red)                                         |
| `foxBoss`    | きつね旋風   | ninja fox on his toes: a red forehead protector with a steel plate and streaming tails, a navy jacket, a tail as big as his body; his dash is a wheel                                |
| `apeBoss`    | ごりら警部   | the biggest boss: a knuckle-walking charcoal gorilla with a silver back, a navy police cap with a gold star badge, a red armband                                                     |
| `beeBoss`    | ハチ女王     | haughty queen bee: a dark bob under a small crown, antennae with gold bobbles, a white fur collar, a striped abdomen with a stinger, a sceptre, a red sash                           |

Every member of the gang (ばくろ団) wears the gang's red somewhere (neckerchief, head scarf, cap band, armband,
sash) so they read as one gang. The four hamsters are one build drawn by one function (`chars/hamster.ts`).
The twelve portraits (`ui/faces.ts`) are drawn from the same ramps and shapes as their sprites: the portrait is
the character. うりぼう, the sleeping piglet, is a prop in the code and a member of the cast in the drawing. The
king has a second sheet (`king:raged`) for the second half of his fight: the same clips with red eyes and dark fire
around him.

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
`tests/art-contract.test.ts`; how a clip is animated (key poses, timing, overlap, weight) is in
`src/art/CHARACTERS.md` §5. Looping idles and cycles have 6–8 frames; enemy and boss attacks have an anticipation,
an action and a follow-through; the hero's `bite` opens on the lunge (a player's attack has no wind-up: the
simulation bites on the press; enemies and bosses telegraph); a knock-out is drawn (the rig turned and re-lit, the
lying pose designed by hand), never a turned picture. Four things in the contract serve the view:

- `hold`: the ticks each frame of a clip is shown for, where the art lingers on a key pose. The view times every
  clip from the contract (its length, its `hit` frame, its sustained tail), so a hold the art uses is listed there
  and the contract test fails on one that is not;
- `sustain`: a clip that does not loop keeps cycling its last frames for as long as it is shown (the tremble of
  a held wind-up, the flutter of a rise, the stars over a boss who is out cold) instead of freezing;
- clips picked by state rather than time: the hero's `apex` (the top of a jump, by vertical speed), the frog's
  five-frame hop and the three-frame leap of the heavy bosses (rising, the top, falling);
- `blink` is the idle loop with the eyes shut, frame for frame, so a blink never interrupts the breath, and
  `turn` faces the camera for a moment when the hero turns around on the spot.

The view adds, on top of the frames:

- squash and stretch on jump, land and bite (scale around the feet, volume preserving, ≤ 18%);
- a blink every 2–4 s and a fidget after 5 s idle; a skid when reversing at speed; run dust on contact frames;
- hit flash (white silhouette) and hit-stop: 40 ms on a bite that connects, 70 ms on a kill, 100 ms when the
  hero is hurt, 450 ms plus slow motion when a boss falls;
- defeated enemies play `defeat` as a ghost after the sim has removed them; the hero's death and cheer are
  view-driven sequences;
- a knock-out falls to the ground and stays there: the hero is knocked up a little (26 px) and falls under gravity
  to the ground below him (to the ground he stood on, when he stood on the very edge of a ledge), his `die` clip following the body (the hit, the tumble while he is in the air, the
  bounce when he touches down, then lying dazed); a boss knocked out in the air falls to the ground below and
  lands on the first frame drawn lying there (frame 4 for the fliers and the weasel, 3 for the others), its fall
  timed from the clip; a knocked-out enemy is flung away from the hero (facing him), with a 16 px hop when it was
  on the ground (lower under a ceiling): a wall stops it, past a ledge it falls on to the ground below, and its clip
  is stretched or squeezed so that its first lying frame begins on the step it lands; over a pit the hero falls out
  of the view, a boss stays where he is and an enemy keeps tumbling; a clear touched in the air brings the hero
  down (`fall`, the landing squash) before he cheers on the ground;
- the frog's landing is a single frame (the contact squash): it hops again on the next step;
- the rat and the mole show their standing pose only after gaining no ground for 0.15 s (a chasing rat stopped by
  a wall, a mole penned in), or once they keep turning, twice within 0.4 s inside 16 px (shaken on the spot at a
  pit, pacing to and fro on a one-tile ledge); one that turns round once at the end of its patrol walks on;
- a woken うりぼう leaps, runs (by the ground it covers) and, stopped by a wall or a rock, sits dazed with stars over
  its head for as long as it stays there; off a ledge (no ground within 2 px under its feet) it neither runs nor sits
  but kicks as it sinks, between the two airborne frames of its leap, six times a second;
- two after-images behind a boss that charges or dives faster than 260 px/s (off under reduced motion);
- a boss hit while he stands nearly still (idle, recovering, stunned; the chasing parent in every state) flinches
  when there is at least 0.1 s before he next walks or winds up: his `hurt` clip plays whole from the first frame,
  over that time when it is shorter than the clip (a new hit restarts it with its own time); a hit later than that is
  the flash only. While he walks or runs, and in a wind-up, a charge, a dive, a leap or a volley (and the landing
  or follow-through of one), the state's clip stays and the hit shows as the white flash. In every state the sprite jolts up to 3 px away from the hero and eases
  back over 0.12 s, and a crash into a wall jolts it back from the wall (not under reduced motion, not in a staged
  pose; the shadow stays put); a stun shows its clip and the dizzy mark only once it has lasted 0.05 s;
- the crow throws and the fox and the bee cast (`shoot`) from the hover or the walk, when there are at least 0.1 s
  before the shot and 0.1 s after it before his next wind-up: the wind-up is played over the time before the shot and
  ends with the release on the step the shot leaves, then the follow-through, over its own length or the time left;
  a summon is the same gesture from the release, fitted the same way. The wind-up begins facing exactly where the
  simulation aims (the hero's side) and is posed only with the hero clearly to one side (more than 12 px over; on top
  of him the aim flips with every step he takes); at the release he faces the way the shot really went. The crow's dive skims (`sweep`) once it has levelled out. The king is drawn from his raged sheet
  (`king:raged`) from the end of his transformation until he falls;
- the hero's skid lasts as long as the braking (and 0.08 s more), his bite away from a stand (in the air, at a run)
  shows only the lunge and the chomp, and his fidget comes back every 8 s of standing;
- a loaded リス団員 waiting for the hero to come into range holds the end of its wind-up (cheeks full, leaning in)
  with a small pulse, so its shot never comes out of an idle pose;
- ground shadows under every actor that shrink with height.

Bosses telegraph every attack: `windup` is visible for the whole wind-up time, with a glint or dust cue. Staged
poses last as long as their clip: the boss's roar shows its whole `intro` and stays on its sustained tail until the
camera is back, and the phase-2 hold lasts as long as the king's transformation (`rage` and one pass of its
burning tail; under reduced motion the clip itself). A boss in the air (put down above his ground, or in a leap) is
not posed there: his roar or his transformation waits until he lands (1.5 s at most) while the fight runs on, and
meanwhile he falls in his leap's `air` clip on his plain sheet. A pose ends with the moment that set it (or its
skip, or a moment that cuts it), never on a step the simulation runs, and while the simulation runs the hero's own body takes over from
a pose as soon as it moves, leaves the ground, bites or is hurt. In the story pictures a patrol faces the way it
goes, a fleeing runner runs on the spot, and a cheer gets no hop on top.

The picture agrees with the motion (`src/view/tread.ts`, checked in real play by `tests/view-play-audit.test.ts`).
The view reads what each body really does from where it is given it, not from the simulation's own flags: whether
it walks or stands, the way its walk has gone, and the ground its drawn body covers. A ground cycle (a clip with a
`stride`: the hero's run, the walks, the brutes' gallop, うりぼう's run) plays by the ground covered, one pass per
stride, so a planted foot stays put at any speed; a body that marks time (stopped, or turning again and again on the
spot) stands until it leaves the span it kept to. The picture of a walker (a rat, a mole, a walking boss in his walk,
ハム代 running) may then be held still in the middle of that span, but it is never more than 6 px from the body,
it eases in and out at no more than 180 px/s apart from the body (the same at any display rate), and a frame where no
time passes keeps a held picture where it was drawn (the body may be drawn elsewhere when a hit-stop starts or ends:
the held picture does not move); every other body is drawn where it is. Standing is decided on the ground only: a
body in the air walks (ハム代 hopping in a pit runs, her legs going on time), and the standing clip shows only once
a body has stood for 0.15 s. A pose with planted feet shows
only on a body at rest: the hero's bite gives way to his run or his jump
after the lunge, a hard landing at a run goes straight on into the run, a boss keeps the clip of his dash (and a
slam landing its slide, with a puff of dust) until he has nearly stopped, and a flier's hover gives way to his
dash clip above one and a half times his cruising speed. Walkers that are going somewhere face the way their walk
has gone (more than 3 px over its last four steps, turning on a step that goes the new way; just set off from a
stand, the way it set off), and one that would turn twice within 0.16 s, or that shuffled to and fro before it went
back, is marking time and stands; the others face the hero's side as the simulation aims, turning only once he is
12 px over and not again straight away (the 0.16 s run on the screen's time, hit-stops included); a dash faces the
way it goes, a wind-up turns with the hero, and a boss faces his shot. An action keeps the facing it began with,
from its first frame to its last: a flinch, a landing, a throw or a cast (a squirrel's throw begins facing where the
simulation aims it; a shot that leaves the other way at the end of a boss's flinch ends the flinch). The hero's
hurt faces the blow: he is thrown back, away from it. One action shows at a time: it starts
from its first frame, and once another clip has taken its place it does not come back (a bite cut by a hurt, a
landing cut by a bite, a flinch or a cast cut by the transformation); a squirrel bitten during its throw finishes
it under the white flash. A boss's flinch or cast is fitted to the time there is before he next walks or winds up
(the view mirrors his state lengths, measured in the simulation by `tests/view-boss-timing.test.ts`): its whole
clip, faster when there is less time than it takes, every frame still shown; with less than 0.1 s the hit is the
flash and the shot leaves without a pose.

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
| title         | a live demo of the game plays behind the logo; the logo drops in with a shine; the menu and the star trail rise in  |
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
| game over     | night backdrop; the card names the stage and shows on a track how far the hero got (the deck's own ratio)           |
| ending        | illustrated scenes; credits roll over the whole frame and end on 「ありがとう！」; then the final statistics        |

Staging never changes the simulation: it only decides when the app steps the sim, with what input, and what is
drawn. `prefers-reduced-motion` removes shake, flashes and parallax drift and shortens sequences.

## 8. Screens and phones

Three layouts, chosen by CSS media queries, and every screen is designed for each of them:

| layout          | when                           | shape                                                                |
| --------------- | ------------------------------ | -------------------------------------------------------------------- |
| wide            | landscape, 541 px high or more | everything inside the 16:9 stage frame                               |
| short landscape | landscape, 540 px high or less | the stage frame fills the height; denser cards, side-by-side panels  |
| upright         | portrait                       | the stage (full width, 16:9) on top; the screens use the whole phone |

Rules for all three, measured by the review kit and the browser tests at 1280×720, 844×390, 667×375, 414×896,
390×844, 360×640 and 320×568:

- no horizontal scroll; no text under 12 px; no button or link under 44×44 px;
- no screen leaves a stretch taller than a quarter of the height with nothing in it: a block that fits is centred
  and sized to the screen, one that does not fit starts at the top and scrolls;
- headings stay on one line; a footer's buttons sit side by side at equal widths; a name wraps between words, never
  inside one;
- nothing to read sits under a keyboard-focus frame. The frame of a focused button or stage card reaches 12 px
  outside it (a little more below a raised button): text next to a control keeps that distance, and a tag that
  belongs on a card's edge (「つぎはここ！」) is stacked above the frame;
- while the game is paused the touch controls step aside.

Upright phones:

- **Play** — under the stage sits the control deck (`src/ui/deck.ts`), the body of a handheld from the stage's edge
  to the bottom of the phone: an information panel (the world's emblem, the stage name, the aim of the stage in one
  line, a hint line that also carries the toasts), a night-sky window (time, defeated enemies, a track from start to
  goal with the hero's and the boss's faces), the sound and pause pills, the pad and the action buttons. The small
  stage carries only the game, the hearts and the bite meter: the stage card and the calls sit right under the
  hearts, and what a character says appears on the deck with the speaker's face (the stage shows a short wordless
  balloon). The deck dims with the stage at an iris-out.
- **Title** — the demo and the logo (192×64) in the stage; under it a night scene in the deck's vocabulary: the
  tagline, the menu, a trail of ten stars (one per stage; lit when cleared, the next one pulsing), the moon, hills,
  a shooting star, the footer.
- **Story and ending** — the picture takes the upper part and the text card the lower. The picture is never cropped:
  the diorama draws the part of the scene that suits its panel (`src/ui/story-frame.ts`). A 2:1 panel shows the
  classic picture; a taller panel keeps the ground at the bottom, grows upward into the backdrop and narrows around
  the figures, so every character the wide picture shows is whole and as large as the panel allows.

At every size the credits cover the whole frame over the dimmed picture, with soft fades at the top and the bottom
so that no line is cut by a hard edge; a tap, a click, Enter, Space or Escape skips them; under reduced motion they
are a list scrolled by hand with a button that closes it.

## 9. Quality gates

- `tests/art-contract.test.ts`: every sheet matches the contract; `tests/art-complete.test.ts`: nothing is pending (every sheet, terrain and backdrop is drawn; there are no stand-ins); no
  duplicated neighbouring frames inside a clip; per-sheet colour budget.
- `tests/audio-*.test.ts`: scores compile, stay in key, close their loops; every effect renders offline within
  loudness and length limits.
- `tests/view-*.test.ts`: every `SimEvent` type has an effect and a sound; clip selection for every sim state.
- `tests/hoshi-no-hamham-e2e.spec.ts`: title → story → select → play → boss intro → clear → result, death →
  retry, pause, mute, touch layout, reduced motion, no console errors.
- `tests/hoshi-no-hamham-{screens,title,story,frame,hud,staging}.spec.ts`: the rules of section 8 at every layout — the
  screens fit, the title and the game-over card fill their screen, story pictures are not cropped, the credits take
  the frame and no line is cut, the deck holds the controls and the speech, the staged pieces do not overlap.
- `npm run art:hoshi-no-hamham` writes review sheets to `.build/hoshi-no-hamham-art/`.
  `--gif` (a GIF per clip with its real timing), `--onion` (previous frame as a ghost), `--motion` (numbers per frame
  and per clip), `--lineup` (the cast on one ground line), `--game` (every clip at 2x, the size the game draws, on four flat grounds) and `--stage <theme>` (clips over a world's backdrop) are for
  judging character animation.
- `src/art/quality.ts` holds the measurements of a character sheet and `tests/art-rig-quality.test.ts` holds every
  character to them: no isolated pixel, no light pixel on the edge of the silhouette, at most 28 colours in a
  frame, a loop that closes no harder than its own steps, no two frames of a clip alike, a contour that does not
  boil from frame to frame, and one clear pixel between the drawing and the edge of its cell. Each character also
  has its own `tests/art-<id>.test.ts` for what makes it that character (its colours, its size against the hero,
  what each clip must show).
- `tests/art-footfall.test.ts`: feet that stay where they land. Every ground cycle (a clip with a `stride` in the
  contract) lists where its feet are down (`footfalls` of its module), and the drawing is held to that list: a
  foot that stays down moves back stride/frames px a frame, its sole is on the ground rows where the list says, and
  nothing else is on them. A clip that travels without a stride is off the ground (a leap) or on it in every frame
  (a roll, a whirl). `node scripts/hoshi-no-hamham-footfall.mjs` draws each cycle on a ground ruler.
- `tests/view-play-audit.test.ts` (with `tests/play-audit.ts`): the picture agrees with the motion in real play.
  The simulation runs (the bot through every stage with four seeds, every boss hit at every moment of his cycle
  with the hero changing sides, every piglet woken both ways, the hero's and the squirrel's own overlaps) and the
  view is driven as the game drives it (display frames at 60 Hz, and 120 and 30 Hz for some stages, positions
  interpolated, hit-stops); every frame is checked: no planted pose carried along the ground or shown in the air,
  no ground cycle on a body at rest, cycles that advance with the ground covered, travel that faces its way, shots
  from their release frame, actions that start at their start, play out and keep their facing, bodies that lie on
  the ground, no flicker, and a picture that is where its body is. `tests/view-director.test.ts` holds the staged
  moments to the same rules (no pose in the air, none on a step the simulation runs).
- `node scripts/hoshi-no-hamham-review.mjs` writes the review kit to `.build/hoshi-no-hamham-review/`: every screen
  at four viewports with its tallest empty band, wrapped headings, text under a focus frame and cut lines, the
  staged moments frame by frame
  on the desktop and on an upright phone, the art, the motion and the sound, as numbers that read without the
  images.
