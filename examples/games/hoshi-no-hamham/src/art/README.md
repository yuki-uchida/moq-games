# 星のハムハム — how the art is made

Every picture in the game is drawn by code into indexed rasters. This guide is the working method for adding or
changing a sheet, a tileset or a backdrop. Read it together with `../../DESIGN.md` (sections 3 and 4),
`contract.ts` (what has to exist), `palette.ts` and `raster.ts`.

**Characters have their own standard: `CHARACTERS.md`.** Everything alive (the hero and his family, the gang,
the bosses, the piglet, the portraits) is built on the rig toolkit (`rig.ts`, `motion.ts`) with `chars/hero.ts`
and `chars/bosses/wolf.ts` as the references; the rules of the style below about `ball()`, `shadeEdges()` and
frame lists describe props, terrain, effects and interface art.

## The loop

1. Find your sheet in `contract.ts`: clip names, frame counts, frame size, anchor, fps.
2. Draw in your module and export `sheets` (or `terrain` / `backdrop`). The registry (`index.ts`) picks it up;
   a clip nobody draws makes `sheet(id)` throw, and `tests/art-complete.test.ts` fails.
3. Export and **look at the picture**:

   ```sh
   node scripts/hoshi-no-hamham-art.mjs --scale 6 --anim idle,run hero   # a close look at two clips
   node scripts/hoshi-no-hamham-art.mjs --scale 3 hero                   # the whole sheet
   node scripts/hoshi-no-hamham-art.mjs terrain:meadow scene:meadow      # terrain sample and a composed scene
   node scripts/hoshi-no-hamham-art.mjs --draft --gif --onion --motion hero   # see the animation: GIFs, onion skins, numbers
   node scripts/hoshi-no-hamham-art.mjs --draft --game hero               # every clip at 2x (game size) on four grounds
   node scripts/hoshi-no-hamham-art.mjs --draft --lineup                  # the cast side by side on one ground line
   node scripts/hoshi-no-hamham-art.mjs --draft --stage cave --stage castle hero   # the clips over a world's backdrop
   ```

   Output goes to `.build/hoshi-no-hamham-art/`: `<id>.png` (enlarged, anchor marked in magenta), `<id>@1.png`
   (native size on the grounds of three worlds), `<id>/<clip>.gif` and `<id>/all.gif` (`--gif`, real timing), `<id>.onion.png` (`--onion`), `<id>.motion.md` (`--motion`, thresholds in `quality.ts`), `<id>@2.png` (`--game`), `lineup.png` and `lineup.txt` (`--lineup`), `<id>@<theme>.png` (`--stage`), `<id>.txt` (row index), `pending.txt` (what is still undrawn, or `nothing pending`).
   Open the PNGs and judge them as a player would. Nobody ships pixel art they have not looked at: expect five to
   ten rounds of draw → export → look → fix per character.

4. `npx vitest run examples/games/hoshi-no-hamham/tests/art-contract.test.ts` must pass.

## Rules of the style

- **Light from the top-left.** Use `ball()` for round volumes and `shadeEdges()` for flat shapes so every prop
  shares one light (characters: `cel()`, see `CHARACTERS.md`). Three or four values per material, in clean
  clusters. No single-pixel noise, no dithering inside sprites, no pillow shading (dark all around a light
  middle).
- **Ramps** are `[highlight, base, shade, deep, line]`. Paint with `base`; let shading pick the others.
  Shadows are already hue-shifted in the ramp, so never darken a colour by hand. Limbs behind the body use
  `farRamp(ramp)`. A prop uses 24 colours or fewer, a frame of a character 28.
- **Selective outline.** Build characters with `Painter`: each part is drawn on its own layer and outlined with a
  dark of its own material, so overlapping parts get inner contours for free. Paint details that belong to a part
  (belly, muzzle, stripes, eyes) with `line: false` or directly onto the part.
- **Faces carry the emotion.** Eyes are tall dark ovals with one white highlight, stamped from hand-placed pixel
  grids (`Raster.stamp`); brows and mouth change with the pose. A face must read at 1×.
