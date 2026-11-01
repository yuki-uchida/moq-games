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

The final merge retains `fd6aced` Frost staff-grip stabilization and `ddf05fe` unused-cache removal. Both the caster contract CI step and this repair's contract step remain enabled. After that merge, the affected real WebGL checks were repeated for Frost, Wolf, Brute and Ogre: 4 passed.

## CI observation-race follow-up

Run `41269223097`, browser shard 3, exposed a test-driver race: Ogre attacked during simulation intervals 6.750–7.710 s and 10.333–11.293 s, while awaited screenshots blocked driver-side sampling for about 2.96 s and 2.53 s. The model was rendered, but the polling loop missed both windows. The diagnostic trace is retained in artifact `13069076846` of that run.

The encounter test now observes new GPU render frames inside the page's animation-frame loop. It captures the existing battlefield Canvas synchronously in the rendered walk/attack frame, retaining GPU frame number, simulation time and clip seconds. Attack evidence must be inside clip seconds .2–.9; an idle pose or completed attack is insufficient. PNGs must be nonempty, and model/page errors still fail the test. Full-page screenshots occur after motion verification.

For Brute/Ogre the driver deliberately waits eight seconds, long enough to cross an entire attack window, before reading the retained evidence. This reproduces the original driver-delay failure without relying on screenshot speed. No game clock, combat fixture, motion, shader or model bytes are altered by this test fix. The initial Ogre reproduction passed with actual same-frame walk and attack PNGs; the stricter final phase-window run is recorded in `local-assets/locomotion-repair/e2e-observer-final.log` and `test-results/proximal-observer-final/`.

The final observer run passed all three encounters in 3.8 minutes, including Brute/Ogre mid-attack PNGs captured while the driver waited eight seconds. Typecheck, lint, the nine motion/preservation contracts, and build/Pages preparation passed. The publication verifier's three tests pass: correct gzip sidecar bytes are accepted, stale manifest hashes are rejected, and corrupt decoded GLB bytes are rejected even with the expected hash-addressed filename. Running the same verifier against the prepared production server matched all three committed GLB SHA256 values and returned HTTP 200 for the landing page, game and EXTRA viewer.

The build decodes every meshopt sidecar and checks its scene, rig, materials, clips, oriented triangles and accessors against the preserved original GLB. Animation tracks, skin weights, joints, bind matrices, morphs and images remain exact after the intended vertex permutation. POSITION/NORMAL/TANGENT/TEXCOORD/COLOR floats use the half-step error bound from meshoptimizer 0.22 exponential filtering; original byte equality is deliberately not required. See `scripts/verify-model-sidecar.mjs` and its corruption tests.

The build job preserves the validated derivative SHA256/size in `.build/model-sidecar-digests.json` as a separate CI artifact (outside the public Pages output). The deploy job restores that artifact before publishing and runs `node scripts/verify-published-motions.mjs <page_url> <verified_digest_file>`. It compares all 36 actual decoded public sidecars with these independent expected digests, as well as retaining the three-file committed source repair audit. A self-reported source stamp, valid header and gzip CRC alone cannot pass: the tests also alter the payload while retaining all three. Bounded retries allow brief Pages/CDN propagation; a remaining mismatch fails the job.

`tower-meshopt-equivalence.spec.ts` compares source/fallback and meshopt rendering at five fixed phases for soldier walk, slime walk, mage attack, tank walk and dragon breath (300×200 native canvas, normalized RGB RMSE below 0.01). Both cameras fit pose zero so load latency cannot change framing. Actual playback resumes the ordinary clock and is recorded separately. These are sampled visual checks, not a claim that every camera angle or every possible animation time was visually reviewed.


Local visual review of the preserved source and meshopt candidate (300×200 canvas, phases 0/0.2/0.4/0.6/0.8 and sampled recorded-playback tail frames):

| Case | Maximum normalized RGB RMSE | Observed comparison |
| --- | ---: | --- |
| dragon breath | 0.002037 | Rear-up, jaw/head, wings and claws match the source. This preview checks the actor, not the battle breath effect. |
| mage attack | 0.002842 | Turn, staff grip, hat and garment remain attached and match the source poses. |
| slime walk | 0.002332 | Squash/stretch, bob, eyes and curled tip remain continuous and match the source. |
| soldier walk | 0.003042 | Alternating legs, leaf/helmet, sword and shield remain aligned with the source. |
| tank walk | 0.002960 | Short foot steps and the held shield match the source; subtle source amplitude is unchanged. |

These five comparison passes do not establish every direction, camera or unobserved time. The exact-track/rig checks cover all emitted sidecars; the visual gate covers the named samples. Originals and motion timing are unchanged. Local comparison sheets, metrics and source/meshopt playback are retained under ignored `local-assets/meshopt-review/`; CI attaches the raw frames, metrics and videos to its browser report.
