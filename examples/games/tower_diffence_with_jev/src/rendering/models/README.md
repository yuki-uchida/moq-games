# Actual 3D model catalog

The catalog loads animated polygonal GLBs directly. It never selects sprites or static Meshy originals when a model or motion is missing. Renderer integration owns camera transforms, movement, facing, event timing, and fades.

## Preserved source contracts

- Candidate GLBs are copied byte-for-byte to the ignored local `public/tower-defense-art/models` tree. `asset-provenance.json` records their verified SHA256 values.
- `adapters/source` retains the original packaged JavaScript bytes; typed declarations and lifecycle wrappers are separate. `adapters/source-provenance.json` records the inspected archive and adapter hashes.
- Runtime Tank and Ogre DQ adapters differ only in validating authored mesh-node count rather than Three's material-split primitive count. Every skinned primitive receives the same original DQ implementation. Tank's one authored skinned mesh becomes two primitives; Ogre's 27 become 29. Original adapters remain untouched in `source`.
- Wolf derives from the existing fixed `wolf-lid-color-v1` implementation and the original viewer-pilot configuration. Its runtime copy restores material bindings and disposes only owned clones. Tangent-normal suppression scales XY and blends Z toward one, matching the Blender normal-strength contract. No model geometry, rest coordinates, or weights were changed.
- Material adapters run after the animation mixer with exactly the selected clip's local seconds and preserved animation extras. DQ runs after material updates and current ancestor/world transforms. Disposal is in reverse order.
- Tank, Archer, Ranger, Cannon, and Soldier motion variants retain their separate source rigs. Ranger/Cannon require their original fifth-influence custom attributes for walk and attack. Their attack scenes intentionally have no blink surface.
- Healer exposes `heal`, never `attack`. Paladin's candidate is damage-only. Dragon retains `breath` as a separate clip. Only Slime currently supplies an authored `death` clip.

## Coordinates and clocks

Source Blender XYZ anchors become glTF `[x,z,-y]`. Scale derives from the source orthographic horizontal span: 128 source-cell pixels divided by that span. This is a source-contract mapping, not a claim of final visual acceptance. Slime's scale is explicitly provisional. World movement and walk travel come from the existing game overrides; authoring frame rate never schedules combat.

Emitter entries use documented animated nodes and local offsets. Mage's local offset is computed by evaluating its original `attack` clip at 520 ms, then applying the inverse `Staff_Rigid_Control.matrixWorld` to the documented Y-up release point. This preserves the actual staff attachment instead of guessing a bound corner. Ranger selects the first authored `Ranger_Release_Emitter` carrying the 750 ms release contract, not the stale duplicate node.

## Verification boundary

`model-catalog.test.ts` loads actual local GLBs, checks original byte hashes, every clip's source shader hooks against Three 0.180, DQ sampling under transformed ancestors, per-instance materials/skeletons, and cleanup. Texture loading is stubbed in those CPU tests. Passing them does not establish GPU compilation, correct lighting, visual contacts, or continuous motion acceptance. Local original files are intentionally ignored; absence skips only the materialized-source suite. WebGL and full game visual review remain separate gates.
