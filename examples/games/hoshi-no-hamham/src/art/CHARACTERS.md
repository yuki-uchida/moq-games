# 星のハムハム — the character standard

How every living thing in the game is designed, drawn and animated. Read it with `README.md` (the art pipeline),
`rig.ts` and `motion.ts` (the tools), `chars/hero.ts` (the reference for the small cast) and
`chars/bosses/wolf.ts` (the reference for a boss). The bar is a commercial 2D action game: a player who pauses on
any frame sees a drawing a pixel artist would sign, and a player who watches sees characters that are alive.

## 1. What changed, and why

The first cast was assembled from shaded balls and constant-width bars: a hero who was one ball with a face on its
side, limbs like sausages, four-band "plastic" shading on every part, knock-outs made by turning a finished
picture, two-frame idles. It read, but it looked assembled rather than drawn. The standard below replaces it.

| before                                        | now                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------- |
| one ball with features stuck on               | a designed build: head, torso, limbs, signature accessories           |
| `ball()` on every part: four bands, big sheen | `cel()`: one clean form shadow per silhouette, small deliberate sheen |
| `bar()` limbs of one width, round blobs       | tapered `capsule()` limbs with joints, shaped paws, hands and feet    |
| ink lines everywhere parts overlap            | `Painter(..., { soft: true })`: ink on the silhouette, colour inside  |
| `Raster.rotate()` for tumbles                 | the rig turns the parts; the light and the pixels stay clean          |
| frames typed in one by one, 2–4 frame loops   | key poses on a `track()`, soft parts on `follow()`, 6–8 frame loops   |

## 2. Design

**Silhouette first.** Fill the character with one colour: who is it, which way does it face, what is it doing?
Every character owns one or two shapes nobody else has (the hero: round ears + head tuft + swallowtail scarf).
Keep negative space between head, limbs, tail and accessories; avoid a single lump.

**Big head, big face.** Characters are 40–70 px tall on screen. The head is where the player looks: the small
cast is two heads tall (head ≥ body), bosses about three. Eyes sit low on the head and are large; the muzzle is
short. The face must read at 1× — check `@1` and `@2` exports, not only the enlarged sheet.

**Three-quarter view, facing right.** Both eyes show, the far one a pixel narrower and nearer the edge; the far
ear, arm and leg are a ramp step darker (`farRamp`). The view mirrors frames for left.

**One family.** The same light (top-left, `LIGHT_DIR`), the same line (ink silhouette, soft inner contours), the
same eye language (dark, tall, one bright highlight at the top-left and a small warm glint low on the other side),
the same saturation. The gang (ばくろ団) all wear the gang's red (`R.bandana`: a neckerchief, a head scarf, a cap
band, an armband, a sash; the cloth and its knot are in `chars/enemies/kit.ts`). The four hamsters share one
build: `chars/hamster.ts` draws all of them (`drawHamster(look, pose, size)`), a look being the colours, the
proportions, the face stamps and the accessories of one of them, so a change to the build reaches the hero, the
princess, the mother, the king and their portraits together.

**The portrait is the character.** The 32×32 portraits (`ui/faces.ts`) and the sprite show the same design:
colours, markings, headgear, scars. They are drawn from the same ramps and, for the hamsters, by the same
function at portrait scale. When a sprite changes, its portrait changes with it.

**Materials.** Fur: soft cel shadow, a few tufts that break the silhouette (cheek, chest, tail, crest) drawn as
hand-placed stamps so they never flicker. Cloth: a rim of light on the lit edge, a fold or two. Metal and gems:
a hard highlight and a dark core. Never more than 28 colours in a frame.

## 3. Construction with the rig

```ts
const g = new Painter(64, 64, { soft: true })
const ground = Frame.at(32 + pose.x, 60) // the anchor: feet stand here
const root = ground.child(0, -pose.y) // the pelvis rides up and down; planted feet do not
const torso = root.child(-1, -2, pose.lean, k, 1 / k)
const head = torso.child(1.5 + pose.head[0], -17 - pose.head[1], pose.nod)
g.add(0, (l) => {
  // one part = one layer = one outline
  fill(l, torso, union(egg(0, -9, 10, 9.5, 8.5), oval(-0.5, -5.5, 11, 6.2)), PINK[1])
  tint(l, torso, oval(5, -6.5, 7, 7.2), CREAM[1]) // patches never leave the silhouette
  smooth(l) // even out the stair-steps
  cel(l, { shade: 2.6 }) // one form shadow for the whole part
  shadow(l, head.moved(0.5, 2.5), headShape()) // the head's cast shadow on the chest
})
```

- **Parts are frames.** Give every part that moves on its own a `Frame` hanging on its parent: torso on the
  pelvis, head on the neck, ears on the head, hands on the arms. Pose values turn and move frames; shapes are
  written once, in the part's own units.
