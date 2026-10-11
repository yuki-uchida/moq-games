// Ranger source Ranger_Blink_Surface only. Derived assets; no gameplay-clock edits.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition in GLTFLoader.
// Pass THREE, {THREE}, or {lightsPhysicalFragment: THREE.ShaderChunk.lights_physical_fragment}
// to detect legacy mixed-F0 versus newer split-F0 shader layouts. No option means
// the established Three r180 mixed-F0 layout; it does not assert a runtime version.
// Install before Ranger's DQ adapter. Dispose DQ before disposing this adapter.
export const rangerBlinkGLSL = `// Generated only from Ranger source Ranger_Blink_Surface. Coordinates are Blender rest space.
struct RangerBlinkData { vec2 masks; };

vec3 rangerSafeNormalize(vec3 v) { float magnitude = length(v); return magnitude > 0.0 ? v / magnitude : vec3(0.0); }

RangerBlinkData rangerEvaluateBlink(vec3 rangerRest, float rangerBlink) {
  float rangerN0 = (((rangerRest).x) - (-0.05700000002980232)); // Math
  float rangerN1 = ((0.06700000166893005) == 0.0 ? 0.0 : (rangerN0) / (0.06700000166893005)); // Math.001
  float rangerN2 = ((rangerN1) * (rangerN1)); // Math.004
  float rangerN3 = (((rangerRest).z) - (0.11599999666213989)); // Math.002
  float rangerN4 = ((0.061000000685453415) == 0.0 ? 0.0 : (rangerN3) / (0.061000000685453415)); // Math.003
  float rangerN5 = ((rangerN4) * (rangerN4)); // Math.005
  float rangerN6 = ((rangerN2) + (rangerN5)); // Math.006
  float rangerN7 = sqrt(max(rangerN6, 0.0)); // Math.007
  float rangerN8 = ((rangerN7) - (0.9599999785423279)); // Math.008
  float rangerN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (rangerN8) / (0.05999999865889549)); // Math.009
  float rangerN10 = max(rangerN9, 0.0); // Math.010
  float rangerN11 = min(rangerN10, 1.0); // Math.011
  float rangerN12 = ((rangerN11) * (rangerN11)); // Math.012
  float rangerN13 = ((2.0) * (rangerN11)); // Math.013
  float rangerN14 = ((3.0) - (rangerN13)); // Math.014
  float rangerN15 = ((rangerN12) * (rangerN14)); // Math.015
  float rangerN16 = ((1.0) - (rangerN15)); // Math.016
  float rangerN17 = (((rangerRest).y) < (-0.23999999463558197) ? 1.0 : 0.0); // Math.017
  float rangerN18 = (((rangerRest).y) > (-0.3700000047683716) ? 1.0 : 0.0); // Math.018
  float rangerN19 = ((rangerN17) * (rangerN18)); // Math.019
  float rangerN20 = ((rangerN16) * (rangerN19)); // Math.020
  float rangerN21 = ((0.0860000029206276) * (rangerBlink)); // Math.025
  float rangerN22 = ((0.061000000685453415) - (rangerN21)); // Math.026
  float rangerN23 = ((rangerN1) * (rangerN1)); // Math.021
  float rangerN24 = ((1.0) - (rangerN23)); // Math.022
  float rangerN25 = max(rangerN24, 0.0); // Math.023
  float rangerN26 = sqrt(max(rangerN25, 0.0)); // Math.024
  float rangerN27 = ((rangerN22) * (rangerN26)); // Math.027
  float rangerN28 = ((0.11599999666213989) + (rangerN27)); // Math.028
  float rangerN29 = (((rangerRest).z) - (rangerN28)); // Math.033
  float rangerN30 = ((rangerN29) - (-0.0007999999797903001)); // Math.034
  float rangerN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (rangerN30) / (0.0015999999595806003)); // Math.035
  float rangerN32 = max(rangerN31, 0.0); // Math.036
  float rangerN33 = min(rangerN32, 1.0); // Math.037
  float rangerN34 = ((rangerN33) * (rangerN33)); // Math.038
  float rangerN35 = ((2.0) * (rangerN33)); // Math.039
  float rangerN36 = ((3.0) - (rangerN35)); // Math.040
  float rangerN37 = ((rangerN34) * (rangerN36)); // Math.041
  float rangerN38 = ((0.035999998450279236) * (rangerBlink)); // Math.029
  float rangerN39 = ((-0.061000000685453415) + (rangerN38)); // Math.030
  float rangerN40 = ((rangerN39) * (rangerN26)); // Math.031
  float rangerN41 = ((0.11599999666213989) + (rangerN40)); // Math.032
  float rangerN42 = (((rangerRest).z) - (rangerN41)); // Math.042
  float rangerN43 = ((rangerN42) - (-0.0007999999797903001)); // Math.043
  float rangerN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (rangerN43) / (0.0015999999595806003)); // Math.044
  float rangerN45 = max(rangerN44, 0.0); // Math.045
  float rangerN46 = min(rangerN45, 1.0); // Math.046
  float rangerN47 = ((rangerN46) * (rangerN46)); // Math.047
  float rangerN48 = ((2.0) * (rangerN46)); // Math.048
  float rangerN49 = ((3.0) - (rangerN48)); // Math.049
  float rangerN50 = ((rangerN47) * (rangerN49)); // Math.050
  float rangerN51 = ((1.0) - (rangerN50)); // Math.051
  float rangerN52 = ((rangerN37) + (rangerN51)); // Math.052
  float rangerN53 = min(rangerN52, 1.0); // Math.053
  float rangerN54 = ((rangerBlink) * (20.0)); // Math.054
  float rangerN55 = min(rangerN54, 1.0); // Math.055
  float rangerN56 = ((rangerN53) * (rangerN55)); // Math.056
  float rangerN57 = ((rangerN20) * (rangerN56)); // Math.057
  float rangerN58 = ((0.0) + (rangerN57)); // Math.058
  float rangerN59 = (((rangerRest).x) - (0.2150000035762787)); // Math.084
  float rangerN60 = ((0.06700000166893005) == 0.0 ? 0.0 : (rangerN59) / (0.06700000166893005)); // Math.085
  float rangerN61 = ((rangerN60) * (rangerN60)); // Math.088
  float rangerN62 = (((rangerRest).z) - (0.11599999666213989)); // Math.086
  float rangerN63 = ((0.061000000685453415) == 0.0 ? 0.0 : (rangerN62) / (0.061000000685453415)); // Math.087
  float rangerN64 = ((rangerN63) * (rangerN63)); // Math.089
  float rangerN65 = ((rangerN61) + (rangerN64)); // Math.090
  float rangerN66 = sqrt(max(rangerN65, 0.0)); // Math.091
  float rangerN67 = ((rangerN66) - (0.9599999785423279)); // Math.092
  float rangerN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (rangerN67) / (0.05999999865889549)); // Math.093
  float rangerN69 = max(rangerN68, 0.0); // Math.094
  float rangerN70 = min(rangerN69, 1.0); // Math.095
  float rangerN71 = ((rangerN70) * (rangerN70)); // Math.096
  float rangerN72 = ((2.0) * (rangerN70)); // Math.097
  float rangerN73 = ((3.0) - (rangerN72)); // Math.098
  float rangerN74 = ((rangerN71) * (rangerN73)); // Math.099
  float rangerN75 = ((1.0) - (rangerN74)); // Math.100
  float rangerN76 = (((rangerRest).y) < (-0.23999999463558197) ? 1.0 : 0.0); // Math.101
  float rangerN77 = (((rangerRest).y) > (-0.3700000047683716) ? 1.0 : 0.0); // Math.102
  float rangerN78 = ((rangerN76) * (rangerN77)); // Math.103
  float rangerN79 = ((rangerN75) * (rangerN78)); // Math.104
  float rangerN80 = ((0.0860000029206276) * (rangerBlink)); // Math.109
  float rangerN81 = ((0.061000000685453415) - (rangerN80)); // Math.110
  float rangerN82 = ((rangerN60) * (rangerN60)); // Math.105
  float rangerN83 = ((1.0) - (rangerN82)); // Math.106
  float rangerN84 = max(rangerN83, 0.0); // Math.107
  float rangerN85 = sqrt(max(rangerN84, 0.0)); // Math.108
  float rangerN86 = ((rangerN81) * (rangerN85)); // Math.111
  float rangerN87 = ((0.11599999666213989) + (rangerN86)); // Math.112
  float rangerN88 = (((rangerRest).z) - (rangerN87)); // Math.117
  float rangerN89 = ((rangerN88) - (-0.0007999999797903001)); // Math.118
  float rangerN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (rangerN89) / (0.0015999999595806003)); // Math.119
  float rangerN91 = max(rangerN90, 0.0); // Math.120
  float rangerN92 = min(rangerN91, 1.0); // Math.121
  float rangerN93 = ((rangerN92) * (rangerN92)); // Math.122
  float rangerN94 = ((2.0) * (rangerN92)); // Math.123
  float rangerN95 = ((3.0) - (rangerN94)); // Math.124
  float rangerN96 = ((rangerN93) * (rangerN95)); // Math.125
  float rangerN97 = ((0.035999998450279236) * (rangerBlink)); // Math.113
  float rangerN98 = ((-0.061000000685453415) + (rangerN97)); // Math.114
  float rangerN99 = ((rangerN98) * (rangerN85)); // Math.115
  float rangerN100 = ((0.11599999666213989) + (rangerN99)); // Math.116
  float rangerN101 = (((rangerRest).z) - (rangerN100)); // Math.126
  float rangerN102 = ((rangerN101) - (-0.0007999999797903001)); // Math.127
  float rangerN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (rangerN102) / (0.0015999999595806003)); // Math.128
  float rangerN104 = max(rangerN103, 0.0); // Math.129
  float rangerN105 = min(rangerN104, 1.0); // Math.130
  float rangerN106 = ((rangerN105) * (rangerN105)); // Math.131
  float rangerN107 = ((2.0) * (rangerN105)); // Math.132
  float rangerN108 = ((3.0) - (rangerN107)); // Math.133
  float rangerN109 = ((rangerN106) * (rangerN108)); // Math.134
  float rangerN110 = ((1.0) - (rangerN109)); // Math.135
  float rangerN111 = ((rangerN96) + (rangerN110)); // Math.136
  float rangerN112 = min(rangerN111, 1.0); // Math.137
  float rangerN113 = ((rangerBlink) * (20.0)); // Math.138
  float rangerN114 = min(rangerN113, 1.0); // Math.139
  float rangerN115 = ((rangerN112) * (rangerN114)); // Math.140
  float rangerN116 = ((rangerN79) * (rangerN115)); // Math.141
  float rangerN117 = ((rangerN58) + (rangerN116)); // Math.142
  float rangerN118 = (((rangerRest).z) - (rangerN28)); // Math.059
  float rangerN119 = abs(rangerN118); // Math.060
  float rangerN120 = ((rangerN119) - (0.006000000052154064)); // Math.061
  float rangerN121 = ((0.00800000037997961) == 0.0 ? 0.0 : (rangerN120) / (0.00800000037997961)); // Math.062
  float rangerN122 = max(rangerN121, 0.0); // Math.063
  float rangerN123 = min(rangerN122, 1.0); // Math.064
  float rangerN124 = ((rangerN123) * (rangerN123)); // Math.065
  float rangerN125 = ((2.0) * (rangerN123)); // Math.066
  float rangerN126 = ((3.0) - (rangerN125)); // Math.067
  float rangerN127 = ((rangerN124) * (rangerN126)); // Math.068
  float rangerN128 = ((1.0) - (rangerN127)); // Math.069
  float rangerN129 = abs(rangerN1); // Math.070
  float rangerN130 = ((rangerN129) - (0.8999999761581421)); // Math.071
  float rangerN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (rangerN130) / (0.10000000149011612)); // Math.072
  float rangerN132 = max(rangerN131, 0.0); // Math.073
  float rangerN133 = min(rangerN132, 1.0); // Math.074
  float rangerN134 = ((rangerN133) * (rangerN133)); // Math.075
  float rangerN135 = ((2.0) * (rangerN133)); // Math.076
  float rangerN136 = ((3.0) - (rangerN135)); // Math.077
  float rangerN137 = ((rangerN134) * (rangerN136)); // Math.078
  float rangerN138 = ((1.0) - (rangerN137)); // Math.079
  float rangerN139 = ((rangerN128) * (rangerN138)); // Math.080
  float rangerN140 = ((rangerN139) * (rangerN55)); // Math.081
  float rangerN141 = ((rangerN20) * (rangerN140)); // Math.082
  float rangerN142 = ((0.0) + (rangerN141)); // Math.083
  float rangerN143 = (((rangerRest).z) - (rangerN87)); // Math.143
  float rangerN144 = abs(rangerN143); // Math.144
  float rangerN145 = ((rangerN144) - (0.006000000052154064)); // Math.145
  float rangerN146 = ((0.00800000037997961) == 0.0 ? 0.0 : (rangerN145) / (0.00800000037997961)); // Math.146
  float rangerN147 = max(rangerN146, 0.0); // Math.147
  float rangerN148 = min(rangerN147, 1.0); // Math.148
  float rangerN149 = ((rangerN148) * (rangerN148)); // Math.149
  float rangerN150 = ((2.0) * (rangerN148)); // Math.150
  float rangerN151 = ((3.0) - (rangerN150)); // Math.151
  float rangerN152 = ((rangerN149) * (rangerN151)); // Math.152
  float rangerN153 = ((1.0) - (rangerN152)); // Math.153
  float rangerN154 = abs(rangerN60); // Math.154
  float rangerN155 = ((rangerN154) - (0.8999999761581421)); // Math.155
  float rangerN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (rangerN155) / (0.10000000149011612)); // Math.156
  float rangerN157 = max(rangerN156, 0.0); // Math.157
  float rangerN158 = min(rangerN157, 1.0); // Math.158
  float rangerN159 = ((rangerN158) * (rangerN158)); // Math.159
  float rangerN160 = ((2.0) * (rangerN158)); // Math.160
  float rangerN161 = ((3.0) - (rangerN160)); // Math.161
  float rangerN162 = ((rangerN159) * (rangerN161)); // Math.162
  float rangerN163 = ((1.0) - (rangerN162)); // Math.163
  float rangerN164 = ((rangerN153) * (rangerN163)); // Math.164
  float rangerN165 = ((rangerN164) * (rangerN114)); // Math.165
  float rangerN166 = ((rangerN79) * (rangerN165)); // Math.166
  float rangerN167 = ((rangerN142) + (rangerN166)); // Math.167
  return RangerBlinkData(vec2(rangerN117, rangerN167));
}

vec3 rangerApplyBaseColor(vec3 textureBaseColor, RangerBlinkData blinkData) {
  vec3 rangerN0 = mix(textureBaseColor, vec3(0.9800000190734863, 0.6899999976158142, 0.5199999809265137), clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 rangerN1 = mix(rangerN0, vec3(0.00800000037997961, 0.0020000000949949026, 0.014000000432133675), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).001
  return rangerN1;
}

float rangerApplyRoughness(float textureRoughness, RangerBlinkData blinkData) {
  float rangerN0 = ((1.0) - (blinkData.masks.x)); // Math.168
  float rangerN1 = ((textureRoughness) * (rangerN0)); // Math.169
  float rangerN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.170
  float rangerN3 = ((rangerN1) + (rangerN2)); // Math.171
  return rangerN3;
}

float rangerNormalStrength(RangerBlinkData blinkData) {
  float rangerN0 = ((1.0) - (blinkData.masks.x)); // Math.172
  return rangerN0;
}

float rangerSpecularIORLevel(RangerBlinkData blinkData) {

  return 0.5;
}

vec3 rangerApplySurfaceNormal(vec3 mappedNormal, vec3 geometryTrueNormal, RangerBlinkData blinkData) {

  return mappedNormal;
}
`;
export const rangerSourceIOR = 1.5;

