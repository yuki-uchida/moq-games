MOQ Games: 10 Blender-authored Ultimate Effects v1

Original artwork created with Blender 4.3.2 on the cloud computer for this request. No Mac operation, external artwork, textures or marketplace assets. Roster and renderer reference: yuki-uchida/moq-games commit 97e0b6f01bd55c7734eeed5d39fbc85719b7031b. No repository changes.

Files: ten *-ultimate.glb game assets; generate.py reproducible Blender generator; ultimate-effects-source.blend editable source; render-contact-sheet.png Blender validation render; manifest.json hashes/sizes/triangle counts; validation.json structural checks. Regenerate using: blender -b --python generate.py

The script creates every mesh in Blender and converts its exported material metadata to standard KHR_materials_unlit using the authored color. The .blend preview arranges objects in a grid; mesh geometry remains centered and exported GLBs have NO grid translations. Preview camera/text are excluded from GLBs.

Coordinates: radius exactly 1 unit, origin target ground center. Blender source: XY ground, +Z up. Exported standard GLB: XZ ground, +Y up; source +Y becomes GLB -Z. Game XY ground/+Z up: set imported root.rotation.x=PI/2, root.position=(target.x,target.y,groundZ), root.scale.setScalar(abilityRadius). Avoid applying this rotation twice through another coordinate adapter. Pillar height also scales with radius.

Roles and suggested visual timing (game balance remains gameplay-owned):
soldier: cyan rotating circular slash arcs; scale 0.7 to 1, 0.55s burst.
archer: gold downward arrow rain; descend local Y by 0.35 radius, 0.70s burst.
runner: teal spear flurry; three rapid opacity/scale pulses, 0.55s burst.
tank: amber concentric shockwave; expand 0.25 to 1, 0.80s burst.
mage: red-orange central flame and fragments; rise/expand/fade, 0.95s burst.
healer: green fountain rings and recovery crosses; sustained field.
frost: blue snowflake and six ice crystals; sustained field.
ranger: green angular vines and thorns; sustained field.
cannon: orange radial impact fragments; expand/sink/fade, 0.65s burst.
paladin: gold central beam and eight pillars; grow vertically/fade, 0.90s burst.
For sustained fields pulse opacity 0.28 to 0.50 over the gameplay field duration. Burst opacity starts around 0.65 and fades to zero. Sparse outlines intentionally keep enemies/terrain visible; the outer ring denotes exact ground radius.

Material contract: GLTFLoader supports KHR_materials_unlit and returns MeshBasicMaterial. One mesh/one double-sided material per role. Set per-instance materials transparent=true, depthWrite=false, toneMapped=false, side=DoubleSide, and lifetime opacity. NormalBlending is recommended; optional AdditiveBlending can wash out overlaps. Disable shadows. Depth testing can remain enabled. No bloom required. glTF colors are linear. No textures, rigs, animation tracks, lights, particle systems or decoder dependencies. Whole-object rotation/scale/opacity is runtime-controlled.

Resource ownership: load/cache one source per role. Object3D.clone(true) SHARES geometries and materials. Clone instance materials before opacity changes. Each expiring instance must be removed from scene and all timer/map/animation references, and its unique materials disposed exactly once. Do NOT dispose shared geometry while source/instances still use it. When evicting a source with references=0, dispose each unique source geometry/material once. No textures need cleanup. Alternative: deep-clone geometry and material per instance, then dispose both on expiry. Reset/game end must release every active field and burst. Async load completion must check disposed/scene-generation state before attaching. No AnimationMixer is needed.

Preview: top row healer/frost/ranger/cannon/paladin; bottom soldier/archer/runner/tank/mage. Blender render was visually inspected: ten distinct silhouettes, no white clipping, sparse clear ground coverage. In-game composition, radius placement and resource cleanup remain browser integration tests.
