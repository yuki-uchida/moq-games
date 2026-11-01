// See-through scenery: fragments lying between the camera and the local rabbit, close to that sight line, are
// cut away, so trees, bushes and furniture never hide the rabbit and the camera needs no collision with them.
import type * as THREE from 'three'

/** Shared uniforms: the scene sets the focus (the rabbit) every frame; radius 0 turns the cut off. */
export const SEE_THROUGH = {
  focus: { value: { x: 0, y: 0, z: 0 } as THREE.Vector3Like },
  radius: { value: 0 }
}

/** Adds the cut to a scenery material (keeps any existing shader patch, e.g. the grass sway). */
export function cutAway<T extends THREE.Material>(material: T): T {
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.cutFocus = SEE_THROUGH.focus
    shader.uniforms.cutRadius = SEE_THROUGH.radius
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 cutWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutWorld = instanceMatrix * cutWorld;
        #endif
        vCutWorld = (modelMatrix * cutWorld).xyz;`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 cutFocus;\nuniform float cutRadius;'
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (cutRadius > 0.0) {
          vec3 cutAxis = cutFocus - cameraPosition;
          float cutLength = max(length(cutAxis), 0.001);
          float cutT = dot(vCutWorld - cameraPosition, cutAxis) / (cutLength * cutLength);
          // Anything hugging the lens, or inside a cone that widens toward the rabbit, stops short of it.
          if (distance(vCutWorld, cameraPosition) < 1.1) discard;
          if (cutT > 0.0 && cutT < 1.0 - 0.7 / cutLength &&
              distance(vCutWorld, cameraPosition + cutAxis * cutT) < cutRadius * (0.35 + 0.65 * cutT)) discard;
        }`
      )
  }
  material.customProgramCacheKey = () => `cut-away:${previous.toString()}`
  return material
}
