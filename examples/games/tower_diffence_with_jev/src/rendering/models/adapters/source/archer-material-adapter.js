// Archer source Archer_Blink_Surface only. Derived assets; no gameplay-clock edits.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition in GLTFLoader.
// Pass THREE, {THREE}, or {lightsPhysicalFragment: THREE.ShaderChunk.lights_physical_fragment}
// to detect legacy mixed-F0 versus newer split-F0 shader layouts. No option means
// the established Three r180 mixed-F0 layout; it does not assert a runtime version.
// Install before Archer's DQ adapter. Dispose DQ before disposing this adapter.
export const archerBlinkGLSL = `// Generated only from Archer source Archer_Blink_Surface. Coordinates are Blender rest space.
struct ArcherBlinkData { vec2 masks; };

vec3 archerSafeNormalize(vec3 v) { float magnitude = length(v); return magnitude > 0.0 ? v / magnitude : vec3(0.0); }

ArcherBlinkData archerEvaluateBlink(vec3 archerRest, float archerBlink) {
  float archerN0 = (((archerRest).x) - (-0.16329999268054962)); // Math
  float archerN1 = ((0.054999999701976776) == 0.0 ? 0.0 : (archerN0) / (0.054999999701976776)); // Math.001
  float archerN2 = ((archerN1) * (archerN1)); // Math.004
  float archerN3 = (((archerRest).z) - (0.2029999941587448)); // Math.002
  float archerN4 = ((0.06400000303983688) == 0.0 ? 0.0 : (archerN3) / (0.06400000303983688)); // Math.003
  float archerN5 = ((archerN4) * (archerN4)); // Math.005
  float archerN6 = ((archerN2) + (archerN5)); // Math.006
  float archerN7 = sqrt(max(archerN6, 0.0)); // Math.007
  float archerN8 = ((archerN7) - (0.9599999785423279)); // Math.008
  float archerN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (archerN8) / (0.05999999865889549)); // Math.009
  float archerN10 = max(archerN9, 0.0); // Math.010
  float archerN11 = min(archerN10, 1.0); // Math.011
  float archerN12 = ((archerN11) * (archerN11)); // Math.012
  float archerN13 = ((2.0) * (archerN11)); // Math.013
  float archerN14 = ((3.0) - (archerN13)); // Math.014
  float archerN15 = ((archerN12) * (archerN14)); // Math.015
  float archerN16 = ((1.0) - (archerN15)); // Math.016
  float archerN17 = (((archerRest).y) < (-0.23999999463558197) ? 1.0 : 0.0); // Math.017
  float archerN18 = (((archerRest).y) > (-0.3499999940395355) ? 1.0 : 0.0); // Math.018
  float archerN19 = ((archerN17) * (archerN18)); // Math.019
  float archerN20 = ((archerN16) * (archerN19)); // Math.020
  float archerN21 = ((0.08900000154972076) * (archerBlink)); // Math.025
  float archerN22 = ((0.06400000303983688) - (archerN21)); // Math.026
  float archerN23 = ((archerN1) * (archerN1)); // Math.021
  float archerN24 = ((1.0) - (archerN23)); // Math.022
  float archerN25 = max(archerN24, 0.0); // Math.023
  float archerN26 = sqrt(max(archerN25, 0.0)); // Math.024
  float archerN27 = ((archerN22) * (archerN26)); // Math.027
  float archerN28 = ((0.2029999941587448) + (archerN27)); // Math.028
  float archerN29 = (((archerRest).z) - (archerN28)); // Math.033
  float archerN30 = ((archerN29) - (-0.0007999999797903001)); // Math.034
  float archerN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (archerN30) / (0.0015999999595806003)); // Math.035
  float archerN32 = max(archerN31, 0.0); // Math.036
  float archerN33 = min(archerN32, 1.0); // Math.037
  float archerN34 = ((archerN33) * (archerN33)); // Math.038
  float archerN35 = ((2.0) * (archerN33)); // Math.039
  float archerN36 = ((3.0) - (archerN35)); // Math.040
  float archerN37 = ((archerN34) * (archerN36)); // Math.041
  float archerN38 = ((0.039000000804662704) * (archerBlink)); // Math.029
  float archerN39 = ((-0.06400000303983688) + (archerN38)); // Math.030
  float archerN40 = ((archerN39) * (archerN26)); // Math.031
  float archerN41 = ((0.2029999941587448) + (archerN40)); // Math.032
  float archerN42 = (((archerRest).z) - (archerN41)); // Math.042
  float archerN43 = ((archerN42) - (-0.0007999999797903001)); // Math.043
  float archerN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (archerN43) / (0.0015999999595806003)); // Math.044
  float archerN45 = max(archerN44, 0.0); // Math.045
  float archerN46 = min(archerN45, 1.0); // Math.046
  float archerN47 = ((archerN46) * (archerN46)); // Math.047
  float archerN48 = ((2.0) * (archerN46)); // Math.048
  float archerN49 = ((3.0) - (archerN48)); // Math.049
  float archerN50 = ((archerN47) * (archerN49)); // Math.050
  float archerN51 = ((1.0) - (archerN50)); // Math.051
  float archerN52 = ((archerN37) + (archerN51)); // Math.052
  float archerN53 = min(archerN52, 1.0); // Math.053
  float archerN54 = ((archerBlink) * (20.0)); // Math.054
  float archerN55 = min(archerN54, 1.0); // Math.055
  float archerN56 = ((archerN53) * (archerN55)); // Math.056
  float archerN57 = ((archerN20) * (archerN56)); // Math.057
  float archerN58 = ((0.0) + (archerN57)); // Math.058
  float archerN59 = (((archerRest).x) - (0.1843000054359436)); // Math.084
  float archerN60 = ((0.0560000017285347) == 0.0 ? 0.0 : (archerN59) / (0.0560000017285347)); // Math.085
  float archerN61 = ((archerN60) * (archerN60)); // Math.088
  float archerN62 = (((archerRest).z) - (0.2029999941587448)); // Math.086
  float archerN63 = ((0.06400000303983688) == 0.0 ? 0.0 : (archerN62) / (0.06400000303983688)); // Math.087
  float archerN64 = ((archerN63) * (archerN63)); // Math.089
  float archerN65 = ((archerN61) + (archerN64)); // Math.090
  float archerN66 = sqrt(max(archerN65, 0.0)); // Math.091
  float archerN67 = ((archerN66) - (0.9599999785423279)); // Math.092
  float archerN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (archerN67) / (0.05999999865889549)); // Math.093
  float archerN69 = max(archerN68, 0.0); // Math.094
  float archerN70 = min(archerN69, 1.0); // Math.095
  float archerN71 = ((archerN70) * (archerN70)); // Math.096
  float archerN72 = ((2.0) * (archerN70)); // Math.097
  float archerN73 = ((3.0) - (archerN72)); // Math.098
  float archerN74 = ((archerN71) * (archerN73)); // Math.099
  float archerN75 = ((1.0) - (archerN74)); // Math.100
  float archerN76 = (((archerRest).y) < (-0.23999999463558197) ? 1.0 : 0.0); // Math.101
  float archerN77 = (((archerRest).y) > (-0.3499999940395355) ? 1.0 : 0.0); // Math.102
  float archerN78 = ((archerN76) * (archerN77)); // Math.103
  float archerN79 = ((archerN75) * (archerN78)); // Math.104
  float archerN80 = ((0.08900000154972076) * (archerBlink)); // Math.109
  float archerN81 = ((0.06400000303983688) - (archerN80)); // Math.110
  float archerN82 = ((archerN60) * (archerN60)); // Math.105
  float archerN83 = ((1.0) - (archerN82)); // Math.106
  float archerN84 = max(archerN83, 0.0); // Math.107
  float archerN85 = sqrt(max(archerN84, 0.0)); // Math.108
  float archerN86 = ((archerN81) * (archerN85)); // Math.111
  float archerN87 = ((0.2029999941587448) + (archerN86)); // Math.112
  float archerN88 = (((archerRest).z) - (archerN87)); // Math.117
  float archerN89 = ((archerN88) - (-0.0007999999797903001)); // Math.118
  float archerN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (archerN89) / (0.0015999999595806003)); // Math.119
  float archerN91 = max(archerN90, 0.0); // Math.120
  float archerN92 = min(archerN91, 1.0); // Math.121
  float archerN93 = ((archerN92) * (archerN92)); // Math.122
  float archerN94 = ((2.0) * (archerN92)); // Math.123
  float archerN95 = ((3.0) - (archerN94)); // Math.124
  float archerN96 = ((archerN93) * (archerN95)); // Math.125
  float archerN97 = ((0.039000000804662704) * (archerBlink)); // Math.113
  float archerN98 = ((-0.06400000303983688) + (archerN97)); // Math.114
  float archerN99 = ((archerN98) * (archerN85)); // Math.115
  float archerN100 = ((0.2029999941587448) + (archerN99)); // Math.116
  float archerN101 = (((archerRest).z) - (archerN100)); // Math.126
  float archerN102 = ((archerN101) - (-0.0007999999797903001)); // Math.127
  float archerN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (archerN102) / (0.0015999999595806003)); // Math.128
  float archerN104 = max(archerN103, 0.0); // Math.129
  float archerN105 = min(archerN104, 1.0); // Math.130
  float archerN106 = ((archerN105) * (archerN105)); // Math.131
  float archerN107 = ((2.0) * (archerN105)); // Math.132
  float archerN108 = ((3.0) - (archerN107)); // Math.133
  float archerN109 = ((archerN106) * (archerN108)); // Math.134
  float archerN110 = ((1.0) - (archerN109)); // Math.135
  float archerN111 = ((archerN96) + (archerN110)); // Math.136
  float archerN112 = min(archerN111, 1.0); // Math.137
  float archerN113 = ((archerBlink) * (20.0)); // Math.138
  float archerN114 = min(archerN113, 1.0); // Math.139
  float archerN115 = ((archerN112) * (archerN114)); // Math.140
  float archerN116 = ((archerN79) * (archerN115)); // Math.141
  float archerN117 = ((archerN58) + (archerN116)); // Math.142
  float archerN118 = (((archerRest).z) - (archerN28)); // Math.059
  float archerN119 = abs(archerN118); // Math.060
  float archerN120 = ((archerN119) - (0.007000000216066837)); // Math.061
  float archerN121 = ((0.012000000104308128) == 0.0 ? 0.0 : (archerN120) / (0.012000000104308128)); // Math.062
  float archerN122 = max(archerN121, 0.0); // Math.063
  float archerN123 = min(archerN122, 1.0); // Math.064
  float archerN124 = ((archerN123) * (archerN123)); // Math.065
  float archerN125 = ((2.0) * (archerN123)); // Math.066
  float archerN126 = ((3.0) - (archerN125)); // Math.067
  float archerN127 = ((archerN124) * (archerN126)); // Math.068
  float archerN128 = ((1.0) - (archerN127)); // Math.069
  float archerN129 = abs(archerN1); // Math.070
  float archerN130 = ((archerN129) - (0.8999999761581421)); // Math.071
  float archerN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (archerN130) / (0.10000000149011612)); // Math.072
  float archerN132 = max(archerN131, 0.0); // Math.073
  float archerN133 = min(archerN132, 1.0); // Math.074
  float archerN134 = ((archerN133) * (archerN133)); // Math.075
  float archerN135 = ((2.0) * (archerN133)); // Math.076
  float archerN136 = ((3.0) - (archerN135)); // Math.077
  float archerN137 = ((archerN134) * (archerN136)); // Math.078
  float archerN138 = ((1.0) - (archerN137)); // Math.079
  float archerN139 = ((archerN128) * (archerN138)); // Math.080
  float archerN140 = ((archerN139) * (archerN55)); // Math.081
  float archerN141 = ((archerN20) * (archerN140)); // Math.082
  float archerN142 = ((0.0) + (archerN141)); // Math.083
  float archerN143 = (((archerRest).z) - (archerN87)); // Math.143
  float archerN144 = abs(archerN143); // Math.144
  float archerN145 = ((archerN144) - (0.007000000216066837)); // Math.145
  float archerN146 = ((0.012000000104308128) == 0.0 ? 0.0 : (archerN145) / (0.012000000104308128)); // Math.146
  float archerN147 = max(archerN146, 0.0); // Math.147
  float archerN148 = min(archerN147, 1.0); // Math.148
  float archerN149 = ((archerN148) * (archerN148)); // Math.149
  float archerN150 = ((2.0) * (archerN148)); // Math.150
  float archerN151 = ((3.0) - (archerN150)); // Math.151
  float archerN152 = ((archerN149) * (archerN151)); // Math.152
  float archerN153 = ((1.0) - (archerN152)); // Math.153
  float archerN154 = abs(archerN60); // Math.154
  float archerN155 = ((archerN154) - (0.8999999761581421)); // Math.155
  float archerN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (archerN155) / (0.10000000149011612)); // Math.156
  float archerN157 = max(archerN156, 0.0); // Math.157
  float archerN158 = min(archerN157, 1.0); // Math.158
  float archerN159 = ((archerN158) * (archerN158)); // Math.159
  float archerN160 = ((2.0) * (archerN158)); // Math.160
  float archerN161 = ((3.0) - (archerN160)); // Math.161
  float archerN162 = ((archerN159) * (archerN161)); // Math.162
  float archerN163 = ((1.0) - (archerN162)); // Math.163
  float archerN164 = ((archerN153) * (archerN163)); // Math.164
  float archerN165 = ((archerN164) * (archerN114)); // Math.165
  float archerN166 = ((archerN79) * (archerN165)); // Math.166
  float archerN167 = ((archerN142) + (archerN166)); // Math.167
  return ArcherBlinkData(vec2(archerN117, archerN167));
}

vec3 archerApplyBaseColor(vec3 textureBaseColor, ArcherBlinkData blinkData) {
  vec3 archerN0 = mix(textureBaseColor, vec3(0.9909999966621399, 0.6460000276565552, 0.4650000035762787), clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 archerN1 = mix(archerN0, vec3(0.012000000104308128, 0.004000000189989805, 0.0020000000949949026), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).001
  return archerN1;
}

float archerApplyRoughness(float textureRoughness, ArcherBlinkData blinkData) {
  float archerN0 = ((1.0) - (blinkData.masks.x)); // Math.168
  float archerN1 = ((textureRoughness) * (archerN0)); // Math.169
  float archerN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.170
  float archerN3 = ((archerN1) + (archerN2)); // Math.171
  return archerN3;
}

float archerNormalStrength(ArcherBlinkData blinkData) {
  float archerN0 = ((1.0) - (blinkData.masks.x)); // Math.172
  return archerN0;
}

float archerSpecularIORLevel(ArcherBlinkData blinkData) {

  return 0.5;
}

vec3 archerApplySurfaceNormal(vec3 mappedNormal, vec3 geometryTrueNormal, ArcherBlinkData blinkData) {

  return mappedNormal;
}
`;
export const archerSourceIOR = 1.5;

