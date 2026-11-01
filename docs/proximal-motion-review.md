# Wolf, Brute and Ogre motion repair — 2026-11-01

This revision addresses the wolf's immobile-looking limb roots, Brute limb collapse during walk/attack, and the pinned fragment exposed between Ogre's raised arm and abdomen. Gameplay movement speed, hit geometry, damage, cooldowns and event timestamps are unchanged.

## Diagnosis and authoring

- **Wolf:** the old rig did have upper-leg animation, but the shoulder/hip transition remained largely weighted to chest/pelvis. Extend the four upper-leg influences through 4,904 transition vertices, retaining four normalized influences. Rebuild walk with constant-length two-segment IK, stable anatomical bend planes, diagonal running-trot pairs, body weight transfer and compensating neck/tail motion. Native asymmetry in the hind rest pose is retained. The visual stride is `(0.60 / 0.45) * (128 / 4.24)` board units, giving approximately 310 ms per cycle at the existing 130 units/s. Idle and attack animation data are unchanged; their poses were also rendered to check the weight change.
- **Brute:** retain the original rigid rock weights. Rebuild walk with hip-driven steps, knee flexion, planted foot orientation and opposing shoulder swing. The short legs require a lowered pelvis rather than stretching segments. The visual stride is `(0.30 / 0.54) * (128 / 3.4)` board units, approximately 402 ms at 52 units/s. Attack loads both shoulders slowly, accelerates the slam into the unchanged 660 ms cue, then recovers through the original 1,200 ms action duration. Avoid independently solving fists through unstable elbow poles.
- **Ogre:** color-coded runtime isolation identified the visible remnant as original torso skin left from the old cut arms, pinned to chest/pelvis rather than the rebuilt arm. Remove 2,637 overlapping triangles from the original torso's first two primitive index lists, within the region covered by existing flank/shoulder filler meshes. Keep the skirt, rebuilt arms, joint covers, club, vertex attributes, skin weights, bind rig and all animation bytes unchanged. Keep DQ skinning and its authored mesh count.

`DirectedMotion.ts` recognizes the explicit `proximalMotionVersion: 1` extras on the new Wolf/Brute clips. Those clips already solve torso motion and contacts, so the additional generic torso direction pass must not alter them. Other clips and roles retain the existing behavior. The runtime manifest retains the original source identity and records the intermediate derivative hash and new output hash separately.

The installed animation and Blender animation skills were read. This checkout has no `.agents/skills` directory. The installed Blender is 5.2.3 LTS, build `e13b728c6880`; its sandboxed startup crashed in Metal initialization, while the authorized unsandboxed invocation worked. No software was installed or upgraded.

