# Unit motion refinements v2

The green hooded Archer and teal Scout retain their silhouettes, rig proportions and held equipment while taking narrow forward steps. The stone Sentinel uses a deliberate right-fist strike, the amber Kobold readies and thrusts its spear, and the dark shield Knight braces and drives the shield forward.

## Runtime changes

| Role             | Motion | Change                                                                                                                                                                                      |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archer           | walk   | Replace deep crouch and lateral leg motion with two-bone sagittal foot targets; synchronize the separate skin helpers and bow controls; close the source bow-control seam.                  |
| Runner           | walk   | Reduce pelvis bounce; keep knee and ankle on each hip's sagittal plane and hold the foot orientation through stance.                                                                        |
| Tank             | walk   | Reduce leg/independent foot travel to 58%; solve the shield arm with its grip 0.085 outward, 0.065 higher and 0.075 forward in source units. Scale cycle travel from 20 to 11.6 game units. |
| Crystal Sentinel | attack | Replace simultaneous arm raising with a right-fist wind-up, torso twist, fast strike and slower recovery; left hand guards. There is no separate weapon in this model.                      |
| Kobold Lancer    | attack | Ready the original spear horizontally, draw the hand back, twist the torso, then thrust sharply at the existing hit cue; preserve the original rigid spear attachment.                      |
| Tank             | attack | Brace, drive the shield and recover; retain the authored shield grip and separate supporting arm. The accepted model has no separate sword.                                                 |

The six versioned JSON clips total approximately 0.95 MB uncompressed. The original GLBs, geometry, textures, skin weights, inverse bind matrices, node rest transforms and combat profiles remain unchanged. The catalog reuses `ModelAssetCache`'s existing clip overlay mechanism. Overlays bypass the generic `DirectedMotion` bake in current main, so these motions are not corrected twice. Other motions retain that bake. Shared animation playback code and viewer entrypoints are unchanged.

The original attack durations and hit cues remain Sentinel 1.5 s / 26/30 s, Kobold 1.2 s / 19/30 s and Tank 0.864 s / 0.468 s. Walk clip durations remain Archer/Runner 1 s and Tank 0.625 s. World movement, damage, targeting, ranges and cooldowns are unchanged. Archer/Runner retain the existing distance-driven runtime cadence; perfect foot planting across every game speed remains unproven.

## Reproduction and preservation

Run from the repository root after the normal SDK/dependency setup:

```sh
node scripts/refine-humanoid-walks.mjs
node scripts/refine-combat-motions.mjs
node scripts/refine-tank-walk.mjs
node scripts/package-refined-motions.mjs
```

The input GLBs are the existing tracked exports. Separate intermediate GLBs are retained under ignored `local-assets/refined-motions-v2/glb-candidates/`; the original two walking exports are also copied to `local-assets/walk-natural-v2/originals/`. Only the six JSON clips under `public/tower-defense-art/models/motions/` are distributed. Generation settings and hashes are in `scripts/*v2-provenance.json` and `scripts/refined-motions-manifest.json`.

Blender 5.2.3 LTS successfully reimported all six intermediate GLBs. `scripts/inspect-refined-motion-blends.py` records bone names/lengths, rigs, meshes and action inventory and saves independent `.blend` reimports under `local-assets/refined-motions-v2/blender-reimports/`. The original normal-motion `.blend` authoring scenes were not found. These reimports are explicitly derivatives, not the original Blender sources.

## Observed visual evidence

`node scripts/review-refined-motions.mjs` uses the real `ModelUnitVisual`, catalog GLBs, shader adapters, game projection and lighting. The review fixes actor positions, so it does not simulate ground travel. It records 3 seconds per direction at yaw 0, 45, 90, 135, 180, 225, 270 and 315 degrees, with native and 2.5x copies of all six motions. Evidence is under ignored `.generated/motion-review/`.

The initial sheets overlapped rows and clipped parts of the body. They were rejected as whole-body evidence. The layout was enlarged, given ground margin, and recorded again. The final recordings contain about 181–183 rendered samples each; encoded media requests 30 fps. `playback.json` reports actual render sample gaps and browser errors; this is distinct from encoded-frame coverage.

Five distinct review gates used real rendered images and ordered frames extracted from the recorded playback:

1. Front/native acting: narrowed Archer/Runner steps are visible without the source's pronounced crouch. The native feet remain small; the larger copy exposes the same pose.
2. Side/contact: alternating foot lift and stance remain connected; the Sentinel fist extends forward, the Kobold spear stays horizontal through the thrust, and the Tank shield moves with its grip.
3. Diagonal/anatomy: inspected 45/135/225/315-degree sequences for arm/knee continuity and equipment attachment. The spear is naturally foreshortened from front diagonals; side sequences establish its forward extent.
4. Rear/directional consistency: inspected rear and both side sequences; observed no foot protruding through the shield face in sampled frames. This is not a proof of zero intersection over every continuous instant or camera angle.
5. Normal game integration: the normal game mesh/save restoration E2E covers lazy loading and both new enemy encounters. A validated stage-4 checkpoint with three legally placed allies and two opponents spawned using the real spawn clock records the normal game. Its JSON confirms all six changed motions appeared; actor positions and subsequent combat are engine-owned.

The agent inspected extracted ordered frames, not every encoded video frame or an uninterrupted video viewing. Do not describe these records as five complete end-to-end human video viewings. All eight directions were recorded and sampled visually; sub-frame clipping, subjective continuous pacing, perfect ground contact under every game speed and all battlefield arrangements remain open visual limits.

## Checks

- `npm run typecheck`, `npm run lint`, `npm test` (586 tests), `npm run build`.
- `refined-motions.test.ts`: six actual GLB/clip bindings, hashes, finite matrices, unchanged limb lengths and durations, walk seams and sagittal ankle tracks.
- `npx playwright test --config playwright.refined-motions.config.ts --grep 'normal game restores and renders a saved|normal game uses lazy'`: four normal-game E2E cases.
- Playwright's bundled ffmpeg failed at context shutdown (`spawn Unknown system error -88`). The E2E config disables that recorder. The separate browser MediaRecorder captures actual playback without that dependency.

Source Blender scenes and full subjective video acceptance are not claimed by passing numerical tests.
