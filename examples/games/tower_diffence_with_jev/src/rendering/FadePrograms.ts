import * as THREE from 'three'

/** Compile both transparent sides without changing a visible actor while the driver works.
 * Proxies borrow geometry/skeletons only for shader feature selection; they are never drawn.
 * The real lease material retains the resulting programs until its normal disposal.
 */
export async function prepareFadePrograms(
  renderer: Pick<THREE.WebGLRenderer, 'compileAsync' | 'compile'>,
  root: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene
): Promise<void> {
  const proxies = new THREE.Group()
  const temporary = new Set<THREE.Material>()
  const originals = new Map<THREE.Material, { transparent: boolean; depthWrite: boolean; side: THREE.Side }>()
  const pairs: { mesh: THREE.Mesh; original: THREE.Material; side: THREE.Side }[] = []
  try {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!originals.has(material))
          originals.set(material, {
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            side: material.side
          })
        const sides =
          material.side === THREE.DoubleSide && !material.forceSinglePass
            ? ([THREE.BackSide, THREE.FrontSide] as const)
            : [material.side]
        for (const side of sides) {
          const shadow = material.clone()
          temporary.add(shadow)
          // Material.clone deliberately omits these functions. Preserve authored shader adapters.
          shadow.onBeforeCompile = material.onBeforeCompile
          shadow.customProgramCacheKey = () => material.customProgramCacheKey()
          shadow.transparent = true
          shadow.depthWrite = false
          shadow.side = side
          const mesh = object.clone(false)
          mesh.material = shadow
          proxies.add(mesh)
          pairs.push({ mesh, original: material, side })
        }
      }
    })
    // Separate materials make compileAsync wait for BOTH sides, not just currentProgram.
    await renderer.compileAsync(proxies, camera, scene)
    for (const { mesh, original } of pairs) mesh.material = original
    // A death or tint update may have happened while compilation was pending.
    for (const material of originals.keys())
      originals.set(material, {
        transparent: material.transparent,
        depthWrite: material.depthWrite,
        side: material.side
      })
    // No await while real material flags differ from their visible state. The programs
    // are already ready, so registration cannot wait for a cold driver compilation.
    try {
      for (const { mesh, original, side } of pairs) {
        original.transparent = true
        original.depthWrite = false
        original.side = side
        original.needsUpdate = true
        renderer.compile(mesh, camera, scene)
      }
    } finally {
      for (const [material, base] of originals) {
        material.transparent = base.transparent
        material.depthWrite = base.depthWrite
        material.side = base.side
        material.needsUpdate = true
      }
    }
  } finally {
    for (const material of temporary) material.dispose()
    proxies.clear()
  }
}
