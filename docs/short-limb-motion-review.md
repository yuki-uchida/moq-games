# Ranger, Paladin and Goblin motion repair — 2026-11-01

The Ranger keeps a compact bow stance with its elbows in front of the green coat. The gold-and-white Paladin braces its round shield and makes an outside sword preparation followed by a fast forward diagonal cut. The Goblin uses an outward arm carriage and a compact dagger cut above its red shorts. Their existing movement, damage and release rules are unchanged.

## Findings and repair

- Ranger: the old walk lowered the pelvis by up to 0.10 model units, while independent toe-helper bones followed another path. During attack the bow arm crossed the chest, and the independently animated bow grip crossed from x=0.44 to approximately -0.14. Rebuilt both short leg chains with constant lengths and flat sole orientation, made toe helpers follow their foot delta, and coordinated the bow, compact string draw, arms and release markers.
- Paladin: the old gait rotated the sole and folded the short leg chains deeply. The old attack combined a large vertical body excursion and independent tool animation. Rebuilt the gait and authored a shield-braced sword arc with a slower preparation, fast cut, and recovery. Sword and shield follow their respective hand transforms.
- Goblin: walk channels translated the hip joints by as much as -0.108 and shortened the chest offset from 0.210 to 0.102. Attack also deeply folded the knees. These poses pulled the short limbs into the clothing and collapsed the blended surfaces. Restoring the anatomical joint offsets and solving reachable foot/hand targets removes the reported extreme collapse without a new rig, new weights or a shader substitution.

The repair uses analytic two-bone IK, sampled at 120 Hz into ordinary glTF animation channels. Feet have a 62% stance phase, a linear backward contact path and a smooth lifted return. Model-space cycle travel is 0.26 / 0.34 / 0.42 units for Ranger / Paladin / Goblin. Catalog travel converts these to the existing game scale. Simulation movement remains the single root-motion owner.

Attack clocks remain Ranger 1.200 s / release 0.750 s, Paladin 0.768 s / hit 0.416 s, Goblin 0.864 s / hit 0.396 s. The existing enemy time scale still applies. `DirectedMotion.ts` recognizes the repair metadata so its generic torso pass cannot disturb the coordinated feet and grips. No other unit is opted into this bypass.

## Preservation and reproduction

The four pre-repair runtime files are identified by hashes in `src/rendering/models/motion-repair-provenance.json` under the tower-defense example. Preserve them from commit `ceaca18` into `local-assets/motion-originals/<role>/<file>` before running:

```sh
node scripts/repair-roster-motion.mjs --source local-assets/motion-originals
npm run typecheck
npm run lint
npm test
npm run build
```

The generator refuses an unexpected baseline hash. It retains the original binary prefix and appends sampled action data. Original nodes, skin/bind matrices, materials, textures, images, scenes, every base vertex attribute and idle actions were compared and remain identical. Ranger bow deformation targets are deliberately replaced by a smaller string draw with matching nock motion; this is the only changed morph design. Base geometry, indices, weights and triangle counts are unchanged. Total GLB growth is recorded in the provenance records, approximately 0.65 MB across four files.

Original inputs, rejected candidates, QA scripts, ordered images, logs and fresh Blender reimports are retained locally under `local-assets/qa/ranger-paladin/` and `local-assets/motion-originals/`. They are excluded from public packaging. Blender 5.2.3 LTS imported all four final GLBs and saved separate candidate `.blend` files. Runtime GLBs are produced directly to preserve the Ranger's custom eight-influence attributes, rather than passing those attributes through a Blender re-export. No Blender installation or upgrade was performed. The repository has no `.agents/skills`; installed animation and blender-game-animation skills were read.

## Viewed evidence and limits

1. Native gait: viewed ordered ModelUnitVisual renders at 0–1 s in 0.125 s steps, plus front/side/back sheets. Alternating feet and loop endpoints remained connected, without the old deep folds.
2. Attack timing: viewed source times 0, .15, .30, .396, .416, .60, .75, .90 and 1.20 s for all three roles. The Paladin and Goblin cuts move from preparation to forward contact before recovery; Ranger holds through its release. Front-facing sword foreshortening is visible.
3. Continuity: viewed the same ordered attack interval from the side, plus enlarged final eight-direction sheets at six phases per clip. The earlier sleeve spikes, deep knee folds and detached-looking feet were absent in these samples. Both rigid tool grips remained coordinated with the hands.
4. Direction: viewed the native gait through all eight facings, with light/dark backgrounds and the loop seam. Viewed all eight directions at six phases for both final walk and attack clips. Existing idle actions were preserved byte-for-byte; a complete eight-direction idle playback review was not repeated.
5. Game: rendered 60 fixed-step snapshots using the actual GameEngine and GameRenderer. Viewed the opening attack/recovery sequence, including the Paladin/Goblin exchange, Ranger release/projectile, and subsequent Goblin walking. A separate longer encounter exercised Ranger walking. Diagnostics reported the expected attack clips and zero model/asset errors. The normal-game initialization and save/restore E2E also passed. Paladin walking was reviewed through ModelUnitVisual, not a sustained live-game traversal.

Temporal inspection used ordered rendered frames with explicit times, not continuous video watching. The five scopes above were actually inspected, but there was no full same-clock comparison with the preserved 2D artwork, no mobile/device test, and no broad battle-load benchmark. These remain outside the visual acceptance established here. Costs are unchanged mesh/triangle counts and the recorded animation-data increase; this is not an FPS improvement claim.

Automated checks cover actual GLTFLoader playback, constant segment lengths, flat sole rotations, ground clearance, stance foot velocity versus catalog travel, loop seams and the Ranger's forward release vector. A 3e-5 model-unit contact tolerance permits float32 interpolation error. Numerical checks support the visual review and do not establish absence of every possible cloth intersection between sampled frames.

Integrated validation on top of the concurrent viewer and Patchling changes: typecheck, lint, 583 tests in 39 files, build, Pages preparation, the three targeted model-adapter E2Es and normal-game save/restore E2E passed. Fresh dependency installation used the lockfile and offline cache. Early E2E attempts failed because copied Playwright modules resolved into another checkout and because Vite had stale optimized dependencies; the clean install and isolated server restart resolved both. Those failures are retained in local logs and are not counted as passing runs.