export function sampleRangerBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) throw new Error('Ranger blink samples missing: preserve animation extras as clip.userData');
  if (!Number.isFinite(seconds)) throw new Error('Ranger clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installRangerMaterialAdapter(root, options = {}) {
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
      if (material?.name !== 'Ranger_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Ranger rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Ranger requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Ranger requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Ranger Ranger_Blink_Surface material missing');
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
      shader.uniforms.rangerBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 rangerRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nrangerRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 rangerRestPosition; uniform float rangerBlink;\n' + rangerBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        RangerBlinkData rangerBlinkData = rangerEvaluateBlink(rangerRestPosition, rangerBlink);
        diffuseColor.rgb = rangerApplyBaseColor(diffuseColor.rgb, rangerBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = rangerApplyRoughness(roughnessFactor, rangerBlinkData);`);
      // Blender tangent Normal Map strength scales XY AND blends Z toward 1.
      // Derivatives of the fully deformed position give Geometry True Normal,
      // rather than the smooth interpolated (nonPerturbedNormal) vertex normal.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float rangerStrength = rangerNormalStrength(rangerBlinkData);
          vec3 rangerMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          rangerMapN.xy *= normalScale * rangerStrength;
          rangerMapN.z = mix(1.0, rangerMapN.z, clamp(rangerStrength, 0.0, 1.0));
          normal = rangerSafeNormalize(tbn * rangerMapN);
        #else
          #include <normal_fragment_maps>
        #endif
        vec3 rangerTrueNormal = rangerSafeNormalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        normal = rangerApplySurfaceNormal(normal, rangerTrueNormal, rangerBlinkData);`);
      // The exact source graph yields the Blender Specular IOR Level. Its
      // dielectric F0 is F0(IOR) * (2 * level), with F90=1; metallic color stays.
      // This preserves source inputs, not a claim of identical renderer BRDFs.
      const f0 = ((rangerSourceIOR - 1) / (rangerSourceIOR + 1)) ** 2;
      const specularBridge = `
        vec3 rangerDielectricF0 = vec3(${f0.toPrecision(17)} * 2.0 * max(rangerSpecularIORLevel(rangerBlinkData), 0.0));
        ${splitF0 ? 'material.specularColor = rangerDielectricF0;\n        material.specularColorBlended = mix(rangerDielectricF0, diffuseColor.rgb, metalnessFactor);' : 'material.specularColor = mix(rangerDielectricF0, diffuseColor.rgb, metalnessFactor);'}
        material.specularF90 = 1.0;`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + specularBridge);
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}:ranger-source-blink-v1-${splitF0 ? 'split' : 'mixed'}`;
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
      if (disposed) throw new Error('Ranger material adapter is disposed');
      // Same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns loops/crossfades and switching the separate Ranger roots.
      uniform.value = sampleRangerBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Ranger blink update');
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