export function sampleArcherBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) throw new Error('Archer blink samples missing: preserve animation extras as clip.userData');
  if (!Number.isFinite(seconds)) throw new Error('Archer clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installArcherMaterialAdapter(root, options = {}) {
  const physicalChunk = options.lightsPhysicalFragment ?? options.THREE?.ShaderChunk?.lights_physical_fragment ?? options.ShaderChunk?.lights_physical_fragment;
  if (physicalChunk !== undefined && (typeof physicalChunk !== 'string' || !/material\.specularColor\s*=/.test(physicalChunk) || !/material\.specularF90\s*=/.test(physicalChunk))) {
    throw new Error('Unsupported Three physical shader chunk: specularColor/specularF90 missing');
  }
  const splitF0 = physicalChunk !== undefined && /material\.specularColorBlended\s*=/.test(physicalChunk);
  if (physicalChunk !== undefined && !splitF0 && !/material\.specularColor\s*=\s*mix\s*\(/.test(physicalChunk)) {
    throw new Error('Unsupported Three physical shader chunk: unknown specular layout');
  }
  const uniform = { value: 0 };
  const clones = new Map(), bindings = [], targets = [];
  // Validate all targets before changing anything. Clone per root, share only
  // within that root, and leave every unrelated material untouched.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Archer_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Archer rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Archer requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Archer requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Archer Archer_Blink_Surface material missing');
  for (const [, original] of targets) {
    if (clones.has(original)) continue;
    const material = original.clone();
    const previous = original.onBeforeCompile, previousCacheKey = original.customProgramCacheKey?.bind(original);
    material.onBeforeCompile = function(shader, renderer) {
      previous?.call(this, shader, renderer);
      for (const marker of ['#include <begin_vertex>']) {
        if (!shader.vertexShader.includes(marker)) throw new Error('Unsupported Three vertex shader: ' + marker);
      }
      for (const marker of ['#include <map_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>', '#include <lights_physical_fragment>']) {
        if (!shader.fragmentShader.includes(marker)) throw new Error('Unsupported Three fragment shader: ' + marker);
      }
      shader.uniforms.archerBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 archerRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\narcherRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 archerRestPosition; uniform float archerBlink;\n' + archerBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        ArcherBlinkData archerBlinkData = archerEvaluateBlink(archerRestPosition, archerBlink);
        diffuseColor.rgb = archerApplyBaseColor(diffuseColor.rgb, archerBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = archerApplyRoughness(roughnessFactor, archerBlinkData);`);
      // Blender tangent Normal Map strength scales XY AND blends Z toward 1.
      // Derivatives of the fully deformed position give Geometry True Normal,
      // rather than the smooth interpolated (nonPerturbedNormal) vertex normal.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float archerStrength = archerNormalStrength(archerBlinkData);
          vec3 archerMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          archerMapN.xy *= normalScale * archerStrength;
          archerMapN.z = mix(1.0, archerMapN.z, clamp(archerStrength, 0.0, 1.0));
          normal = archerSafeNormalize(tbn * archerMapN);
        #else
          #include <normal_fragment_maps>
        #endif
        vec3 archerTrueNormal = archerSafeNormalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        normal = archerApplySurfaceNormal(normal, archerTrueNormal, archerBlinkData);`);
      // The exact source graph yields the Blender Specular IOR Level. Its
      // dielectric F0 is F0(IOR) * (2 * level), with F90=1; metallic color stays.
      // This preserves source inputs, not a claim of identical renderer BRDFs.
      const f0 = ((archerSourceIOR - 1) / (archerSourceIOR + 1)) ** 2;
      const specularBridge = `
        vec3 archerDielectricF0 = vec3(${f0.toPrecision(17)} * 2.0 * max(archerSpecularIORLevel(archerBlinkData), 0.0));
        ${splitF0 ? 'material.specularColor = archerDielectricF0;\n        material.specularColorBlended = mix(archerDielectricF0, diffuseColor.rgb, metalnessFactor);' : 'material.specularColor = mix(archerDielectricF0, diffuseColor.rgb, metalnessFactor);'}
        material.specularF90 = 1.0;`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + specularBridge);
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}:archer-source-blink-v1-${splitF0 ? 'split' : 'mixed'}`;
    material.needsUpdate = true;
    clones.set(original, material);
  }
  for (const mesh of new Set(targets.map(([mesh]) => mesh))) {
    const original = mesh.material;
    const adapted = Array.isArray(original) ? original.map(m => clones.get(m) || m) : clones.get(original);
    mesh.material = adapted;
    bindings.push({ mesh, original, adapted });
  }
  let disposed = false;
  return {
    update(clip, clipLocalSeconds) {
      if (disposed) throw new Error('Archer material adapter is disposed');
      // Same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns loops/crossfades and switching the separate Archer roots.
      uniform.value = sampleArcherBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Archer blink update');
      uniform.value = value;
    },
    dispose() {
      if (disposed) return;
      for (const { mesh, original, adapted } of bindings) if (mesh.material === adapted) mesh.material = original;
      for (const material of clones.values()) material.dispose();
      disposed = true;
    }
  };
}