- **Build a silhouette, then shade it once.** `union()` the volumes of a part (skull + cheeks, chest + belly),
  `fill` it in the base colour, `tint` the markings, `smooth`, then one `cel`. Depths that work: `shade` ≈ 8–10 %
  of the part's height (2.5–3.5 px on a 64 px character's head, 5–8 px on a boss body), `deep` about a third of
  that and only on big forms, `rim` 1 px on cloth, metal and ears. Add `shadow()` where one part sits on another
  and at most one small `sheen()` per big form. Do not use `ball()`, `shadeEdges()` or `bar()` on characters.
- **Limbs taper and bend.** `capsule(a, b, ra, rb)` with `ra > rb`, `joint()` for elbows and knees on anything
  with a visible upper and lower limb, a shaped paw, hand, hoof or claw at the end (never a bare circle).
- **Small sharp details are stamps.** Eyes, brows, mouths, teeth, tufts, claws, emblems: hand-placed pixel grids
  put down with `stampAt(l, frame, rows, u, v, key)`. They stay crisp while the part tilts, and turn by quarter
  turns in a tumble. A polygon three pixels wide re-rasterises differently in every frame: that is flicker.
  Strokes in a stamp are two pixels wide where they leave the silhouette (a tuft is three chunky locks, not a
  bundle of one-pixel hairs: single-pixel spikes read as noise).
- **Details stay on their part.** Anything painted onto a part after shading (eyes, scars, stripes, blush, mouth
  lines) goes through `within(l, draw)` so it cannot leave the silhouette; pass `true` as the third argument for
  light details, which must not sit on the very edge where the outline belongs.
- **Whole pixels unless you mean it.** Move parts by whole pixels where a part should simply shift; let squash,
  lean and limb angles be continuous. After a change, flip between neighbouring frames: if the contour "boils"
  (pixels toggling on an edge that should be still), round that part's position.
- **Depth.** Far limbs and the far ear behind the body, then tail, body, near leg, head, face, near arm. Keep the
  list in the file's header comment.
- **Tumbles turn the rig.** A knocked-out character is the same rig with its root frame turned (0°, 90°, 180°,
  270° keys are enough at 10–12 fps), re-lit by `cel` on the spot, limbs flailing by their own pose values.
  `Raster.rotate()` is not used for characters.
- **Lying poses are designed, not turned.** The last frames of a knock-out are a pose of their own: on the back,
  belly up and brightest, the head tipped back at one end with the face still readable (dizzy eyes, tongue), the
  feet in the air at the other, arms flopped, tail and scarf limp on the ground. If the turned rig does not read
  as that at native size, pose the parts by hand for those frames.
- **Limbs may cheat.** A two-heads-tall character has arms too short to reach above its head. When a pose needs
  the reach (a cheer, a fall, a throw), let the arm grow up to half again as long for those frames and make the
  paw a little bigger: the pose must read; anatomy is negotiable.

### Big furry bodies (bosses, and anything over about 40 px of coat)

The reference is the wolf (`chars/bosses/wolf.ts`). A coat that is one flat colour with a smooth shadow looks like
vinyl, and a body assembled from separately outlined haunch, shoulder, ribs and ruff looks cracked.

```ts
g.add(0, (l) => {
  // chest, ribs, haunch, the shoulder and the thigh: ONE silhouette
  fill(l, ID, union(chest, ribs, haunch, thigh, shoulder, neck), FUR[1])
  tint(l, ID, union(oval(86, 90, 7, 10.5), capsule([80, 100], [53, 97], 4.5, 3)), PALE[1]) // pale underside
  stampAt(l, ID, TUFT_UP, 64.5, 67, { f: FUR[1] }) // hackles, locks
  smooth(l)
  mantle(l, FUR[1], SADDLE[1], { depth: 8, tooth: 4, pitch: 5, origin }) // the darker back, with a fur edge
  cel(l, { shade: 10, deep: 3.5, rim: 2.2, tooth: 3, pitch: 5, origin }) // fur-toothed shadow, lit top edge
  shadow(l, ID, shoulderCrease) // muscles are soft shadows, not lines
})
```

- **One body.** Everything that is under one skin is one `union` shaded once: the upper legs belong to the body;
  only what hangs free below it (forearm, shank, paw) is a part of its own. Muscles and folds are `shadow()`
  creases, never outlines.