The gait design uses stance/swing phases and diagonal trot pairing, with restrained body shift, as described in the [veterinary gait definitions](https://pmc.ncbi.nlm.nih.gov/articles/PMC13403709/). The weight audit follows Blender's documented [vertex-group skinning behavior](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/armature.html). This is stylized game acting rather than a biomechanical reconstruction.

## Preserved source and reproducibility

Originals, rejected candidates, Blender sources and screenshots are retained in ignored `local-assets/locomotion-repair/`. Source hashes, unchanged attribute/action hashes and baseline/output costs are committed in `animation-repair-audit.json`. The three original runtime inputs can be recovered from commit `ceaca1806e4406abb1aeff6425424749b7e6bb23` into `wolf-original.glb`, `brute-original.glb`, and `ogre-original.glb` in that directory. Never overwrite existing preserved originals.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/repair-wolf-brute-motion.py
node scripts/repair-ogre-arm-remnant.mjs
node scripts/register-proximal-motions.mjs
npm run typecheck
npm run lint
npm test
npm run build
node scripts/prepare-pages.mjs
```

Blender writes separate `wolf-walk-v1.blend`, `brute-walk-v1.blend` and `brute-attack-v1.blend` sources. The corrected Ogre was reimported and saved as `ogre-arm-remnant-v1.blend`. Runtime animation matrices are baked at 120 Hz into the original GLB's native node coordinates. Original geometry/material/texture/bind bytes remain recoverable in the binary prefix; no whole-library re-export was performed. Ogre's repair appends replacement triangle index lists.

For a production game check, serve the prepared build on port 5281 and run `npx playwright test --config playwright.proximal.config.ts`. `TOWER_E2E_BASE_URL`, `PROXIMAL_E2E_OUTPUT` and optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` select the local server, output folder and installed browser. The test restores real campaign checkpoints, observes walking, and for Brute/Ogre waits for actual combat attack playback. It never calls an external debug service.

## Visual review record

Evidence is retained under `local-assets/locomotion-repair/`; images were actually opened, and the listed sequential frames were viewed in timestamp order. This is sequential-frame review, not a claim of watching an MP4 continuously.

1. **Readability:** `candidate1-*`, `candidate2-*`, `revision3-*`, and `reviewed-native/`. Inspected Wolf/Brute at the gameplay camera and real movement cadence at 0, .1, .2, .3, .4, .6, .8, 1 and 1.2 seconds. Compared the preserved Wolf east-facing 2D walk sheet and old runtime phase views. `sync/pair0.png`–`pair8.png` were also viewed sequentially at the same east-facing native size and 0–300 ms clock (37.5 ms intervals); the current game camera is retained rather than fitting the model to the source image. Extended root weights and lengthened the stride after the first candidate; lowered Brute's pelvis when a reach assertion rejected the longer step. Ogre `ogre-readability/` covers the full 0–1.2 s action from front, side and rear.
2. **Timing/contact:** `reviewed-contact/` at .48, .54, .60, .66, .72, .90 and 1.2 s. Brute moves from loaded overhead arms into the forward slam at .66 s, with stable feet and a slower recovery. Ogre `ogre-timing/` at .44, .55, .60, .66, .72 and .90 s retains the same windup, impact and recovery clock.
3. **Anatomical continuity:** `anatomy-seq-*` at 0, .07, .14, .21 and .28 s, front/side/rear. Whole legs and shoulder-driven arms remain joined; rigid rock segments retain volume. Ogre `ogre-continuity/` at .30, .40, .50 and .60 s shows the raised-arm/abdomen boundary without the pinned flap. Earlier color/isolation views and both rejected trimming candidates remain preserved.
4. **Directions/loop:** eight facings in `reviewed-direction-*`, plus `seam-seq-*` immediately before/at/after loop zero (−2, 0, +2 ms). No visible loop pop was observed. Ogre `ogre-direction/` at 0, .33, .55, .66, .99 and 1.2 s checks frontal, side and rear coverage; additional oblique phase views were opened. `rest-coverage-*` and `unaffected-coverage-*` were opened for all eight directions at phases 0/.4/.8, checking Brute idle, Ogre idle/walk, Wolf idle/attack and Ogre attack for regressions. No open torso holes or detached limb fragments were observed.
5. **Final real game:** production checkpoint replay and screenshots are recorded by `tests/tower-proximal-game.spec.ts`. The final build based on `da7f30d` passed all three encounters in 4.4 minutes. Viewed the native movement screenshot sequence for all three roles and the actual Brute/Ogre combat attack screenshots. Final diagnostics were asset-ready: Wolf walking at simulation 12.367 s, Brute attacking at 7.633 s, and Ogre attacking at 7.700 s. Full attack phase timing was reviewed in the runtime actor harness; the full-board captures provide movement sequences and individual combat attack frames, not a continuous full-board attack video.

## Verification and limits

The original runtime file sizes were Wolf 9,536,580 bytes, Brute 9,741,932 bytes and Ogre 8,449,812 bytes; outputs are 11,212,840, 9,930,572 and 8,784,576 bytes. Wolf's added skin attributes and retained original binary data increase transfer size. Brute/Ogre vertex attributes are unchanged; Ogre renders 2,637 fewer triangles. These are asset costs, not a claim of a measured frame-rate improvement.

CPU checks distinguish original bind/geometry/action preservation from visual quality. They sample actual distributed GLBs for meaningful proximal rotation, fixed segment lengths, absence of abrupt bend-plane changes, loop closure and planted-foot drift. They also verify source hashes and preserve unchanged actions. Three.js sanitizes dotted joint names on load; the tests use the sanitized names.

The native model remains a short-limbed stylized animal/rock creature. Four-legged foot contacts were measured on a planar board; uneven-ground adaptation is not authored. No mobile-device or multi-hour gameplay endurance test was performed. Only the Wolf east-facing old 2D reference was visually inspected. The five visual gates above are complete for this candidate within the explicitly recorded frames and clocks. Interrupted test failures and partial development-server runs are not counted as passing evidence.

## Final local checks

- `npm run typecheck`, `npm run lint`: exit 0 after integration with `da7f30d`.
- `npm test`: 41 files, 592 tests passed.
- Full-stance and preservation focused suite: 9 tests passed; the stance check covers 91 samples across each complete stance interval, including a loop crossing.
- `npm run build` and `node scripts/prepare-pages.mjs`: exit 0. The existing large-chunk warning remains.
- Focused real WebGL adapter checks: Wolf, Brute and Ogre, 3 passed.
- Final production combat checks: 3 passed; Brute/Ogre require both actual walk and attack observation. Evidence: `test-results/proximal-final/` and `local-assets/locomotion-repair/e2e-final.log`.
- CI now runs the 9 motion/preservation tests and includes the 3 game fixtures in the existing Pages browser shards. Existing checks and deployment gates remain enabled.

The original protective stash was retained. Integration also preserves the separate caster, patchling, ranger, paladin, goblin and viewer changes. Source and generated assets in this commit are limited to this repair scope. GitHub Actions and deployment results are reported separately after push.
