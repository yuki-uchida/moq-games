// Tank source Knight_Blink_Surface only. Derived assets; no gameplay-clock edits.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition in GLTFLoader.
// Pass THREE, {THREE}, or {lightsPhysicalFragment: THREE.ShaderChunk.lights_physical_fragment}
// to detect legacy mixed-F0 versus newer split-F0 shader layouts. No option means
// the established Three r180 mixed-F0 layout; it does not assert a runtime version.
// Install before Tank's DQ adapter. Dispose DQ before disposing this adapter.
export const tankBlinkGLSL = `// Generated only from Tank source Knight_Blink_Surface. Coordinates are Blender rest space.
struct TankBlinkData { vec2 masks; };

vec3 tankSafeNormalize(vec3 v) { float magnitude = length(v); return magnitude > 0.0 ? v / magnitude : vec3(0.0); }

TankBlinkData tankEvaluateBlink(vec3 tankRest, float tankBlink) {
  float tankN0 = (((tankRest).x) - (-0.24899999797344208)); // Math
  float tankN1 = ((0.08699999749660492) == 0.0 ? 0.0 : (tankN0) / (0.08699999749660492)); // Math.001
  float tankN2 = ((tankN1) * (tankN1)); // Math.004
  float tankN3 = (((tankRest).z) - (1.2109999656677246)); // Math.002
  float tankN4 = ((0.10400000214576721) == 0.0 ? 0.0 : (tankN3) / (0.10400000214576721)); // Math.003
  float tankN5 = ((tankN4) * (tankN4)); // Math.005
  float tankN6 = ((tankN2) + (tankN5)); // Math.006
  float tankN7 = sqrt(max(tankN6, 0.0)); // Math.007
  float tankN8 = ((tankN7) - (0.9599999785423279)); // Math.008
  float tankN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (tankN8) / (0.05999999865889549)); // Math.009
  float tankN10 = max(tankN9, 0.0); // Math.010
  float tankN11 = min(tankN10, 1.0); // Math.011
  float tankN12 = ((tankN11) * (tankN11)); // Math.012
  float tankN13 = ((2.0) * (tankN11)); // Math.013
  float tankN14 = ((3.0) - (tankN13)); // Math.014
  float tankN15 = ((tankN12) * (tankN14)); // Math.015
  float tankN16 = ((1.0) - (tankN15)); // Math.016
  float tankN17 = (((tankRest).y) < (-0.3100000023841858) ? 1.0 : 0.0); // Math.017
  float tankN18 = (((tankRest).y) > (-0.5) ? 1.0 : 0.0); // Math.018
  float tankN19 = ((tankN17) * (tankN18)); // Math.019
  float tankN20 = ((tankN16) * (tankN19)); // Math.020
  float tankN21 = ((0.14399999380111694) * (tankBlink)); // Math.025
  float tankN22 = ((0.10400000214576721) - (tankN21)); // Math.026
  float tankN23 = ((tankN1) * (tankN1)); // Math.021
  float tankN24 = ((1.0) - (tankN23)); // Math.022
  float tankN25 = max(tankN24, 0.0); // Math.023
  float tankN26 = sqrt(max(tankN25, 0.0)); // Math.024
  float tankN27 = ((tankN22) * (tankN26)); // Math.027
  float tankN28 = ((1.2109999656677246) + (tankN27)); // Math.028
  float tankN29 = (((tankRest).z) - (tankN28)); // Math.033
  float tankN30 = ((tankN29) - (-0.0007999999797903001)); // Math.034
  float tankN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (tankN30) / (0.0015999999595806003)); // Math.035
  float tankN32 = max(tankN31, 0.0); // Math.036
  float tankN33 = min(tankN32, 1.0); // Math.037
  float tankN34 = ((tankN33) * (tankN33)); // Math.038
  float tankN35 = ((2.0) * (tankN33)); // Math.039
  float tankN36 = ((3.0) - (tankN35)); // Math.040
  float tankN37 = ((tankN34) * (tankN36)); // Math.041
  float tankN38 = ((0.06400000303983688) * (tankBlink)); // Math.029
  float tankN39 = ((-0.10400000214576721) + (tankN38)); // Math.030
  float tankN40 = ((tankN39) * (tankN26)); // Math.031
  float tankN41 = ((1.2109999656677246) + (tankN40)); // Math.032
  float tankN42 = (((tankRest).z) - (tankN41)); // Math.042
  float tankN43 = ((tankN42) - (-0.0007999999797903001)); // Math.043
  float tankN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (tankN43) / (0.0015999999595806003)); // Math.044
  float tankN45 = max(tankN44, 0.0); // Math.045
  float tankN46 = min(tankN45, 1.0); // Math.046
  float tankN47 = ((tankN46) * (tankN46)); // Math.047
  float tankN48 = ((2.0) * (tankN46)); // Math.048
  float tankN49 = ((3.0) - (tankN48)); // Math.049
  float tankN50 = ((tankN47) * (tankN49)); // Math.050
  float tankN51 = ((1.0) - (tankN50)); // Math.051
  float tankN52 = ((tankN37) + (tankN51)); // Math.052
  float tankN53 = min(tankN52, 1.0); // Math.053
  float tankN54 = ((tankBlink) * (20.0)); // Math.054
  float tankN55 = min(tankN54, 1.0); // Math.055
  float tankN56 = ((tankN53) * (tankN55)); // Math.056
  float tankN57 = ((tankN20) * (tankN56)); // Math.057
  float tankN58 = ((0.0) + (tankN57)); // Math.058
  float tankN59 = (((tankRest).x) - (0.09000000357627869)); // Math.084
  float tankN60 = ((0.08699999749660492) == 0.0 ? 0.0 : (tankN59) / (0.08699999749660492)); // Math.085
  float tankN61 = ((tankN60) * (tankN60)); // Math.088
  float tankN62 = (((tankRest).z) - (1.2109999656677246)); // Math.086
  float tankN63 = ((0.10400000214576721) == 0.0 ? 0.0 : (tankN62) / (0.10400000214576721)); // Math.087
  float tankN64 = ((tankN63) * (tankN63)); // Math.089
  float tankN65 = ((tankN61) + (tankN64)); // Math.090
  float tankN66 = sqrt(max(tankN65, 0.0)); // Math.091
  float tankN67 = ((tankN66) - (0.9599999785423279)); // Math.092
  float tankN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (tankN67) / (0.05999999865889549)); // Math.093
  float tankN69 = max(tankN68, 0.0); // Math.094
  float tankN70 = min(tankN69, 1.0); // Math.095
  float tankN71 = ((tankN70) * (tankN70)); // Math.096
  float tankN72 = ((2.0) * (tankN70)); // Math.097
  float tankN73 = ((3.0) - (tankN72)); // Math.098
  float tankN74 = ((tankN71) * (tankN73)); // Math.099
  float tankN75 = ((1.0) - (tankN74)); // Math.100
  float tankN76 = (((tankRest).y) < (-0.3100000023841858) ? 1.0 : 0.0); // Math.101
  float tankN77 = (((tankRest).y) > (-0.5) ? 1.0 : 0.0); // Math.102
  float tankN78 = ((tankN76) * (tankN77)); // Math.103
  float tankN79 = ((tankN75) * (tankN78)); // Math.104
  float tankN80 = ((0.14399999380111694) * (tankBlink)); // Math.109
  float tankN81 = ((0.10400000214576721) - (tankN80)); // Math.110
  float tankN82 = ((tankN60) * (tankN60)); // Math.105
  float tankN83 = ((1.0) - (tankN82)); // Math.106
  float tankN84 = max(tankN83, 0.0); // Math.107
  float tankN85 = sqrt(max(tankN84, 0.0)); // Math.108
  float tankN86 = ((tankN81) * (tankN85)); // Math.111
  float tankN87 = ((1.2109999656677246) + (tankN86)); // Math.112
  float tankN88 = (((tankRest).z) - (tankN87)); // Math.117
  float tankN89 = ((tankN88) - (-0.0007999999797903001)); // Math.118
  float tankN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (tankN89) / (0.0015999999595806003)); // Math.119
  float tankN91 = max(tankN90, 0.0); // Math.120
  float tankN92 = min(tankN91, 1.0); // Math.121
  float tankN93 = ((tankN92) * (tankN92)); // Math.122
  float tankN94 = ((2.0) * (tankN92)); // Math.123
  float tankN95 = ((3.0) - (tankN94)); // Math.124
  float tankN96 = ((tankN93) * (tankN95)); // Math.125
  float tankN97 = ((0.06400000303983688) * (tankBlink)); // Math.113
  float tankN98 = ((-0.10400000214576721) + (tankN97)); // Math.114
  float tankN99 = ((tankN98) * (tankN85)); // Math.115
  float tankN100 = ((1.2109999656677246) + (tankN99)); // Math.116
  float tankN101 = (((tankRest).z) - (tankN100)); // Math.126
  float tankN102 = ((tankN101) - (-0.0007999999797903001)); // Math.127
  float tankN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (tankN102) / (0.0015999999595806003)); // Math.128
  float tankN104 = max(tankN103, 0.0); // Math.129
  float tankN105 = min(tankN104, 1.0); // Math.130
  float tankN106 = ((tankN105) * (tankN105)); // Math.131
  float tankN107 = ((2.0) * (tankN105)); // Math.132
  float tankN108 = ((3.0) - (tankN107)); // Math.133
  float tankN109 = ((tankN106) * (tankN108)); // Math.134
  float tankN110 = ((1.0) - (tankN109)); // Math.135
  float tankN111 = ((tankN96) + (tankN110)); // Math.136
  float tankN112 = min(tankN111, 1.0); // Math.137
  float tankN113 = ((tankBlink) * (20.0)); // Math.138
  float tankN114 = min(tankN113, 1.0); // Math.139
  float tankN115 = ((tankN112) * (tankN114)); // Math.140
  float tankN116 = ((tankN79) * (tankN115)); // Math.141
  float tankN117 = ((tankN58) + (tankN116)); // Math.142
  float tankN118 = (((tankRest).z) - (tankN28)); // Math.059
  float tankN119 = abs(tankN118); // Math.060
  float tankN120 = ((tankN119) - (0.006500000134110451)); // Math.061
  float tankN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (tankN120) / (0.0044999998062849045)); // Math.062
  float tankN122 = max(tankN121, 0.0); // Math.063
  float tankN123 = min(tankN122, 1.0); // Math.064
  float tankN124 = ((tankN123) * (tankN123)); // Math.065
  float tankN125 = ((2.0) * (tankN123)); // Math.066
  float tankN126 = ((3.0) - (tankN125)); // Math.067
  float tankN127 = ((tankN124) * (tankN126)); // Math.068
  float tankN128 = ((1.0) - (tankN127)); // Math.069
  float tankN129 = abs(tankN1); // Math.070
  float tankN130 = ((tankN129) - (0.8999999761581421)); // Math.071
  float tankN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (tankN130) / (0.10000000149011612)); // Math.072
  float tankN132 = max(tankN131, 0.0); // Math.073
  float tankN133 = min(tankN132, 1.0); // Math.074
  float tankN134 = ((tankN133) * (tankN133)); // Math.075
  float tankN135 = ((2.0) * (tankN133)); // Math.076
  float tankN136 = ((3.0) - (tankN135)); // Math.077
  float tankN137 = ((tankN134) * (tankN136)); // Math.078
  float tankN138 = ((1.0) - (tankN137)); // Math.079
  float tankN139 = ((tankN128) * (tankN138)); // Math.080
  float tankN140 = ((tankN139) * (tankN55)); // Math.081
  float tankN141 = ((tankN20) * (tankN140)); // Math.082
  float tankN142 = ((0.0) + (tankN141)); // Math.083
  float tankN143 = (((tankRest).z) - (tankN87)); // Math.143
  float tankN144 = abs(tankN143); // Math.144
  float tankN145 = ((tankN144) - (0.006500000134110451)); // Math.145
  float tankN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (tankN145) / (0.0044999998062849045)); // Math.146
  float tankN147 = max(tankN146, 0.0); // Math.147
  float tankN148 = min(tankN147, 1.0); // Math.148
  float tankN149 = ((tankN148) * (tankN148)); // Math.149
  float tankN150 = ((2.0) * (tankN148)); // Math.150
  float tankN151 = ((3.0) - (tankN150)); // Math.151
  float tankN152 = ((tankN149) * (tankN151)); // Math.152
  float tankN153 = ((1.0) - (tankN152)); // Math.153
  float tankN154 = abs(tankN60); // Math.154
  float tankN155 = ((tankN154) - (0.8999999761581421)); // Math.155
  float tankN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (tankN155) / (0.10000000149011612)); // Math.156
  float tankN157 = max(tankN156, 0.0); // Math.157
  float tankN158 = min(tankN157, 1.0); // Math.158
  float tankN159 = ((tankN158) * (tankN158)); // Math.159
  float tankN160 = ((2.0) * (tankN158)); // Math.160
  float tankN161 = ((3.0) - (tankN160)); // Math.161
  float tankN162 = ((tankN159) * (tankN161)); // Math.162
  float tankN163 = ((1.0) - (tankN162)); // Math.163
  float tankN164 = ((tankN153) * (tankN163)); // Math.164
  float tankN165 = ((tankN164) * (tankN114)); // Math.165
  float tankN166 = ((tankN79) * (tankN165)); // Math.166
  float tankN167 = ((tankN142) + (tankN166)); // Math.167
  return TankBlinkData(vec2(tankN117, tankN167));
}

vec3 tankApplyBaseColor(vec3 textureBaseColor, TankBlinkData blinkData) {
  vec3 tankN0 = mix(textureBaseColor, vec3(0.991100013256073, 0.7200000286102295, 0.46000000834465027), clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 tankN1 = mix(tankN0, vec3(0.02199999988079071, 0.004999999888241291, 0.0020000000949949026), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).001
  return tankN1;
}

float tankApplyRoughness(float textureRoughness, TankBlinkData blinkData) {
  float tankN0 = ((1.0) - (blinkData.masks.x)); // Math.168
  float tankN1 = ((textureRoughness) * (tankN0)); // Math.169
  float tankN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.170
  float tankN3 = ((tankN1) + (tankN2)); // Math.171
  return tankN3;
}

float tankNormalStrength(TankBlinkData blinkData) {
  float tankN0 = ((1.0) - (blinkData.masks.x)); // Math.172
  return tankN0;
}

float tankSpecularIORLevel(TankBlinkData blinkData) {
  float tankN0 = ((1.0) - (blinkData.masks.x)); // Math.173
  float tankN1 = ((0.5) * (tankN0)); // Math.174
  float tankN2 = ((0.11999999731779099) * (blinkData.masks.x)); // Math.175
  float tankN3 = ((tankN1) + (tankN2)); // Math.176
  return tankN3;
}

vec3 tankApplySurfaceNormal(vec3 mappedNormal, vec3 geometryTrueNormal, TankBlinkData blinkData) {
  vec3 tankN0 = mix(mappedNormal, geometryTrueNormal, clamp(blinkData.masks.x, 0.0, 1.0)); // Blink_Actual_Surface_Normal
  vec3 tankN1 = tankSafeNormalize(tankN0); // Vector Math
  return tankN1;
}
`;
export const tankSourceIOR = 1.5;

