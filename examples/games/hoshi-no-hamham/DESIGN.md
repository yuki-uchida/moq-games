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
  a summon has no gesture of the boss's (the cast is the order to fire; a summon is not a shot): the minion's own
  puff where it first shows announces it. The wind-up begins facing exactly where the
  simulation aims (the hero's side) and is begun only with its aim settled: the hero clearly to one side (further over
  than one step of the boss's own travel and 2 px: within that the aim flips as he overshoots) and still on that side
  when the shot leaves, going by how the two bodies move (the fox and the bee walk at him); not straight after a
  turn. If the hero goes over to the other side before the release, the wind-up is given up on that frame and, where
  there is still time and the hero is clearly on a side, begins again once from its first frame facing him; if he
  crosses on the very step of the shot, no release frame is shown and no follow-through follows. A cast never turns
  round. The crow's dive skims (`sweep`) once it has levelled out. The king is drawn from his raged sheet
  (`king:raged`) from the end of his transformation until he falls;
- the hero's skid lasts as long as the braking (and 0.08 s more), his bite away from a stand (in the air, at a run)
  shows only the lunge and the chomp, and his fidget comes back every 8 s of standing;
- the hero swims only in water off the ground: on the floor of a pool the simulation walks him as on land, and he
  stands, runs (without dust or footsteps: the water has its own sound), turns and bites there with his ground clips;
  a landing or a jump on the floor of a pool stirs two bubbles instead of dust, and on the lip of a bank with his
  body over the pool at its surface it raises nothing; knocked out in water, his body takes
  the water's pace (a lift of some 7 px, then it sinks as the simulation lets a body sink there, no faster than
  260 px/s) to the floor, landing on its bounce frame as on land;
- a boss's shot is drawn in front of the actors from its first frame: the crow's, the fox's and the bee's are born
  from their light (below), and the king's volley bursts out of his chest (its smoke stays on his centre); the smoke
  and the flash of the others' throws and casts are where their light was. A squirrel's acorn still comes out from
  behind its shooter: born at its centre, it is drawn behind the actors while it overlaps the drawing it shows (the
  painted bounds of its frame, placed and flipped as drawn), then in front for good, out past its mouth, where its
  puff is; one thrown from in front of the boss's drawing comes to the front only once clear of him too. The stinger
  is drawn along its flight (at steps of 22.5°: falling, it points down). A boss's shot that ends on a hero who
  cannot be hurt just then (the simulation drops it without an event) ends with a small spark where it was, and
  so does a shockwave that dies on the step it is born;