- **Silhouette first.** Fill the silhouette with one colour in your head: can you still tell who it is and what
  it is doing? Give every character one signature shape (ears, tail, tusks, wings, hat).
- **Stay inside the frame** with at least one empty pixel on every side, feet on the anchor row. The visible body
  is about as wide as the physics box listed in `contract.ts`.
- **Characters must pop** on grass green, cave violet and brick red (`<id>@1.png` shows all three). Ground and
  backdrop colours are calm; characters are saturated and rimmed dark.

## Animation

Characters are **pose-parametric**: one draw function takes a pose object, and a clip is a list of poses. A
cycle is computed from its phase; an action is a few key poses on a `track()` (`motion.ts`) sampled once per
frame; the soft parts follow the body a beat late through `lag()`.

```ts
const bob = Array.from({ length: 8 }, (_, i) => [1, 0, 1, 2][i % 4]) // contact, down, passing, up
const late = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true }) // the same curve, a beat behind
const run = bob.map((b, i) =>
  drawHam(hamPose({ y: 3 + b, lean: 12, earN: 24 + late[i] * 8, footN: STRIDE[i], footF: STRIDE[(i + 4) % 8] }))
)
```

- Every frame of a clip differs from its neighbours, and a loop closes without a pop (the last frame leads into
  the first). The contract test rejects repeated frames.
- **Anticipation → action → follow-through.** Frame 0 of an enemy's or a boss's attack winds up the other way. The
  hero's `bite` is the exception: a player's attack lands on the press, so it opens on the lunge. Ears, tails,
  scarves, capes and cheeks lag behind the body and settle a frame or two later.
- **Squash and stretch** keep volume: wider when shorter, narrower when taller.
- **Walk and run cycles** have contact, down, passing and up poses; the body bobs 1–2 px; feet alternate; arms
  swing against the legs. Four-legged runs gather and extend.
- **Weight.** Big characters move fewer pixels per frame, sink on landing and recover slowly.
- Use `hold` to linger on key poses instead of adding frames the contract does not have. A hold is timing the view
  must know: list the same numbers as `hold` on the clip's spec in `contract.ts` (bosses: `BOSS_HOLD`), or the
  contract test fails and the view cuts the clip short.
- Wind-ups (`windup`) must be readable in one glance: the whole body commits to a direction.

## Terrain and backdrops

- A terrain module exports `terrain: { tile, decor }`. `tile(q)` paints one 64×64 tile from its 8 neighbours
  (`q.around`), deterministically; cache by a key of kind + neighbour mask + variant. Solid ground is fully opaque.
  Exposed tops get a cap, sides a rim, undersides a shadow; buried tiles get a calm fill with low-contrast detail
  that does not repeat visibly (vary by `noiseAt(q.tx, q.ty)`), and tiles must join without seams.
- Diggable dirt uses the `clay` ramp with cracks in every world: it has to read as "bite me" next to any ground.
- Backdrops export `backdrop(): { sky, layers, ambience }`: a 640×360 sky and 3–5 layers, 640 px wide, tiling
  horizontally, lighter and less saturated with distance. Nothing in a backdrop may be mistaken for a platform,
  a prop or an enemy.

## Before you call it done

- [ ] You looked at the enlarged sheet and at the 1× sheet, after the last change.
- [ ] The silhouette, the face and the action read at 1× on all three grounds.
- [ ] No stray pixels, broken outlines, clipped limbs or frames touching the frame edge.
- [ ] Loops close; attacks anticipate and follow through; nothing slides.
- [ ] A walk, a run or a gallop has its `stride` in the contract and its `footfalls` table, and
      `tests/art-footfall.test.ts` passes: on the ground ruler (`node scripts/hoshi-no-hamham-footfall.mjs`) every
      foot that is down stays on one plumb line. A clip the game shows on a moving body without a stride is drawn
      off the ground, rolling or sliding, and says so in the contract (`travel`).
- [ ] The sheet looks like it belongs next to `hero` (same light, outline weight, eye style, saturation).
- [ ] `tests/art-contract.test.ts` passes and `pending.txt` no longer lists your sheets; for a character,
      `tests/art-rig-quality.test.ts` passes too.