export function sampleTankBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) throw new Error('Tank blink samples missing: preserve animation extras as clip.userData');
  if (!Number.isFinite(seconds)) throw new Error('Tank clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installTankMaterialAdapter(root, options = {}) {
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
      if (material?.name !== 'Knight_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Tank rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Tank requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Tank requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Tank Knight_Blink_Surface material missing');
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
      shader.uniforms.tankBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 tankRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntankRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 tankRestPosition; uniform float tankBlink;\n' + tankBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        TankBlinkData tankBlinkData = tankEvaluateBlink(tankRestPosition, tankBlink);
        diffuseColor.rgb = tankApplyBaseColor(diffuseColor.rgb, tankBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = tankApplyRoughness(roughnessFactor, tankBlinkData);`);
      // Blender tangent Normal Map strength scales XY AND blends Z toward 1.
      // Derivatives of the fully deformed position give Geometry True Normal,
      // rather than the smooth interpolated (nonPerturbedNormal) vertex normal.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float tankStrength = tankNormalStrength(tankBlinkData);
          vec3 tankMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          tankMapN.xy *= normalScale * tankStrength;
          tankMapN.z = mix(1.0, tankMapN.z, clamp(tankStrength, 0.0, 1.0));
          normal = tankSafeNormalize(tbn * tankMapN);
        #else
          #include <normal_fragment_maps>
        #endif
        vec3 tankTrueNormal = tankSafeNormalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        normal = tankApplySurfaceNormal(normal, tankTrueNormal, tankBlinkData);`);
      // The exact source graph yields the Blender Specular IOR Level. Its
      // dielectric F0 is F0(IOR) * (2 * level), with F90=1; metallic color stays.
      // This preserves source inputs, not a claim of identical renderer BRDFs.
      const f0 = ((tankSourceIOR - 1) / (tankSourceIOR + 1)) ** 2;
      const specularBridge = `
        vec3 tankDielectricF0 = vec3(${f0.toPrecision(17)} * 2.0 * max(tankSpecularIORLevel(tankBlinkData), 0.0));
        ${splitF0 ? 'material.specularColor = tankDielectricF0;\n        material.specularColorBlended = mix(tankDielectricF0, diffuseColor.rgb, metalnessFactor);' : 'material.specularColor = mix(tankDielectricF0, diffuseColor.rgb, metalnessFactor);'}
        material.specularF90 = 1.0;`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + specularBridge);
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}:tank-source-blink-v1-${splitF0 ? 'split' : 'mixed'}`;
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
      if (disposed) throw new Error('Tank material adapter is disposed');
      // Same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns loops/crossfades and switching the separate Tank roots.
      uniform.value = sampleTankBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Tank blink update');
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