- a rat or a mole with no ground within 4 px of its feet (off a ledge, summoned in the air, the ground dug away) is
  drawn in its `air` clip, thrown up, at the top or falling by its vertical speed, from its first frame and until it
  is back on the ground (a bite's `hurt` plays over it), decided on the simulation's steps (the same at every
  display rate); then its walk goes on by the ground it covers. In the air it
  faces the way its body has really gone: it turns once it is 4 px back from the furthest point it reached the way
  it faced, once in a fall at most (the simulation reverses its speed on every step over the hero or against a
  wall). A drop on to ground so close that it would last no more than 5 steps is not drawn as a fall;
- a summoned minion is drawn, with its summon's puff, once the simulation has settled where it is: one step after its
  birth when that step carried it no further than its own speed (born in the open), else one step after the step
  that pushed it out of the solid it was born in (the raised gate, a rock), three steps at most; one the simulation
  leaves overlapping a solid (standing on the floor in the gate's column, walking out of it) is first drawn on the
  frame its box (but for a pixel at its edges) is out of it, or after 1 s at the latest (the slowest minion, the
  squirrel, walks its own width in 0.88 s), and once drawn it is never hidden again. Every other enemy is drawn
  wherever the simulation has it, on every frame (a rat caught in the gate's column as it rises is drawn there until
  the next step puts it on top);
- a loaded リス団員 waiting for the hero to come into range holds the end of its wind-up (cheeks full, leaning in)
  with a small pulse, so its shot never comes out of an idle pose; its release frame shows on the step the acorn
  leaves (a timer that runs out a hair above zero throws a step later). When the hero goes over to its other side
  before then, it begins its throw again from its first frame facing him, its frames before the release squeezed
  into the time left (played over 0.1 s while it waits loaded; drawn from its first frame on the frame that first
  shows it); when he crosses on the very step of the spit, or its throw begun again has not been shown by any frame
  yet when the acorn leaves (the two steps fall in one display frame), it shows no release: it stands, turned to
  the acorn's side, with no follow-through. A throw that falls due straight after a turn, its aim on the other side,
  does not show its lead-in while the turn's hold keeps it from facing its aim: it stands, then begins its throw
  facing the hero, its frames fitted to the time left;
- every thrown or cast shot of the crow, the fox and the bee is announced by a gathering light for the 0.45 s of
  simulation time before it leaves (`gather` of the shot's own sheet, its frames by how far the gathering has come,
  full on the last step before the shot), whatever his body does then (walk, wind-up, dash, recovery, flinch, cast):
  in front of him and of the hero (a warning: a hero standing on him does not hide it), at the very place the shot
  is born on his drawn body (7 px on from his centre, at the height of the shot's middle, with the hit's jolt), so
  that on the frame the light is gone the shot is there, in front, and flies. The light promises a shot, not a side
  (the side is known only on the shot's own step): its frames are their own mirror images, and it is drawn as it
  is, never mirrored. The
  view steps the simulation's own timers to know the shot's step (`shotDue`): a light never promises a shot that does
  not come. A hit-stop or a staged moment holds the light with the simulation; it shows under reduced motion too. His
  shot never turns his body. The king has no light: his body gathers;
- the king only gathers in his `shoot`: the frames before the release share the time up to his volley evenly, and
  never go back (when the phase change restarts his `shoot`, the gathering goes on from the frame it showed, its
  frames left sharing the new time up to the volley); the release frame begins in his `recover`, on the step the
  orbs leave. His volley is a fan to both sides: he keeps
  the facing he began it with to the end of the follow-through. A boss's
  clip timed from his state's start (a recovery, a wind-up, a stun, a landing) that takes over from another clip
  inside the state (after a landing, a follow-through, a dash, a flinch, a fall) begins on its first frame; a bear,
  an ape or a king whose slam landing slides him off a ledge falls in his leap's `air` (and goes on with his
  recovery from its first frame where he comes down), and on the ground he never shows `air`: the frame he touches
  down (the simulation still has him in his slam for that step) is the first frame of his landing. The fox, who
  walks the ledges, falls in his own `air` (by his vertical speed, as the leapers) whenever he is off the ground
  outside his whirl and his cast's leap, walking, winding up or recovering, facing the way his body really goes; the
  shake at a ledge's lip (a step or two off the ground, coming down again within 5 steps) keeps the picture he has,
  and a wind-up he lands in begins on its first frame (he has no `land`). A dash that still carries a boss (the fox's
  whirl, the king's roll off a ledge) is drawn as his dash in the air too, until it has let him go: no `air` between
  two frames of it. A
  wind-up taken over late (after a fall or a landing) has whatever is left of it, fitted (every frame, faster) so
  that its last frame is the one on the screen when the dash begins; a landing inside a wind-up takes some of that
  time only if 0.15 s of warning is left after it, otherwise there is no landing. A king whose slam the phase change
  restarted as he touched down is carried along the ground by the simulation until it ends the slam: he is drawn
  rolling (his dash's clip) until the impact's step, whatever the state's clock says, and the squash comes with the
  impact (`boss-slam`). A slam's landing
  is its impact: it plays from the step the slam ends on (`boss-slam`, the shockwaves leave), and while the
  simulation keeps him on the ground in his slam (the phase change restarts its clock as he touches down: 0.2 s
  more) he skids in his landing's first frame until the impact comes; `boss-slam` begins a landing whatever a
  staged pose cut before it. The bear, the ape and the king land (`land`, whole) on the touchdown of any real fall
  (12 px or more) outside their slam, out of a walk, a wind-up or a stun as well, fitted to the time
  before their next attack begins (every frame still shown, faster; with less than 0.1 s they come down without
  one; in a charge, an attack itself, none: the dash carries him on; a landing lasts no longer than he stays put:
  once his walk carries him, off a ledge in it or starting on the next step, over no more ground than a slam's
  landing slides, 20 px, every frame still shown), and a gathering that begins ends that landing. A
  boss asleep records no landing. A step or two off the ground that his `air` would not show (he comes down again within 5/60 s) does not
  end a landing; a real fall does, for good. A landing and a volley's follow-through run on
  their own clock from their own cause (the impact; the step the volley left): the step on which the king's phase
  change restarts his state's clock is invisible, nothing is cut or begun again on it, and what is timed from his
  state's start (a wind-up, a recovery) begins again from its first frame, as his body does; a dash, a leap or a walk
  goes on with his body. Only a staged moment that had to stop waiting for him (see below) cuts what was showing: a
  landing or a follow-through it cut does not come back (until he touches down or casts again), and what is timed
  from his state's start begins again from its first frame after it, a gathering sharing what is left up to the
  volley;
- a shockwave rolls (`roll`) while there is ground within 4 px under its middle and flies (`fly`, the crest torn
  free of the ground) where there is none; the dust of a new wave is under its leading edge;
- ground shadows under every actor that shrink with height.

Bosses telegraph every attack: `windup` is visible for the whole wind-up time, with a glint or dust cue. Staged
poses last as long as their clip: the boss's roar shows its whole `intro` and stays on its sustained tail until the
camera is back, and the phase-2 hold lasts as long as the king's transformation (`rage` and one pass of its
burning tail; under reduced motion the clip itself). A boss in the air (put down above his ground, or in a leap) is
not posed there: his roar waits until he is on the ground, out of his slam and his landing, while the fight runs
on (3 s at most), and meanwhile he falls in his leap's `air` clip on his plain sheet. His transformation waits for
him to be between his actions, and his side of the wait is not negotiable: not in a wind-up, a charge, a leap (in
the air or in his slam), a gathering, a landing, a follow-through or a flinch, and on the ground (the first 0.1 s
of a wind-up are still a rest: after the moment it plays from its first frame, a fair warning; judged by the
wind-up's own age, not by the state clock the phase step restarts, so a crouch that has been on the screen longer is
his attack, and he transforms after it). A plain fall's
landing is a rest once its impact has shown (a frame has drawn it and its first frame is over), out of his walk at
any speed and in any other state once he no longer slides (30 px/s): he comes down, takes the impact and roars out
of the crouch, and the landing gives way to the pose for good. A slam's landing is his attack's and plays whole. His own walk is
not an action: in `idle` (walking at the hero or standing over him) he is between actions whatever his speed, and
he stops and roars, and walks on afterwards; in any other state (a recovery, a stun) only once he no longer slides
(no faster than 40 px/s for three steps on the ground, outside his attacks: not still carried out of a charge, a
crash or a landing). Straight out of a dash or a crash (the king's stun lasts a step) he is first seen out of it, at
rest for three steps (no faster than 40 px/s), in his walk too. He is hit; he
finishes the whole attack, from its wind-up to the end of its recovery slide, landing and shockwaves included;
then, standing, he transforms. The longest honest chain from the phase step (a wind-up, a phase-2 charge of 1 s,
its slide) is about 1.7 s, and his walk comes between any two attacks; the one backstop is 3 s, after which the
moment begins whatever he does (it is never reached in play). The conditions are looked at once every simulation
step has been answered whole, never in the middle of its events (a contact hurt of the hero's may follow the phase
event in the same step), on every step (a hero who touches the ground for one step between two hops counts at any
display rate), and once a moment that holds the simulation has begun no further step runs in that frame. The phase change itself shows only the anger mark; the transformation's
flash, explosion, rings, shake and sound come with the moment's first frame, and when the pillar of flame ends a
burst and a ring cover the change to his raged sheet. His entrance and his transformation also wait for the hero
to stand on the ground and not be knocked back by a hit, up to 1.5 s from the moment's cause; after that the moment
begins on the first step the boss is ready, and a hero in the air hangs there (the simulation holds him, as it
holds the minions, the shots and the shockwaves). Both wait for the hero only while the boss rests (stands or
walks, no light of his gathering): once he winds up for his next attack it begins, in the first moments of that
wind-up, or on the step before his light or his cast shows, wherever the hero is, so a hero who keeps hopping never
makes him go through another whole attack first, and neither moment ever stops him inside an action (his entrance
begins before he has begun anything; after it his first action plays from its first frame) (in sixty real fights
the roar follows the hit by 0.3 s on average and by 1.1 s at most, with the hero in the air in ten; the king's
own attack, when the hit lands in the middle of one, is the only thing that makes it longer). The transformation says in the picture that the world stands
still: from its second frame (the first still shows the step that began it) a spotlight on the king (the death's,
under his drawn body, centred on his pillar of flame) dims everything else, so whatever hangs in the air hangs in
the dark; the light is switched off 0.35 s before the moment ends, so nothing is dimmed on a frame the simulation
runs. A king who is not wholly in the view with his pillar of flame when the moment begins (a charge carried him
off after the hit) is brought into it by the least the view has to move and stays framed to the moment's last
frame, the burst that covers his change included (one already in it: the view stays where it is to that frame, a
follow camera still easing after the hero does not carry him out of it); the follow camera eases back to the hero once the fight goes on. While the moment holds the simulation, the hero finishes
what he is doing (a bite under way plays its remaining frames on real time, at its own speed, from where the step
that began the hold left it: the frame that first shows the pose shows it there, so a slow display passes over no
frame of it) and stands (`idle`, breathing) for the rest of it, instead of hanging in the frame he was in. The pose is taken once the step's events are all answered (a bite that
ends a boss is sent after his `boss-down`: it plays out under the hold, facing the side it bit). The pose keeps the
facing he is drawn with (the bite or the hurt that
plays out keeps its own: the side it bit, the blow); when the moment ends he is drawn as the pose showed him, and
keeps that facing until the player turns him or he moves the way he faces in the game; what the pose covered (a
bite, a hurt, a landing, a pivot) does not come back after it; carried against the facing the pose showed him
with when it ends (out of a skid, a knock, a bite's lunge), he is never drawn running: faster than a walk he skids,
from the clip's first frame, facing as the pose showed him, and a turn of his ends that skid (it does not mirror);
slower, he stands while he drifts. A moment that poses him facing a named way
(his cheer turned to ハム姫) still does, and after it he is drawn that way until he really turns. A turn decided
on the very step a moment begins is not drawn: the pose keeps the facing the last frame showed. The time a moment holds the simulation counts for the facing holds, as a
hit-stop's does, so a turn after it is drawn on the frame of the input. While the simulation is held (a moment, a
hit-stop) the hero is drawn on every frame: the flicker of his invulnerability is for time that runs. A pose ends with the moment that set it (or its
skip, or a moment that cuts it), never on a step the simulation runs, and while the simulation runs the hero's own body takes over from
a pose as soon as it moves, leaves the ground, bites or is hurt. A staged hero pose is drawn with his squash, which
settles on real time under it (a moment that begins on the step he lands does not hold him flattened).
Freed, ハム姫 waits standing until her own moment (the boss's fall and the goal come first): her cheer begins with
it, from its first frame, together with her line, the hearts and the hero's cheer (the moment lasts the whole of
his, turned to her; when it ends he keeps facing her until he really turns), and runs on real time for 2 s into the play that follows; it plays when she is in view or in
the view the camera settles to on the hero (a skipped pan is still on its way home); a moment that will not play
(she is out of view, the stage has ended) lets her go straight on to what she shows after a cheer.

The story pictures keep the same rule as play (`src/ui/story-motion.ts`): a clip with a stride is only ever played
by ground that really passes under its figure, never by the clock. Nobody runs on the spot: a chase is a tracking
shot (the camera runs with the runners, who keep their place while the backdrop, the ground strip and whoever is
left behind go by), a figure that bolts dashes across the picture and out of it, rests and starts again (fading in
where it began), and a patrol walks to and fro at a steady pace, turning round at each end. A rider sits on her
mount: her feet follow the back under her in the frame the mount shows. A mark that belongs to a figure moves with
it, and a cheer gets no hop on top. Under reduced motion nothing travels and a ground cycle stands on one frame.

The picture agrees with the motion (`src/view/tread.ts`, checked in real play by `tests/view-play-audit.test.ts`).
The view reads what each body really does from where it is given it, not from the simulation's own flags: whether
it walks or stands, the way its walk has gone, and the ground its drawn body covers. A ground cycle (a clip with a
`stride`: the hero's run, the walks, the brutes' gallop, うりぼう's run) plays by the ground covered, one pass per
stride, so a planted foot stays put at any speed; a body that marks time (stopped, or turning again and again on the
spot) stands until it leaves the span it kept to. The picture of a walker (a rat, a mole, a walking boss in his walk,
ハム代 running) may then be held still in the middle of that span, but it is never more than 6 px from the body,
it eases in and out at no more than 180 px/s apart from the body (the same at any display rate), and on a frame where
no time passes the picture keeps its offset, moving as the body is drawn (from between two steps to where it stands
as a hit-stop begins); every other body is drawn where it is. What a body is decided to be doing (walking or marking
time, which way it faces, when it turned) is worked out once per simulation step from the simulation's own
positions (`ActorsView.simStep`, called by `PlaySession` after each step and its events), the same numbers at every
display rate, hit-stops and slow motion included; the display frame only draws it (the interpolated place, the eased
picture offset, the clip's frame). The facing holds run on the simulation's time plus what each hit-stop adds to
the screen's time (credited from the step after the one that starts it, whose decisions are drawn before the
hit-stop's time on the screen: a hit-stop during another adds only what it lengthens it by, and the frame that shows its first step and the gap the steps had anyway, two steps' worth, are not counted), the
same at every rate and never shorter on the screen than the 0.16 s they promise. Standing is decided on the ground only: a
body in the air walks (ハム代 hopping in a pit runs, her legs going on time), and the standing clip shows only once
a body has stood for 0.15 s. A pose with planted feet shows
only on a body at rest: the hero's bite gives way to his run or his jump
after the lunge, a hard landing at a run goes straight on into the run, a boss keeps the clip of his dash (and a
slam landing its slide, with a puff of dust) until he has nearly stopped, and a flier's hover gives way to his
dash clip above one and a half times his cruising speed. Walkers that are going somewhere face the way their walk
has gone (more than 3 px over its last four steps, turning on a step that goes the new way; just set off from a
stand, the way it set off; a boss beginning to walk after another state faces the way the simulation walks him from
his first step), and one that would turn twice within 0.16 s, or that shuffled to and fro before it went back, is
marking time and stands; the others face the hero's side as the simulation aims, turning only once he is 12 px over
and not again straight away, in a wind-up as anywhere else, so nothing follows the sign of the hero's side frame by
frame while he is on top of a boss; a dash faces the way it goes. Every turn is one the body made: within the 0.16 s
hold a walk drawn with a stride on the ground still turns once its body has gone 8 px the new way since its last turn
(it is never carried further against its facing); every other turn (in the air, at the start of a throw, falling
in a wind-up, a hover) has the hold alone. Every turn is drawn on the frame that shows the step it was decided on.
Nothing drawn depends on how long a display frame is (frames of uneven length: a long one now and then): the
gathering light grows with the simulation's time alone and never goes back; a cast's follow-through has its length
decided once, at the release; a landing's clock, like a cast's release and a throw begun again, starts on the frame
that first shows it, so its first frame is never passed over; and a staged pose taken on a step starts its clock at
the tick of the frame that first draws it. A long frame may pass over what it does not draw; it never makes a
picture step back or start again. The boss is decided on the steps like everybody else (his state history, his
dash, his setting off, every new state's facing), so what is drawn for him on a step is the same at every display
schedule, and a state that fell inside one long frame is simply not drawn. The bodies' clocks run on the simulation
time a frame put on the screen (its steps and the change of the interpolation between them), not on the frame's real
length; an effect born on a step is first drawn as it was born (a staged beat's effects age from their own frame,
which draws them young); a boss's thrown or cast shot is first drawn at its own place plus what his picture was off his body
where and when he fired (a held picture: its place less his body's before that step's move; a picture that follows
its body: the easing's remainder and the jolt, nothing of the body's travel since), and joins its own path over 0.1 s; a follow-through is fitted to the time before his
next attack less a step (none under 0.1 s); the hero's blink has its own random numbers. A boss's flinch and a
cast's follow-through are counted on the steps (when they end, what he does next and his facing never wait for a
frame): their first frame shows on the frame that first draws them, and from there they run on the steps from the
one that began them. A fitted clip (a follow-through, a flinch, a fitted landing) with the time for it plays at its
own pace; squeezed, its last frame keeps one 30 Hz frame (1/30 s) before its time is up, but never more than is left
once every frame before it has had one 60 Hz frame, and the frames before share the rest (each a 30 Hz frame when it
allows, else equal shares): a display with as many frames as the clip passes over none of them, one with fewer shows
the first and the last (a display frame longer than what the last frame keeps may pass over it). Its time is where
its steps really end it. On the screen a boss's fitted clip (a flinch, a cast, a landing, a wind-up taken over late)
then goes forward by display frames from its first frame: when the display is no faster than the clip's own pace
(on the run's second display frame its time is already past its first frame) one frame on every display frame up to
its last; otherwise no more than one frame past the one the last display frame showed, whatever its time says, but
into its last frame once its time is well into it. A short landing whose first display interval leaves just enough
frames for its remaining poses reserves one pose per advancing frame, even across a hit-stop. A cast's lead-in is given
up only for a hero clearly on the other side: inside the aim zone the shot's own step decides.
The bee sits in her recovery only on the ground: slid off a ledge she is in her hover, and sits again, from its
first frame, when she is down. Once a fall's landing has begun in his recovery the dash that carried him into it is over: sliding off the next
stair he falls (`air`) and lands again, and on the ground he recovers. A boss falling out of his walk or his wind-up (not leaping, not dashing) faces as a rat in the air does: the way his
body has really gone, once 4 px back from the furthest point it reached, once in a fall at most, never straight
after a turn. An action keeps the facing it began with, from its
first frame to its last, without exception: a flinch, a landing, a throw or a cast (a throw or a cast begins facing
where the simulation aims it, not straight after a turn; one whose target crosses begins again from its first frame
or is given up, never turned). A hurt is thrown back: the hero's and a walker's begin facing the blow, from
what the hit says (the side `enemy-hit`'s `dir` throws it to), not from its speed on that step. The hero's actions keep the facing they began with to their end, and give way when
another clip takes their place: a bite the side it bit (`bite`'s `dir`): every bite the player commands is drawn, turning his drawn
facing at once whatever the hold says (a cause of its own, as a blow is; a hurt that begins on the same step shows
instead), and a skid a bite or a hurt covers is over for good; a landing, a skid and a fidget the way he leans when the hold lets him turn there, else the
facing he is drawn with. His drawn facing obeys the walkers' rule: a turn at once, a second within 0.16 s only once
his body has gone 8 px the new way on the ground (then he runs into it, with no pivot). His pivot (`turn`) is the
picture of a drawn turn on the ground at a walking pace: it begins on the step his drawn facing turns, and an input
that goes back before the hold lets him turn gives no pivot at all. His turns on the ground follow one model (round 8d): a turn toward the way his body has gone for two steps running
is never held (on the ground or in the air); a skid is a brake at speed that has taken hold, drawn from the third step
of the simulation's braking, turned to the key's side, two steps at least, with its short tail (a tap of one or two
steps changes nothing); at a walk a turn is a pivot from its first frame, never cut by a skid, giving way to his run
after 6 px; carried with no turn asked he skids faster than 50 px/s, else stands; nothing of his walk shows for a
single step; after a hold a hero who only coasts to a stop stands. Round 8e: a pivot never slides (carried 4 px back
the old way, further than a walk's brake slides him, it is over too); out of a run a stand of one step waits one step more before rule 1 turns him, so the
stand shows two; turned to the key in the air, he lands into his brake skidding from its first step; in water a
stroke faster than 12 px/s counts as his drive (the water slows him to 18.6 px/s on his first stroke); the skid's
squeal begins on the display frame that first draws a brake's skid; out of a stand he runs once his body goes faster
than 40 px/s (a body jittering on the spot as the keys dither stands); out of a pose that faced him back, carried on
by his run, his skid shows two steps before rule 1 turns him; a blow after a hurt that a hold played out flinches.
Round 8f: a body a knock still carries is not driven: nothing but a bite turns him while it does, and after it he
keeps facing the blow until the player turns him or runs him (the simulation's facing is still the one from before
the blow). His knocked-out body never tumbles or lies inside a wall (`deathRestPlace`, `DIE_HALF_W` 30 px either
side): off a ledge's lip he tumbles outward over 0.25 s, before his hop comes back down, and lies clear of the wall
with ground under his middle; against a wall, at a step's foot or in a gap he moves clear of it on the same ground;
a hole narrower than his lying body he lies across (not with 64 px tiles); over a pit he keeps tumbling; the
blow's frame is drawn clear of a wall beside him; under a ceiling his hop is lowered so no frame reaches into it; the
death's iris closes on where he lies. Round 8g: a body the simulation leaves in or against a solid on the step he is
knocked out (a felled log landing on him) is drawn from the nearest place clear of it (`deathClearPlace`: beside it or
on its top, up to three tiles away), and tumbles and lies from there by the same rules. On the ground he is never drawn running against
his travel: carried against the facing he is drawn with (the hold keeps it, or his momentum or a knock-back carries
him back, a skid a bite covered included), faster than 50 px/s he skids from its first frame facing as he is drawn
(until he may face the way he goes; a braking skid goes on so down to that speed), a turn just made shows its pivot,
and otherwise he stands (what he slides then stays within a planted pose's few px). What he does is
decided on the simulation's steps too (his landings, his skid and its tail, his pivot, what of his actions is over
for good), so the same play shows the same clips at every display rate. One action shows at a time: it starts
from its first frame, and once another clip has taken its place it does not come back (a bite cut by a hurt, a
landing cut by a bite, a flinch or a cast cut by the transformation); a squirrel bitten during its throw finishes
it under the white flash. A boss's flinch or cast is fitted to the time there is before he next walks or winds up,
and a flinch also to the time before the step his next shot leaves (a flinch never covers a shot: the view mirrors
his state lengths and steps his shot timer, measured in the simulation by `tests/view-boss-timing.test.ts`): its
whole clip, faster when there is less time than it takes, every frame still shown; with less than 0.1 s the hit is
the flash and the jolt and the shot leaves without a pose.

Once the stage is over or the hero is down the simulation holds everything, and so does the picture: the boss, the
enemies, the shots and a light stand still on the frame they had (a dash does not roll on the spot, a walk does not
tread, a hover does not flap: the world stops with the hero's fall), while what the moment itself plays goes on
(the hero's fall and his cheer, a knocked-out body's clip, ハム姫, the effects). When the world did not step,
nothing is decided: every body the simulation holds keeps its clip, its frame and its facing to the end. Every
staged moment that holds the simulation stands the hero on the ground: what he shows (a bite, a hurt) plays out on
real time, then he stands, until the hold ends; in the air he hangs (slow motion is no hold: his hurt plays slowly).

A body moved further in a step than its own speed carries it (a falling tree pushing the hero aside, a crash
throwing a boss back) is not drawn gliding between steps (`src/app/interpolate.ts`): it is where the simulation
put it on the first frame that shows the step.

## 5. Effects

`src/view/fx.ts` owns all particles. Every `SimEvent` has a visual answer listed in `src/view/fx-map.ts`:
dust puffs, landing rings, chomp jaws, hit sparks, impact stars, leaves, wood chips, dirt clods, rock shards,
water splashes and droplets, bubbles, honey, hearts, sparkles, smoke, shock rings, explosions, confetti, feathers.
Screen effects: flash, letterbox bars, iris wipe, low-health vignette pulse. Popups (`+1`, `3/8`) use the
outlined rounded font at `k×` resolution. Not every effect waits for an event: the gathering light that announces a
boss's shot (§4) is drawn by the actors view before the shot, and the `boss-shoot` smoke and sparkles take over from
it on the frame the shot leaves.

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
| boss wakes    | both standing: sim paused; letterbox; pan to boss; `intro` + roar, hero idle; name plate; gate slams; boss music    |
| boss phase 2  | both standing, he at rest: sim held; flash, boom, rings, sound, `rage`, hero idle, layer rises; a burst at its end  |
| boss defeated | hit-stop, slow motion, chain of explosions, `defeat` clip, music cut and sting, gate opens, cage breaks, goal arrow |
| goal          | hero cheers, flag rises, confetti, clear jingle, iris out to the result tally (count-up, new record)                |
| hurt / low HP | hit-stop, red vignette pulse; at 2 hearts or fewer the hearts pulse with a heartbeat tick                           |
| death         | freeze, the hero pops up and falls away, game-over jingle, iris out                                                 |
| game over     | night backdrop; the card names the stage and shows on a track how far the hero got (the deck's own ratio)           |
| ending        | illustrated scenes; credits roll over the whole frame and end on 「ありがとう！」; then the final statistics        |

Staging never changes the simulation: it only decides when the app steps the sim, with what input, and what is
drawn. A moment that holds the simulation holds everything timed by it with it (a boss's gathering light, his
state's clips); when the moment ends, what the boss shows next begins, it does not resume (§4). `prefers-reduced-motion` removes shake, flashes and parallax drift and shortens sequences.

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
  with the hero changing sides, every summoning boss with his minions, every piglet woken both ways, the hero's and
  the squirrel's own overlaps, the hero through a pool) and the view is driven as the game drives it (display frames
  at 60 Hz, and 120 and 30 Hz for some stages, positions interpolated, hit-stops); every frame is checked: no planted
  pose carried along the ground or shown in the air, no pose drawn in the air (a jump, a fall, a swim, a leap) on a
  body that stands on the ground, no rat or mole walking on air, no ground cycle on a body at rest, cycles that
  advance with the ground covered (to two frames and 1 %), travel that faces its way, shots from their release
  frame and out from behind their shooter (none comes in front while a pixel of it lies on his drawing), actions
  and clips that take over inside a state that start at their start, actions that play out and keep their facing,
  no minion drawn inside a solid nor jumping on its first frames, no enemy blinking out, no rat or mole turning
  round in the air without having gone that way (or twice), bodies that lie on
  the ground, no flicker, and a picture that is where its body is. `tests/view-director.test.ts` holds the staged
  moments to the same rules (no pose in the air, none on a step the simulation runs).
- `tests/view-session-audit.test.ts` (with `tests/play-audit.ts`): the same rules in the real session. Each stage is
  played by the real `PlaySession` with its `StageDirector` (its pacing, hit-stops, staged moments and their poses,
  input lock and slow motion), display frame by display frame: every stage with three seeds (every moment played,
  every one skipped, every one skipped but the boss's fall); stages 2, 7, 9 and 10 also on 48, 50, 72, 90, 120, 144
  and 165 Hz displays (rates that do not divide the step on two seeds), the other stages on 50 and 72 Hz; stages 7, 9
  and 10 on 144 and 240 Hz with three more seeds that really differ (the seed alone changes little of a run: each of
  these also waits a different number of steps before the bot sets off); the king's transformation forced in every
  state he has, with a hit and without, at 30, 48, 60 and 144 Hz, the hero standing, just jumped, biting, knocked
  back, running, hopping with the jump held, or held in the air past the director's cap; three real fights in which
  the hero takes the king's contact hit on the very step of the transformation; the king kept in his slam by hand
  until the view's backstop begins the moment anyway (the backstop is reported by name, nothing else may come of it,
  and let go he lands his slam); shots of the crow, the fox, the bee and a squirrel against a hero who crosses to the
  other side 0 to 21 steps before them or stands on the aim line (60, 50 and 144 Hz); the fox's and the bee's shots
  in all four of their states (60 and 144 Hz); the hero's death to the dash of the boar, the fox, the bee and the
  king, to a shot and under a light, to the end of the death moment; a brute stunned by a wall; the bear's entrance;
  a tree felled on to the hero, out of slow motion and in it, at 60, 144 and 240 Hz, pushing him out 43 px (under
  the interpolation's jump) and 118 px; four stages under reduced
  motion, and every boss's knock-out under reduced motion at 72 Hz on three seeds (the hold of his fall begins on
  the step of the bite that knocks him out); holds begun as the hero runs, brakes, pivots or bites, at 60, 30 and
  144 Hz (a far goal opened on that step); the fox's fights on the second audit's seeds 19, 27, 44, 61 and 83. A script that moves a body by hand marks it moved for as long as a frame can still show the move. The
  hand-made runs drive the view as the session does: a `simStep` after every simulation step, the transformation
  staged once the king is between his actions; one of their tests plays the same input at 30, 48, 60 and 144 Hz and
  asks for the same clip and facing on every step both rates show. The last test lists the clips of the sheets in
  play that the suite never shows, against a list of the ones that cannot be reached there and why (`jumper.idle`:
  the frog hops again on the step it lands).
- `tests/view-session-rates.test.ts` (round 8d): the session file's runs on other displays (stages 2, 7, 9 and 10 on
  48 to 165 Hz, stages 7, 9 and 10 at 144 and 240 Hz on three more seeds), moved out to keep each file under 150 s.
- `tests/view-hero-walk-audit.test.ts` (round 8d): the hero's own walk, scripted as the auditor who found the gate
  silent played it (taps of every length against a run and from a stand, a tap back, reversals at every point of his
  speeding up and after a stop, a reversal on landing, a late tap in the air, stop and go) at 30, 60 and 144 Hz and
  two uneven patterns, and the hero hit as the boss wakes on every boss stage; zero findings.
- `tests/view-wild-audit.test.ts` (with `tests/play-audit.ts`, round 8): the same rules in the real session played
  by a player who is not the bot (`wildPlan`): in the fight he stands in the boss, keeps to his x and jumps, runs the
  arena end to end, stands still, turns every few steps mashing the bite, or fights as the bot does but never on the
  ground (every style on every boss stage); elsewhere the bot's plan is mixed with random stretches of held keys (a
  quarter, half or four fifths of the time) on all ten stages at 30, 60 and 144 Hz and with uneven frames; mortal
  runs on all ten stages; and the stage's end (`heroEnds`: knocked out on the ground, at the top of a jump, falling
  into a pit dug for it; the goal reached on the ground and in the air) at 30, 60 and 144 Hz and four uneven
  patterns. Zero findings, as for the bot.
- The clocks: the time a body stays in a pose its own motion decides (in the air, on the ground) is counted in view
  time, the time the clips advance by (none in a hold, a fraction in slow motion); a flicker, a blink, a pose's
  facing and a held lead in real time; a walk carried backwards in distance on the simulation's steps; a light, a
  wind-up's age and a landing's room in simulation steps. Every display frame carries its own length, and every rule
  reads that length, never the rate's: the session is also played with display frames of uneven length (round 7,
  the outside reviewer's fourth verdict): 60 Hz with a 50 ms frame every 53, every frame between 8 and 28 ms
  (seeded), 16.7 and 33.3 ms in turn, 120 Hz with a 58 ms frame every 97, 30 Hz ± 12 ms (seeded), on stage 1, the
  three throwers' stages and the king's; and one stalled frame of 250 ms (the pacer runs at most four steps in it and
  drops the rest; the clips advance by the whole of it) in the middle of a fight, of a light and of the
  transformation.
- What is decided on steps is the same at every display schedule (round 7b): on every simulation step two runs both
  show, each body's clip and facing (the boss's too) are the same, up to where their simulations part or the boss
  falls; 60 Hz against 48 and 144 Hz, against three uneven patterns and against stalls where they matter (in a light,
  a wind-up, a landing, on a bite that hits, in the transformation), the schedules parting after the stage's first
  moment (its steps run with the input locked on real time). Excepted: a staged pose (it plays on real time), a
  hit-stop's frames, and the clips whose clock starts on the frame that first shows them (a cast's lead-in and
  follow-through, a flinch, a landing: the step they are first drawn on may differ by the steps of that frame, up to
  4; their facing may not; the dash's frames are not compared). The effects a hit spawns are not in the rows (the effect pool's state is not recorded): that a
  hit's effect is drawn on the frame of its step is not checked by the gate.
- The hold on a turn is simulation time (what is decided on steps is the same at every schedule): two drawn turns
  may be closer on the screen than 0.15 s only by what a long frame did not draw between them (the steps of the first
  turn's frame before its last).
- What a long display frame may do: pass over what it did not draw (a clip's frame whose whole time fell inside it, a
  blink's phase), and nothing else. No frame goes back; no action begins anywhere but on its first frame unless that
  first frame's whole time (and that of every frame before the one shown) fell inside the display frame it is first
  shown on; no action is cut short unless its remaining frames' whole time fell inside the frame that follows; the
  lead a hold plays out advances a frame a display frame unless the frames between had their whole time inside it;
  the light passes over no more of its frames than the simulation time the frame showed holds whole; the fitted
  landing's (frames + 1) display frames, the blink's bound, the warning's frames and the spotlight's frame of slack
  are counted in the frames' own lengths; and no picture contradicts the body.
- The rules of motion: a walk, a run or a gallop is never carried more than 8 px against the way it is drawn facing
  in one go (measured on the body's places on the simulation's steps, which the view decides on, from the step it
  first moves the wrong way to the step it has come back 2 px), and the hero's run on the ground not at all (round 8:
  on a frame whose last step, the one it draws, carries him against his drawn facing he skids, pivots or stands; the
  earlier steps of a frame that shows several are passed over; 0.01 px of float noise, below the 0.13 px a step of
  the slowest real motion the simulation gives him); a dash has two frames; the hero's walk follows the round-8d model: a skid is a brake that has taken hold (never on more
  than two steps on which his body speeds up against the facing he is drawn with), nothing of his walk shows for a
  single simulation step between two other pictures (a skid, a pivot, an idle between two runs), a pivot gives way to
  his run before his body has gone 8 px, his drawn facing is not held against a body the simulation faces and moves
  the other way for more than two steps off his actions, he does not run again after a hold while he only coasts,
  and his flinch is drawn within 0.1 s of screen time and a frame of the step the blow landed on; two turns of an enemy, a boss
  or the hero within 0.15 s are a flicker unless the second is a walk's and the body came back 8 px the new way
  first, on the steps (at 30 Hz a frame shows every second one); the turn on the first frame of a `hurt` is the
  hit's and the hero's on the first frame of a bite the bite's, never the second turn of a flicker (the turn back
  after either is an ordinary turn); the hero's staged poses are passed over, the frame after one held against the
  frame before it and the clock running through; a standing rat or mole turns to the hero only once he is 12 px
  over; a ground cycle shows at most 0.35 s on a body that does not move (the view's 0.15 s to see it stopped and
  0.15 s more to show it standing); the picture follows its body to within 180 px/s of the simulation time a frame
  shows, a pixel of rounding and a hit's jolt; a push of the hero (a move his speeds cannot carry, by more than
  4 px) is drawn where the simulation put him on the first frame that shows it, never as a glide; the hero is drawn
  on every frame the simulation is held (a moment's hold, a hit-stop) and in play hidden by his invulnerability
  flicker for no longer than its half period (1/20 s, and a display frame) at a time. The hero's own actions keep
  their facing: every bite the player commands is drawn, from its first frame on the frame that shows its step,
  facing the side it bit (the `bite` event's `dir`; only a hurt on the same step, or a moment that poses him in a
  clip of its own, shows instead; on the step a hold begins the hold's pose plays that bite out), a pivot begins on a
  frame on which his drawn facing changed (never shown without a drawn turn), and none of a bite, a landing, a skid,
  a pivot or a fidget turns within its run (one begun again, its clock back at 0, is a new run); nothing compares an
  action's facing with the simulation's `facing` (his drawn facing is held as a walker's is, so a skid may begin
  leaning as he is drawn). The hero's `hurt` faces the blow: it is never carried forwards. An enemy's `hit` shows its
  `hurt` from its first frame on the frame of the hit (a squirrel in its throw shows the white flash only, as the
  view's `spitterHurtShows` decides it at the hit), and that `hurt` faces against the `dir` of the `enemy-hit` (towards
  whoever hit it) to its end; the simulation does not throw a rat or a mole back (its walk overwrites the knock on
  every step), so its travel is not asked about. A knocked-out enemy is flung facing the hero who hit it (from
  behind it turns once, on its first frame), a boss's body faces as he was last drawn, and neither turns after.
- The rules about shots: a release waits for its shot (the first frame at or past it is the frame the shot leaves
  on, at any display rate, and never comes without one); a shot that leaves from a pose leaves from the release
  frame, facing the way it flies; a throw's lead-in does not face away from where the simulation aims for more than
  a frame (two above 60 Hz), and is given up only when its target has gone to the other side; every shot of the
  crow, the fox and the bee is announced by its gathering light over the shot's last 0.45 s of simulation time: it
  is drawn at the place the shot is born on his drawn body (to a pixel, and the hit's jolt), within 3 px of a pixel
  of his painted body, it grows frame by frame (by the frame of its `gather` drawn, never going back, passing over no more of its frames than
  a display frame's simulation time holds whole), it shows its last frame on the frame before and
  gone on the shot's frame, when every new shot of his is drawn in front, on his body (measured where it was born:
  its first step taken back, that place on his body as it was then put on the body he is drawn with), where the
  light was (round 8, the coordinator's (e′): judged where he fired: its drawn birth, its first drawn place less the
  flight it really made since it was born, against the light's last drawn place carried by his picture's own travel
  up to the step he fired on (a picture held still carries it nowhere, one that follows his body goes with his
  body's steps up to the one before the shot's), to 2 px and the jolt, on the paint of his pose placed where his
  picture was on that step; its picture may start off its own place by what his picture was off his body, 8 px, the
  jolt and 2 px at most, and joins its path within 0.1 s of view time, never drifting further off nor closing faster
  than an ease from there would); the light has no side (it promises a shot, not a side: the simulation's aim is known on the shot's step
  only); a light always ends in its shot (unless he goes down), never on a boss asleep or one that never throws; no
  flinch shows on the frame of a shot, nor begins in the last 0.1 s before it; the king gathers his volley from its
  first frame up to his release, again from the first frame after a staged moment, and fires from his release; a
  squirrel's acorn comes out from behind it and leaves from its release facing its way, or, when the hero crosses on
  the very step, without the pose and with no follow-through after it; a summon has no gesture of the boss's: every `shoot`
  run of a boss is a cast with its shot.
- Nothing goes back: within a run of a clip that does not loop the frame shown never goes back from one display
  frame to the next (a clip begun again by a cause of its own shows its first frame again: a new run; a wind-up's
  trembling tail, an `air` chosen by the vertical speed and the squirrel's pulsing lead-in are not runs of time), and
  the gathering light's frame never goes back from one lit frame to the next. A fitted clip (a boss's flinch, cast,
  landing, wind-up taken over) passes over no frame it had display frames for: a run shown on as many display
  frames that advance the clips as it has frames shows every one of them, subject to the uneven-frame allowance below (a cast
  counted as its lead-in and its release with the follow-through; the view steps a fitted clip by display frames and
  reads no frame's length for it), and with fewer it begins on its first frame and goes forward a frame a display
  frame, passing over frames only into its last, and may end short of its last, having gone as far as its display
  frames took it (the coordinator's decision (d)).
- The ending plays out (round 8): once the stage is over or the hero is down the simulation no longer steps, and on
  the screen's time (each frame's own length, the hit-stop's frames not counted) no frame of the hero's `die`,
  `fall` or `cheer` is drawn for longer than 0.2 s and the longest frame that showed it; his knocked-out body, or his
  fall after a clear touched in the air, does not stand still in the air as long; his knocked-out body does not
  tumble on the ground for longer than 0.1 s and a frame (it bounces where it comes down); after a clear, on the
  ground, he cheers within 0.1 s and a frame. His knocked-out body's drawn frame is never more than 2 px inside a
  solid tile, tumbling or lying, and it lies with ground under its middle, or across a hole narrower than he is with
  ground under both its ends (round 8f; scenarios: at a hole's lip, against a wall, over a one-tile gap, on a stair). The hero's rows there carry his drawn body (`deathPoint`, `heroPoint`).
- The rules about moments: an action never turns, on its release neither (only a throw still on its first frame
  turns with its target); a boss's landing begins on the frame he comes down, and a slam's on the frame of its
  shockwaves (none while he sleeps); the bear, the ape and the king come down from a real fall (8 steps in the air
  and 16 px down) in their `land`, in any state, unless an attack begins within 0.1 s of the touchdown (the view
  fits a landing to the time before his next attack, faster with every frame shown, and with less than 0.1 s shows
  none) or he touches down in a charge or a dive (the dash carries him on), or inside his wind-up with less than 0.1 s
  and 0.15 s of warning left before the dash; a dash clip is one picture through its
  dash and the slide after it in his recovery or stun (no other clip takes its place and gives it back, but a
  flinch: the fox's whirl off a ledge stays a whirl); a dash or a leap is warned: the frame before
  it shows a frame of his wind-up's trembling tail (its last `sustain` frames; with no tail, its last frame), on the screen for at least 0.1 s (counted after a staged moment or the
  phase step, which begin the wind-up again; a wind-up he spent partly falling off a ledge warns with what is left
  after the touchdown: with time for each of its frames on a display frame of its own it ends on its tail, with less
  it shows what it can); a slam the phase step restarted carries him rolling, his dash's clip, from its touchdown to
  its impact (a touchdown a step before the phase step shows that one step of `land` 0 first); their landing outside a slam's recovery
  carries them no further than 20 px, or the ground their speed covers in (frames + 1) display frames or in 0.1 s where that is more (every frame of it shows on a display frame of its own, and no clip is squeezed below 0.1 s), and a step of their travel (the view fits the landing to that ground in whole steps): out of a walk they take the impact and walk on; a slam's squash is measured the same up to its impact (it shows on the step of the shockwaves). The staged transformation
  begins with the king on the ground for 3 steps, his body at rest on the last step (30 px/s, as the view measures
  it; his own walk in `idle` is no action, at any speed; seen out of a dash or a leap first: since it or its crash
  shown for 3 steps in a clip that is not his dash, his walk counting as it does everywhere else), between his actions (no charge, leap, landing, gather,
  follow-through or flinch on its way; a wind-up only if it has been shown for no longer than 0.1 s and a step of
  simulation time, counted from the frame it began on, never on its last frame; a plain fall's landing is rest from
  its second frame on, a slam's is not); the hero is waited for, the cap counted from the phase step: until 1.5 s
  after it the moment begins on the first step the king is ready and the hero stands or the king is in his wind-up
  (the hero is waited for only while the king rests), after it on the first step the king is ready with the hero
  wherever he is; a pose begun after the view's backstop is reported by name; his next attack begins with its
  wind-up; and the moment is seen: the spotlight is on him (within 3 px on the screen of the point 56 px above his
  feet under his drawn body), fully up within 0.35 s, down (below 0.1) on every frame the simulation runs (the moment's first frame, which still
  shows the step that began it, included), and from 0.2 s into the moment to its last frame his whole drawn frame
  is in the view. The entrance (`boss-intro`, round 8) begins between a boss's actions as the transformation does:
  no charge, leap, gather, landing, flinch or follow-through on its way, a wind-up only in its first 0.1 s and a step,
  no part of his light gathered (wherever he is: a flier wakes in the air). A staged pose keeps the
  hero: a moment does not turn him (his first posed frame faces as the frame before it, unless the moment poses him
  facing a named way: ハム姫's rescue, the clear), no posed frame turns, the first frame after it faces as the pose
  showed him, and what the pose covered is over for good (a bite, a hurt, a landing or a pivot shown before it does not show again
  within 0.3 s after it unless its event begins it anew; a skid is what his body does, and may begin after it when
  he brakes). Through a moment that holds the
  simulation the hero on the ground plays out on real time what he showed, from the frame it had, every frame of
  it, and then stands (one frame of an action of his shown for 0.2 s is the finding, the hold's own lead included),
  or hangs in the air where he was (a hit-stop holds everything and slow motion plays the clips slowly: neither is
  such a hold); a posed clip with planted feet stands on the ground on every frame, held frames included; on the
  first frame after a staged pose ends, an action or a clip timed from its state's start is on its first frame, and
  nothing the pose cut resumes in its middle; once the stage is over or the hero is down, a boss and every enemy keep
  their clip, frame and facing, and a light does not change.
- What the gate tolerates and exempts, rule by rule, each with the reason the simulation or the view's design
  forces it (the numbers are the gate's own: a value read from the view is read defensively, with the value agreed
  as its fallback, and the few that must not move with a broken view are not read from it at all):
  - Everywhere: `1e-6` of float slack on every comparison; rows a script moved by hand (`moved`, for as long as a
    frame can still show the move: a frame cannot show where a body was put) are not read across, nor the hero's
    once he is down or the stage is over (the view moves his body itself); a run of frames ends at a gap in them; the
    boss's, the enemies' and the piglet's frames after the end are read only by the rules about what the simulation
    holds; a body is followed from frame to frame only where it got there by its own motion (`continuous`: its speed
    over the frame's simulation time, and 6 px the simulation moves a body by itself, out of a wall or on to a
    ledge's lip, with no speed for it).
  - Planted poses: 8 px (20 for a boss: a crouch into a wind-up still has some of his walk in it, the simulation
    braking him by 0.7 a step) over a stretch on the ground; the hero's bite's first 2 frames are a lunge off his
    feet, not planted. Dashes: 1.5 times his cruising speed for at least a step of view time (a single step is the
    simulation changing its mind, a crash), never asleep (he waits where the stage put him) or on held frames (no
    time passes). Cycles: pieces of at least 5 steps, to 2 frames and 1 % (the counting's noise, a frame that shows
    two steps, the walk's held-and-eased picture), only on the ground (in the air the legs may go as they like),
    ground covered forwards only; a cycle at rest is one that moved no more than 2 px for 0.35 s of view time.
    Travelling backwards: 8 px in one go, ended by 2 px back; a jump of more than its speed and a pixel in a step is
    not its own motion; a boss's dash, skim or slam leap has no such allowance: 6 px net over the last 8 steps, 2
    steps of it facing away. Flickers: 0.15 s of real time; 8 px back the new way excuses a walk's second turn only.
  - The picture and the body: 8 px apart at most (a shaken body may be held still), 180 px/s of the frame's
    simulation time and a pixel of rounding from frame to frame, 3 px more for 0.12 s after a hit (the jolt). A body
    in the air: a planted pose 0.25 s (a bite knocks an enemy up for less), a landing 0.1 s, after 0.5 s of settling
    where the stage put it, never for a boss asleep; an air pose on the ground 0.1 s; a rat or a mole walks off a
    ledge for 0.1 s before it is walking on air (a short drop is not drawn as a fall); a minion's first 6 frames
    jump no more than 4 px beyond its speed (a step at least: the frame a hit-stop begins on shows the true
    places), and it may be drawn inside a solid there until the simulation's next step pushes it out; a lying body
    moves no more than 0.01 px; a falling rat or mole turns at most once, towards where it has gone (1 px back).
  - Shots: the light may begin a step late; its place to a pixel (3 px more while a hit jolts him), on his paint
    within 3 px, its growth by the frame drawn (a display frame may pass over the light's frames its own simulation time held
    whole); a new shot within 2 px of where the light was, besides what both travel
    in the frame and the jolt; a shot born on the hero is not drawn (the simulation drops it before any frame, on a
    hero who cannot be hurt then: the hero's half box and 16 px are where it is born on him); a new shot is
    measured where it was born (the simulation moves it on its birth step, before any frame shows it); a flinch may
    run up to the frame before a shot if it began more than 0.1 s before it (the view fits it to the time there is);
    a release looked for over 60 frames; a lead-in faces away for a frame (two above 60 Hz: a frame may still show
    the step before), never judged inside the aim zone (the simulation's aim flips there as the bodies move); a cast
    held to its aim only with the hero more than a step of the shooter's travel and 2 px to one side; the king's
    volley is a fan (its facing is not compared); a squirrel's acorn may leave without its pose when the hero
    crosses on that very step.
  - Actions: a run of an action at the start of a recording is not judged for its first frame, nor one at its end
    for its last; an enemy's or a boss's action may be cut by a hit, the transformation, a stun or the ground
    giving way under him, and by the same action again from its start; a lead-in may be given up only with its
    target gone to the other side; a plain fall's landing may be cut by a staged pose once its impact has shown;
    the hero's own actions are cut by the player's next input; the hero's stuck-frame limit is 0.2 s of real time
    on bite, land, skid, turn, fidget and hurt.
  - Facing: a turn on a throw's first frame towards its target (a new beginning); the turn on a hurt's first frame
    and on a bite's (the blow and the bite turn the body); a knocked-out enemy turned once, on its first frame,
    towards the hero (1 px of `heroDx` is no side); a standing rat or mole turns with the hero 12 px over (the view's
    dead zone, as agreed: not read from the view); a pivot, a skid, a landing begun with the facing he is drawn with
    (his drawn facing is held); an enemy's hurt is judged by the hit's `dir` read on its first frame or the frame
    before (the hit's step and the hurt's first frame can be a frame apart where a frame shows two steps).
  - Moments: the wind-up's first 0.1 s and a step (counted on the wind-up shown); the king's walk in `idle`; 30 px/s
    on the last step as at rest; 3 steps on the ground; a plain fall's landing from its second frame; no landing
    for a heavy fall with an attack within 0.1 s or in a charge or a dive (the landing is fitted to that time; a
    charge is the attack itself); a slam that slid him off a ledge falls from its impact; a landing may begin on the
    frame of a slam's shockwaves; the backstop reported from 3 s less 3 steps of simulation time (the step the
    director decides on and the frames that show it); the hero's poses of a moment's own (his fright at a chase's
    start, his cheer) are the moment's, and only ハム姫's rescue and the clear may turn him: told by the moment's
    name (`princess-free`, `clear`), on its first posed frame only (as it begins, or as one pose hands over to it),
    so a hold's own pose (whose moments are none of those) can never turn him under that cover, nor a named moment
    after its first frame; what a pose covered is
    looked for over 0.3 s after it (a skid and a pivot have no event to begin them anew); the spotlight 3 px on the
    screen, fully up within 0.35 s and a frame, down below 0.1, the king's whole frame in the view from the 0.2 s the
    camera takes to bring him in to the moment's last frame; the bite of a hold's first step turns him on the pose's
    first frame (the bite's turn); a dash's warning 0.1 s less a step, the counting begun again after a staged
    moment or the phase step (both restart the wind-up in the simulation), and none asked of a wind-up whose state
    he spent partly in the air (the simulation runs its clock while he falls: the warning is what is left after the
    touchdown); a landing inside a wind-up only with 0.1 s and 0.15 s of warning left (the view's `WINDUP_WARNING`);
    a slam the phase step restarted rolls to its impact (no landing at its touchdown), and shows its squash before the
    impact only once his body is at rest there (a wall stopped him or a pose holds him; carried along he rolls), and a touchdown one step before
    the phase step shows one step of its squash before the roll (it cannot be told beforehand); 3 steps out of a
    dash before the roar (his walk counts: in phase 2 the king is never slow); a flinch may break a dash (a hit shows its
    `hurt` and the dash goes on).
  - Pushes: 4 px past what his speeds carry (the view's 2 px, and 2 px for a frame that shows two steps, whose
    speeds are those after them), drawn to a pixel. The blink: 1/20 s and a display frame.
  - Round 7 (display frames of uneven length): the blink hides him on the screen (from the frame that first draws
    him hidden to the one that draws him again) no longer than its half period and the longest frame in it, and a
    phase more for every frame longer than a phase (it may pass over a whole shown phase); a throw's lead-in is given
    up, and a cast held to its aim, by the side the simulation aims from on the step (`aimDx`), not the interpolated
    frame; the hero's skid counts as his run for the 8 px a turn needs (a turn his run made, first drawn as the skid
    that begins with his drawn facing); an enemy's events of a frame it is not drawn on go to its next row; a
    knocked-out body is judged against the hero's true place, not an interpolated one; a shot's birth is allowed the
    move his drawing made from the light's frame to the shot's (a crash on that step leaves him a speed of 0).
  - Round 8 (a player who is not the bot; each decided by the coordinator, the reason as given): a flinch may show on
    the frame of a shot when a hit on that very frame begins it (a falling tree hits the crow as he fires: his cast
    and his light were shown whole), never one begun before; a knocked-out enemy's tumble (`defeat` before its lying
    frame) and the knocked-out hero's (`die` from `DIE_TUMBLE_FIRST` to `DIE_BOUNCE`) may cycle back to their first
    tumbling frame while the drawn body has no ground under it (a body that falls far tumbles on: the view's design);
    an enemy knocked up again in the air counts its time in the air from the step after the last knock, in
    simulation steps (a squirrel in its throw stung twice by a hive's bees keeps its throw, the hit being the white
    flash; the knock's flight is the simulation's, the same at 60 and 144 Hz); a shot is a boss's only
    if he fired it (the recorder books a new shot on whoever the step's `spit` or `boss-shoot` event nearest its birth
    place names, and holds it to that shooter's drawing only); a shot gone on the step it is born, the hero's `hurt`
    on its frame, or ended in a solid on that step (`shot-hit` on its frame: a tree felled on that very step), is not
    drawn (as one born on him: its light was shown whole and its end is shown); a boss's landing may be cut by his body leaving the ground (a
    dash sliding him off the next stair: `dash taken up again` still holds the dash); a cast begun on one of the
    steps a frame shows is judged by the aim on every one of them (`aims`), not the last only; and a fitted clip's
    count of display frames is of those that advance the clips; advancing display frames whose lengths differ by more
    than one fifth may leave a fitted run one frame short or pass over
    one frame; even frames get no such allowance. A long display frame after a fitted run may cover the remaining
    frames' full time. A stand that coasts after a hold may travel up to 10 px, the distance of a full-speed stop;
    the other planted poses keep their limits. A pivot starts at its first simulation step and a discontinuous step resets its measurement.
    Round 8d: the hero's turn toward the way his
    body goes and a brake's turn are causes in `facing flickers`; the light on a flinch's frames is held to 5 px of
    his paint (as the art's own test holds the bee's `hurt`); a new shot's paint is judged against his pose as it
    stood when he fired (the frame before, carried as his picture was), the jolt and pose of the shot's own frame
    aside A turn toward his travel is no cause while a knock-back still carries him (0.38 s after a
    `hurt`: the knock moves him whatever the keys say, round 8f); a skid or pivot cut after one step by his own bite or
    jump, a hurt or a staged moment is the action's, and a single-step picture whose next frame shows several steps is
    none (its second step may be there); a pivot is measured from where the simulation put him on its first step; a
    drive is faster than 20 px/s (12 in water); a hold is a moment that posed him; the steps a long frame hides are
    not held against his drive; a bite of his own begun on or after a blow wins over its flinch (DESIGN §4). Traced with the view on its rows: a rat or a mole turning in the air is
    measured on every step its frames showed, the first air frame's all (a long frame shows the end of its hurt and
    its first steps in the air at once, and the view turns it from where the hurt ended); a turn of the hero counts as
    his run's when a step of its frame before the last had him on the ground and his body had gone 8 px (the frame
    draws the jump that came after); an enemy's flinch faces the frame's last blow (two on one step, a bite and a
    sting, knock it back with the last one's `dir`: the flinch shows that knock-back); (round 8d: the knocked-out hero
    lies on the ground under his middle, never over a hole: 8b's reading by his box is withdrawn); a hit that ends a
    staged pose
    (ハム姫's cheer runs the simulation) turns him to face the blow on its hurt's first frame, the blow's own turn.
  - The suite's own: the frog's `idle` is never shown (the simulation hops it again on the step it lands); the
    backstop scenario's two findings (the king held in his slam by hand: expected there, and reported by name).
- `tests/play-audit-rules.test.ts`: the gate tests itself. Every rule of the audit is fed rows built by hand that
  break it the way the defect would show, and must name its finding; the same rows unbroken give none; a rule
  without such a case fails the file.
- `tests/ui-story-motion.test.ts`: the story pictures. Over the opening, every stage's story, the ending and the
  credits: every figure whose clip has a stride is tracked by a camera that travels, dashes or patrols (nobody runs
  on the spot); sampled every 1/60 s, the ground that passes under such a figure equals what its clip advances by;
  a patrol faces the way it goes; a rider's feet stay on her mount's back in every frame of the real art; the
  ground strip of a tracking shot covers every frame shape with tiles the shot has asked for; under reduced motion
  nothing travels.
- `node scripts/hoshi-no-hamham-review.mjs` writes the review kit to `.build/hoshi-no-hamham-review/`: every screen
  at four viewports with its tallest empty band, wrapped headings, text under a focus frame and cut lines, the
  staged moments frame by frame
  on the desktop and on an upright phone, the art, the motion and the sound, as numbers that read without the
  images.