- **Three values on the coat.** A lit top edge (`rim` 2–3 px), the coat's base, a form shadow underneath
  (`shade` about a third of the body's height, `deep` a third of that). Squint: the body must read as a solid
  with a top, a side and an underside.
- **Two coat colours.** A second, darker ramp lies on the back, the crown and the top of the tail (`mantle`), a
  pale one on the chest, belly, cheeks and muzzle (`tint`). Their borders are fur: toothed, never a smooth curve.
- **Teeth on the shadow.** `tooth` 2–4 and `pitch` 4–6 on `cel` and `mantle` cut the shadow's edge into locks.
  Pass `origin` (a point that moves with the part) so the locks travel with the fur instead of crawling over it.
- **The head is the actor.** About a quarter of the body's length, drawn larger than nature; a brow that can
  scowl, an eye with a white, an iris and a pupil, a mouth that opens on a row of teeth. A boss with a closed
  mouth and a dot for an eye has no menace.
- **Cloth is flat and folds.** A scarf, a cape or a sash is a `ribbon` that widens toward a cut end (a swallowtail,
  a fringe), with a lit edge and one fold line: never a tube of constant width.

## 4. Faces

Eyes are stamps in three sizes (near eye about 6×8 on the small cast, 8×10 on bosses): open, half, closed,
happy (arcs), wide, hurt (> <), angry (flat top lid), dizzy. Brows are two or three pixels and do most of the
acting. Mouths: closed smile (with the front teeth showing on the hero), open, wide, gritted, shouting, tongue
out. Every clip has an expression on purpose, and it changes inside the clip: anticipation narrows the eyes, the
action opens the mouth, the recovery relaxes. A blink is a held closed-eye frame, never a jump in the pose.

## 5. Animation

Clips, frame counts and timing: `contract.ts`. A clip is a few **key poses** on a `track()`; the frames
in between are sampled, so more frames cost nothing but must still be looked at.

- **Timing.** Fast out, slow in. Attacks: a held anticipation, one or two frames of travel, a held impact, a long
  settle (`hold` in the Anim, `ease.out` into poses, `ease.outBack` for overshoot). Idle: one breath per second,
  never a metronome: offset the parts. A `hold` is part of the contract: list it on the clip's spec in
  `contract.ts` too (the view times every clip from the contract, and the contract test rejects a hold it does not
  list). The hero's `bite` has no wind-up: a player's attack lands on the press, so it opens on the lunge.
- **Squash and stretch** keep volume (`squash` scales x up while y goes down). Stretch into speed, squash on
  contact, overshoot on the rebound.
- **Overlap.** Nothing soft moves with the body. Drive ears, tufts, tails, cheeks, scarves, capes, hats and held
  objects with `lag()` / `follow()` from the body's motion so they start late, overshoot and settle. A scarf
  streams in a run, whips forward in a skid, hangs after a landing.
- **Arcs and weight.** Hands, feet and heads travel on curves. Small characters are quick and bouncy; bosses move
  fewer pixels per frame, sink into every landing and recover slowly.
- **Cycles.** Walks and runs have contact, down, passing and up; the body is lowest just after contact and
  highest at passing or push-off; arms swing against the legs; a planted foot stays on the ground row and travels
  back at the speed of the body. Loops close: the last frame leads into the first.
- **Wind-ups are telegraphs.** The whole body commits to a direction and the pose is readable in one glance;
  the last two frames tremble (`sustain: 2`) for as long as the game holds them.
- **Knock-outs are drawn.** Hit (stretched, eyes > <), flung back turning, the landing with a bounce, limp;
  bosses end out cold with something still moving (`sustain`).
- **Smears.** One frame of a very fast move may stretch along its path (a long body, doubled paws, speed lines in
  the character's own colours) — one frame, never more.
- **Draw for states the game really reaches.** A clip, and every frame of it, is drawn for something the
  simulation really produces and for as long as it lasts there (the frog is on the ground for one step, so its
  landing is one frame). `tests/view-clip-coverage.test.ts` plays every stage with the bot and fails on a clip
  the view never selects, unless it is listed there with its reason (staging, the story pictures).
- **No twins, no noise.** Every frame differs from its neighbours for a reason; nothing jitters by a pixel back
  and forth.

## 6. The loop

1. Read your character's row in `../../DESIGN.md` (section 3), its spec in `contract.ts` and its portrait.
2. Draw the standing pose first. Export and look:

   ```sh
   node scripts/hoshi-no-hamham-art.mjs --out .build/art-<id> --scale 8 --anim idle <id>   # close up
   node scripts/hoshi-no-hamham-art.mjs --out .build/art-<id> --scale 4 <id>               # whole sheet
   ```

   `<id>.png` is the enlarged sheet, `<id>@1.png` the native size on three grounds. Judge both. Expect ten or
   more rounds of draw → export → look → fix for the standing pose, and several for every clip. `--draft` builds
   only the sheets you name, so a round takes a second or two.

3. Add the pose values the clips need, then author the clips from key poses. Look at every frame, then at
   neighbours in pairs.
4. `npx vitest run examples/games/hoshi-no-hamham/tests/art-<your test>.test.ts`, then run
   `tests/art-contract.test.ts`.

5. `npx vitest run examples/games/hoshi-no-hamham/tests/art-rig-quality.test.ts` checks every character sheet for
   stray pixels, light pixels on the outline, colour count, loop seams, twin frames and contour flicker;
   `node scripts/hoshi-no-hamham-art.mjs --draft --out .build/art-<id> --gif --onion --motion <id>` writes animated
   previews, onion-skin sheets and the same numbers per frame; `--game` shows every clip at the size the game
   draws it, `--stage <theme>` over a world's backdrop, `--lineup` the whole cast on one ground line.

**Done means:** the silhouette reads in one colour; the face reads at 1× on grass, cave and brick; no stray
pixel, broken outline or limb touching the cell edge; loops close; attacks anticipate and follow through; soft
parts overlap; the knock-out is drawn; the sheet stands next to `hero` as the same game.
