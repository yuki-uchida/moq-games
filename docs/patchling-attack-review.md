# Patchling spring punch — 2026-11-01

The clockwork patchling is a small, round-headed, unarmed brass/wood automaton. Its short gauntlets and wind-up key support a spring-loaded paired punch: cock both fists beside the chest, lean backward slowly, drive both fists toward the target quickly, recoil and recover. It is grounded melee with self-regeneration, not a ranged healer. No gameplay stats or target geometry changed.

## Contract and preservation

- Source attack: 1.2 s, contact 0.8 s, authored at 30 fps (frame 24 contact; frame 36 end). Existing new-enemy time scale 0.8 means 0.96 s / 0.64 s in current gameplay. Old accepted attacks retain their stored scale.
- Runtime owns movement and collision. Root and feet stay fixed; body/head lean and both arms carry the attack.
- Blender 5.2.3 LTS e13b728c6880. Rig: Patchling_Rig, 15 original bones; no rest/weight/mesh edits.
- Original runtime SHA256: `7b1a6f0d941d9a44eb4cb4bd15d83d8a8b44f2ffa353d6e8c95b7f1c44b03d98`.
- Candidate SHA256: `38df8416a26690b5d569928f98dc50fba71a210242fb33be9d115cc9ce796fc5`.
- 11,753,912 → 11,763,100 bytes (+9,188); unchanged 53,541 vertices / 74,253 triangles. One mesh, one attack rig. Runtime may hold two clip rigs during a transition.
- The merger appends only animation buffers. Original BIN prefix, nodes, skins, meshes, materials, textures, images, scenes and idle/walk JSON were compared and are identical.
- Original concept portrait and its recorded source chain are unchanged. This modifies an existing unit, not a new 2D-to-3D unit.

## Reproduction and local sources

Run from repository root with the original runtime materialized:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/author-patchling-attack.py
node scripts/merge-patchling-attack.mjs
```

The merger preserves the initial input as `local/patchling/original.glb` on first use. For exact regeneration that path must contain the original hash above. Candidate blend, rejected draft, original GLB, logs and screenshots remain locally under `local-assets/patchling-attack-20261101/`; private sources are deliberately excluded from public packaging. Editable final source: `spring-punch-v2.blend`. Blender initially crashed during Metal startup inside the sandbox; normal Mac execution succeeded. No software was installed/upgraded.

`.agents/skills` is absent in this repository and its parent. The discovered sibling moq-wasm skill concerns PR creation and does not govern this direct-main asset change. Installed animation and blender-game-animation skills were read.

## Actual review evidence and limits

1. Draft readability: opened Blender front/side/oblique/back frames at 0, 14, 20, 24, 26, 30, 36. Found an upward-folding forearm at contact; corrected parent rotation compensation and re-rendered v2. Draft preserved.
2. Timing: opened eight-direction runtime sequences at frames 0/5/10/14/18/20, then 20–25; slow cocking followed by rapid extension across 0.68–0.8 s. The rendered sequence uses the original 1.2 s source clock.
3. Continuity: opened corrected side wind-up/contact and recovery sequence 24/26/28/30/33/36. Feet remain in place, fists extend toward source front (-Y in Blender), body recovers. Fresh final-GLB Blender reimport finds attack/idle/walk and the 15-bone rig.
4. Direction: opened runtime sequences showing all eight facings at scale 29 with the game's BoardCamera, ModelUnitVisual and presentation scale. Side/diagonal extension is clearer than the old attack. Front/back foreshortening remains; review harness lighting is darker than game IBL. Same-clock old/new side sequence was also inspected.
5. Game: production-build existing saved-encounter E2E passed. A separate local test simulated a valid patchling attack, saved it, restored it into the actual game, observed visible attack mesh/clip (sampled source time 0.9583 s) and opened its full game screenshot. This proves attack playback and placement on the real battlefield; it does not visually prove every contact moment in all directions.

Continuous execution: headless Chrome drew eight actors through 10 cycles / 12,001.8 ms / 721 requestAnimationFrame callbacks, with zero page errors. This was automated execution, not a human watching a continuous video. Visual temporal review used sequential rendered frames with explicit 30-fps times. A complete live-video review of all eight game facings and five full image-plus-playback review cycles is **not claimed**; full animation acceptance remains open on that coverage. No device/mobile test or load/performance benchmark was run. Triangle count is unchanged; the 721-callback run is not an FPS benchmark.

Local tests: typecheck, lint, 579 tests / 39 files, production build, final GLB reimport, original-data preservation check, saved-encounter E2E and accepted-attack restore test passed. Early dev-server E2E failed before game initialization because Vite rejects the existing public JSON import; production preview passed. Early copied Playwright dependencies also mixed paths; clean `npm ci --ignore-scripts` resolved this. These early failures are retained in local logs and are not counted as passes.
