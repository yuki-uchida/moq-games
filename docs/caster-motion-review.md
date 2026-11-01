# Star Mage, Frost Caster and Flower Healer motion revision

The Star Mage gathers the staff back with a lowered pelvis and turning chest, drives the star forward at 520 ms, holds the extension, then settles. The Flower Healer bows into a raised flower, opens the free palm and flower staff at 600 ms, holds the offering, then returns. Frost keeps its existing upper-body attack and receives stable legs for attack and walk.

## Contract and cause

- Existing Y-up GLBs contain a 16-joint rig, a separate rigid staff control and authored blink morphs/material adapters. Their geometry, textures, material adapters, inverse binds, rest nodes and source files are preserved. Original Blender production scenes were unavailable in this checkout; no original authoring scene is claimed.
- Frost's original walk/attack lower-body poses fold the knees and rotate the boots through severe angles. The rendered attack sheet showed flat, horizontal boot shapes. Constant-length two-bone IK now maintains ankle targets and boot orientation, with a 0.055-unit stride and 0.025-unit swing lift for walking.
- Healer garment vertices above y=-0.70 had thigh/shin influences. 1,703 leg influence slots in the garment envelope are reassigned to pelvis; real lower-leg and boot influences remain. The garment follows the pelvis without being split by opposite legs. This is authored skinning, not cloth simulation.
- Staff spell animation pivots around the actual left-hand grip; the arm is solved to that moving grip with unchanged segment lengths. Body movement supports the gesture and the ankles remain planted.
- Unchanged event clocks: Mage 960/520 ms, Frost 768/416 ms, Healer 960/600 ms (duration/release); projectile flight 220 ms. Gameplay damage, targeting, ranges and cooldowns are untouched. Shared animation playback code is untouched.

## Reproduce

```sh
node scripts/refine-caster-motions.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python scripts/archive-caster-blender.py
npm run dev -- --host 127.0.0.1 --port 5185
node scripts/review-caster-motions.mjs
CASTER_REVIEW_BASELINE=1 node scripts/review-caster-motions.mjs
npx vitest run tests/caster-motion-v3.test.ts --maxWorkers=1
npx playwright test --config playwright.casters.config.ts
```

`refine-caster-motions.mjs` preserves original bytes in ignored `local-assets/caster-v3/<role>/original.glb`, writes separate v3 derivatives, and registers public hashes. `scripts/caster-v3-provenance.json` records exact source/output hashes. Reconstructed, packed, editable Blender 5.2.3 LTS review copies and inventories are kept under `local-assets/caster-v3/<role>/`. They are reimports of the final runtime derivatives; the byte-preserving procedural source is the JavaScript generator. They are intentionally not round-tripped through Blender's exporter, which could rewrite accepted geometry/material attributes.

## Visual review evidence

Local evidence is under `.generated/caster-review/`, `.generated/caster-review-baseline/` and `test-results/caster-runtime/`. Earlier body-refinement evidence is preserved in `.generated/caster-review-before-body-refinement/`.

1. **Native acting:** phase strips at the game catalog scale and 2x scale. Inspected the preserved Mage/Healer source atlases and the original GLB baseline. The first Healer gesture hid the flower behind hair; changed it to raise, then open laterally. Strengthened pelvis/chest/head after native review showed too little body effort.
2. **Timing:** explicit sequential frames at 0, 160, 320, 420, 520, 600, 720, 840 and 960 ms, covering gathering, each release clock, hold and recovery. Native source comparison uses the source JSON frame durations on the same clock and facing. Frost's action ends at 768 ms; later diagnostic samples are outside its gameplay action interval.
3. **Continuity:** front/side/back views plus actual EXTRA playback. Inspected grips, torso/head joins, boot shape and skirt hem. The source-independent IK tests sample the lower-body transforms across the clips and verify planted spell ankles, boot orientation and unchanged bind/mesh attributes.
4. **Directions and walking:** eight facings at release; walking at quarter/three-quarter phase on green and light backgrounds, and sequential walk samples. EXTRA tests select idle/walk/spell, play at 1x, scrub and rotate with real controls. No full-body sheet is substituted for the models.
5. **Actual game:** restored a valid paid-roster campaign, observed actual Mage/Frost attacks, Frost slow status, and Healer healing a wounded Mage. Captured 16 frames and diagnostics over approximately 1–8 seconds of live simulation. The Healer appeared in `heal` at 5.167 s (asset 150 ms) and 5.633 s (asset 617 ms), then returned to idle. Inspected the corresponding game frames.

Actual temporal inspection uses sequential PNG frames with the associated sample clocks/diagnostics. Initial Playwright video recording failed at context teardown because the local ffmpeg helper could not spawn; the final suite uses sequential PNG evidence and passes without video. Early review screenshots with incorrect visualization scaling were rejected and rerendered.

## Validation and cost

- `npm run typecheck`, `npm run lint`, `npm test`: 39 files / 579 tests passed before integration.
- `tests/caster-motion-v3.test.ts`: 3 passed. Also ran the model catalog/rendering suites (68 combined tests at that stage).
- `playwright.casters.config.ts`: 4 passed: three complete EXTRA role reviews and the real game formation/heal check.
- `npm run build` and `node scripts/prepare-pages.mjs`: passed. Existing large-bundle warning remains.
- Each derivative has exactly the input byte length: Mage 4,514,208; Frost 4,233,976; Healer 7,636,684. Triangle/texture content and draw layout are unchanged. The comparable 24-actor isolated rendering reports 176 calls and 1,168,744 triangles for both baseline and candidate. This establishes equal geometry cost, not a device-wide FPS guarantee.
- All three motions of each role share the new URL, avoiding a second copy of the same model in the active roster cache. The original files remain preserved and available.

Limits: Chromium on this Mac was used locally; no physical mobile-device review or maximum-unit performance benchmark was performed. 2D source silhouettes are references, not pixel-identical conversion targets. Effects remain game-owned; their lifetime/logic was not redesigned. Public CI/Pages status is reported with the delivered commit rather than asserted by this source document.
