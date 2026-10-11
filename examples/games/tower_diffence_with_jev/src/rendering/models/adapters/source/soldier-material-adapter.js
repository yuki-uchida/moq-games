// Knight_Blink_Surface only; the sleeve/glove source Noise->Bump is embedded in
// the candidate GLB as per-object tangent normal bakes. No runtime noise omitted.
// Requires Three.js Standard/Physical chunks using vNormalMapUv, tbn and
// lights_physical_fragment. glTF _BLINKRESTPOSITION becomes _blinkrestposition.
export const soldierBlinkGLSL = `// Exact Knight_Blink_Surface graph, Blender rest coordinates and linear RGB.
struct SoldierBlinkData { float cover; float line; };

SoldierBlinkData soldierEvaluateBlink(vec3 soldierRest, float soldierBlink) {
  float soldierN0 = (((soldierRest).x) - (-0.054999999701976776)); // Math
  float soldierN1 = ((0.0989999994635582) == 0.0 ? 0.0 : (soldierN0) / (0.0989999994635582)); // Math.001
  float soldierN2 = ((soldierN1) * (soldierN1)); // Math.004
  float soldierN3 = (((soldierRest).z) - (0.8700000047683716)); // Math.002
  float soldierN4 = ((0.10400000214576721) == 0.0 ? 0.0 : (soldierN3) / (0.10400000214576721)); // Math.003
  float soldierN5 = ((soldierN4) * (soldierN4)); // Math.005
  float soldierN6 = ((soldierN2) + (soldierN5)); // Math.006
  float soldierN7 = sqrt(max(soldierN6, 0.0)); // Math.007
  float soldierN8 = ((soldierN7) - (0.9599999785423279)); // Math.008
  float soldierN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (soldierN8) / (0.05999999865889549)); // Math.009
  float soldierN10 = max(soldierN9, 0.0); // Math.010
  float soldierN11 = min(soldierN10, 1.0); // Math.011
  float soldierN12 = ((soldierN11) * (soldierN11)); // Math.012
  float soldierN13 = ((2.0) * (soldierN11)); // Math.013
  float soldierN14 = ((3.0) - (soldierN13)); // Math.014
  float soldierN15 = ((soldierN12) * (soldierN14)); // Math.015
  float soldierN16 = ((1.0) - (soldierN15)); // Math.016
  float soldierN17 = (((soldierRest).y) < (-0.24500000476837158) ? 1.0 : 0.0); // Math.017
  float soldierN18 = (((soldierRest).y) > (-0.40299999713897705) ? 1.0 : 0.0); // Math.018
  float soldierN19 = ((soldierN17) * (soldierN18)); // Math.019
  float soldierN20 = ((soldierN16) * (soldierN19)); // Math.020
  float soldierN21 = ((0.14399999380111694) * (soldierBlink)); // Math.025
  float soldierN22 = ((0.10400000214576721) - (soldierN21)); // Math.026
  float soldierN23 = ((soldierN1) * (soldierN1)); // Math.021
  float soldierN24 = ((1.0) - (soldierN23)); // Math.022
  float soldierN25 = max(soldierN24, 0.0); // Math.023
  float soldierN26 = sqrt(max(soldierN25, 0.0)); // Math.024
  float soldierN27 = ((soldierN22) * (soldierN26)); // Math.027
  float soldierN28 = ((0.8700000047683716) + (soldierN27)); // Math.028
  float soldierN29 = (((soldierRest).z) - (soldierN28)); // Math.033
  float soldierN30 = ((soldierN29) - (-0.0007999999797903001)); // Math.034
  float soldierN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (soldierN30) / (0.0015999999595806003)); // Math.035
  float soldierN32 = max(soldierN31, 0.0); // Math.036
  float soldierN33 = min(soldierN32, 1.0); // Math.037
  float soldierN34 = ((soldierN33) * (soldierN33)); // Math.038
  float soldierN35 = ((2.0) * (soldierN33)); // Math.039
  float soldierN36 = ((3.0) - (soldierN35)); // Math.040
  float soldierN37 = ((soldierN34) * (soldierN36)); // Math.041
  float soldierN38 = ((0.06400000303983688) * (soldierBlink)); // Math.029
  float soldierN39 = ((-0.10400000214576721) + (soldierN38)); // Math.030
  float soldierN40 = ((soldierN39) * (soldierN26)); // Math.031
  float soldierN41 = ((0.8700000047683716) + (soldierN40)); // Math.032
  float soldierN42 = (((soldierRest).z) - (soldierN41)); // Math.042
  float soldierN43 = ((soldierN42) - (-0.0007999999797903001)); // Math.043
  float soldierN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (soldierN43) / (0.0015999999595806003)); // Math.044
  float soldierN45 = max(soldierN44, 0.0); // Math.045
  float soldierN46 = min(soldierN45, 1.0); // Math.046
  float soldierN47 = ((soldierN46) * (soldierN46)); // Math.047
  float soldierN48 = ((2.0) * (soldierN46)); // Math.048
  float soldierN49 = ((3.0) - (soldierN48)); // Math.049
  float soldierN50 = ((soldierN47) * (soldierN49)); // Math.050
  float soldierN51 = ((1.0) - (soldierN50)); // Math.051
  float soldierN52 = ((soldierN37) + (soldierN51)); // Math.052
  float soldierN53 = min(soldierN52, 1.0); // Math.053
  float soldierN54 = ((soldierBlink) * (20.0)); // Math.054
  float soldierN55 = min(soldierN54, 1.0); // Math.055
  float soldierN56 = ((soldierN53) * (soldierN55)); // Math.056
  float soldierN57 = ((soldierN20) * (soldierN56)); // Math.057
  float soldierN58 = ((0.0) + (soldierN57)); // Math.058
  float soldierN59 = (((soldierRest).x) - (0.3109999895095825)); // Math.084
  float soldierN60 = ((0.09700000286102295) == 0.0 ? 0.0 : (soldierN59) / (0.09700000286102295)); // Math.085
  float soldierN61 = ((soldierN60) * (soldierN60)); // Math.088
  float soldierN62 = (((soldierRest).z) - (0.8700000047683716)); // Math.086
  float soldierN63 = ((0.10400000214576721) == 0.0 ? 0.0 : (soldierN62) / (0.10400000214576721)); // Math.087
  float soldierN64 = ((soldierN63) * (soldierN63)); // Math.089
  float soldierN65 = ((soldierN61) + (soldierN64)); // Math.090
  float soldierN66 = sqrt(max(soldierN65, 0.0)); // Math.091
  float soldierN67 = ((soldierN66) - (0.9599999785423279)); // Math.092
  float soldierN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (soldierN67) / (0.05999999865889549)); // Math.093
  float soldierN69 = max(soldierN68, 0.0); // Math.094
  float soldierN70 = min(soldierN69, 1.0); // Math.095
  float soldierN71 = ((soldierN70) * (soldierN70)); // Math.096
  float soldierN72 = ((2.0) * (soldierN70)); // Math.097
  float soldierN73 = ((3.0) - (soldierN72)); // Math.098
  float soldierN74 = ((soldierN71) * (soldierN73)); // Math.099
  float soldierN75 = ((1.0) - (soldierN74)); // Math.100
  float soldierN76 = (((soldierRest).y) < (-0.24500000476837158) ? 1.0 : 0.0); // Math.101
  float soldierN77 = (((soldierRest).y) > (-0.40299999713897705) ? 1.0 : 0.0); // Math.102
  float soldierN78 = ((soldierN76) * (soldierN77)); // Math.103
  float soldierN79 = ((soldierN75) * (soldierN78)); // Math.104
  float soldierN80 = ((0.14399999380111694) * (soldierBlink)); // Math.109
  float soldierN81 = ((0.10400000214576721) - (soldierN80)); // Math.110
  float soldierN82 = ((soldierN60) * (soldierN60)); // Math.105
  float soldierN83 = ((1.0) - (soldierN82)); // Math.106
  float soldierN84 = max(soldierN83, 0.0); // Math.107
  float soldierN85 = sqrt(max(soldierN84, 0.0)); // Math.108
  float soldierN86 = ((soldierN81) * (soldierN85)); // Math.111
  float soldierN87 = ((0.8700000047683716) + (soldierN86)); // Math.112
  float soldierN88 = (((soldierRest).z) - (soldierN87)); // Math.117
  float soldierN89 = ((soldierN88) - (-0.0007999999797903001)); // Math.118
  float soldierN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (soldierN89) / (0.0015999999595806003)); // Math.119
  float soldierN91 = max(soldierN90, 0.0); // Math.120
  float soldierN92 = min(soldierN91, 1.0); // Math.121
  float soldierN93 = ((soldierN92) * (soldierN92)); // Math.122
  float soldierN94 = ((2.0) * (soldierN92)); // Math.123
  float soldierN95 = ((3.0) - (soldierN94)); // Math.124
  float soldierN96 = ((soldierN93) * (soldierN95)); // Math.125
  float soldierN97 = ((0.06400000303983688) * (soldierBlink)); // Math.113
  float soldierN98 = ((-0.10400000214576721) + (soldierN97)); // Math.114
  float soldierN99 = ((soldierN98) * (soldierN85)); // Math.115
  float soldierN100 = ((0.8700000047683716) + (soldierN99)); // Math.116
  float soldierN101 = (((soldierRest).z) - (soldierN100)); // Math.126
  float soldierN102 = ((soldierN101) - (-0.0007999999797903001)); // Math.127
  float soldierN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (soldierN102) / (0.0015999999595806003)); // Math.128
  float soldierN104 = max(soldierN103, 0.0); // Math.129
  float soldierN105 = min(soldierN104, 1.0); // Math.130
  float soldierN106 = ((soldierN105) * (soldierN105)); // Math.131
  float soldierN107 = ((2.0) * (soldierN105)); // Math.132
  float soldierN108 = ((3.0) - (soldierN107)); // Math.133
  float soldierN109 = ((soldierN106) * (soldierN108)); // Math.134
  float soldierN110 = ((1.0) - (soldierN109)); // Math.135
  float soldierN111 = ((soldierN96) + (soldierN110)); // Math.136
  float soldierN112 = min(soldierN111, 1.0); // Math.137
  float soldierN113 = ((soldierBlink) * (20.0)); // Math.138
  float soldierN114 = min(soldierN113, 1.0); // Math.139
  float soldierN115 = ((soldierN112) * (soldierN114)); // Math.140
  float soldierN116 = ((soldierN79) * (soldierN115)); // Math.141
  float soldierN117 = ((soldierN58) + (soldierN116)); // Math.142
  float soldierN118 = (((soldierRest).z) - (soldierN28)); // Math.059
  float soldierN119 = abs(soldierN118); // Math.060
  float soldierN120 = ((soldierN119) - (0.006500000134110451)); // Math.061
  float soldierN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (soldierN120) / (0.0044999998062849045)); // Math.062
  float soldierN122 = max(soldierN121, 0.0); // Math.063
  float soldierN123 = min(soldierN122, 1.0); // Math.064
  float soldierN124 = ((soldierN123) * (soldierN123)); // Math.065
  float soldierN125 = ((2.0) * (soldierN123)); // Math.066
  float soldierN126 = ((3.0) - (soldierN125)); // Math.067
  float soldierN127 = ((soldierN124) * (soldierN126)); // Math.068
  float soldierN128 = ((1.0) - (soldierN127)); // Math.069
  float soldierN129 = abs(soldierN1); // Math.070
  float soldierN130 = ((soldierN129) - (0.8999999761581421)); // Math.071
  float soldierN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (soldierN130) / (0.10000000149011612)); // Math.072
  float soldierN132 = max(soldierN131, 0.0); // Math.073
  float soldierN133 = min(soldierN132, 1.0); // Math.074
  float soldierN134 = ((soldierN133) * (soldierN133)); // Math.075
  float soldierN135 = ((2.0) * (soldierN133)); // Math.076
  float soldierN136 = ((3.0) - (soldierN135)); // Math.077
  float soldierN137 = ((soldierN134) * (soldierN136)); // Math.078
  float soldierN138 = ((1.0) - (soldierN137)); // Math.079
  float soldierN139 = ((soldierN128) * (soldierN138)); // Math.080
  float soldierN140 = ((soldierN139) * (soldierN55)); // Math.081
  float soldierN141 = ((soldierN20) * (soldierN140)); // Math.082
  float soldierN142 = ((0.0) + (soldierN141)); // Math.083
  float soldierN143 = (((soldierRest).z) - (soldierN87)); // Math.143
  float soldierN144 = abs(soldierN143); // Math.144
  float soldierN145 = ((soldierN144) - (0.006500000134110451)); // Math.145
  float soldierN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (soldierN145) / (0.0044999998062849045)); // Math.146
  float soldierN147 = max(soldierN146, 0.0); // Math.147
  float soldierN148 = min(soldierN147, 1.0); // Math.148
  float soldierN149 = ((soldierN148) * (soldierN148)); // Math.149
  float soldierN150 = ((2.0) * (soldierN148)); // Math.150
  float soldierN151 = ((3.0) - (soldierN150)); // Math.151
  float soldierN152 = ((soldierN149) * (soldierN151)); // Math.152
  float soldierN153 = ((1.0) - (soldierN152)); // Math.153
  float soldierN154 = abs(soldierN60); // Math.154
  float soldierN155 = ((soldierN154) - (0.8999999761581421)); // Math.155
  float soldierN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (soldierN155) / (0.10000000149011612)); // Math.156
  float soldierN157 = max(soldierN156, 0.0); // Math.157
  float soldierN158 = min(soldierN157, 1.0); // Math.158
  float soldierN159 = ((soldierN158) * (soldierN158)); // Math.159
  float soldierN160 = ((2.0) * (soldierN158)); // Math.160
  float soldierN161 = ((3.0) - (soldierN160)); // Math.161
  float soldierN162 = ((soldierN159) * (soldierN161)); // Math.162
  float soldierN163 = ((1.0) - (soldierN162)); // Math.163
  float soldierN164 = ((soldierN153) * (soldierN163)); // Math.164
  float soldierN165 = ((soldierN164) * (soldierN114)); // Math.165
  float soldierN166 = ((soldierN79) * (soldierN165)); // Math.166
  float soldierN167 = ((soldierN142) + (soldierN166)); // Math.167
  return SoldierBlinkData(soldierN117, soldierN167);
}

vec3 soldierApplyBaseColor(vec3 textureBaseColor, SoldierBlinkData blinkData) {
  vec3 soldierN0 = mix(textureBaseColor, vec3(0.991100013256073, 0.6938999891281128, 0.5210000276565552), clamp(blinkData.cover, 0.0, 1.0)); // Mix (Legacy)
  vec3 soldierN1 = mix(soldierN0, vec3(0.02199999988079071, 0.004999999888241291, 0.0020000000949949026), clamp(blinkData.line, 0.0, 1.0)); // Mix (Legacy).001
  return soldierN1;
}

float soldierApplyRoughness(float textureRoughness, SoldierBlinkData blinkData) {
  float soldierN0 = ((1.0) - (blinkData.cover)); // Math.168
  float soldierN1 = ((textureRoughness) * (soldierN0)); // Math.169
  float soldierN2 = ((0.6800000071525574) * (blinkData.cover)); // Math.170
  float soldierN3 = ((soldierN1) + (soldierN2)); // Math.171
  return soldierN3;
}

float soldierNormalStrength(SoldierBlinkData blinkData) {
  float soldierN0 = ((1.0) - (blinkData.cover)); // Math.172
  return soldierN0;
}

float soldierSpecularIORLevel(SoldierBlinkData blinkData) {
  float soldierN0 = ((1.0) - (blinkData.cover)); // Math.173
  float soldierN1 = ((0.5) * (soldierN0)); // Math.174
  float soldierN2 = ((0.11999999731779099) * (blinkData.cover)); // Math.175
  float soldierN3 = ((soldierN1) + (soldierN2)); // Math.176
  return soldierN3;
}

vec3 soldierSurfaceNormal(vec3 mappedNormal, vec3 trueNormal, SoldierBlinkData blinkData) {
  vec3 soldierN0 = mix(mappedNormal, trueNormal, clamp(blinkData.cover, 0.0, 1.0)); // Blink_Actual_Surface_Normal
  vec3 soldierN1 = normalize(soldierN0); // Vector Math
  return soldierN1;
}
`;
export function sampleSoldierBlink(clip, seconds) {
 const samples=clip?.userData?.blinkAmountSamples;
 if (!samples?.length) throw new Error('Soldier blink samples missing: copy animation extras into clip.userData');
 if (!Number.isFinite(seconds)) throw new Error('Soldier clip-local time must be finite');
 let lo=0,hi=samples.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid][0]<=seconds)lo=mid;else hi=mid-1;}
 const a=samples[lo],b=samples[Math.min(lo+1,samples.length-1)];
 const t=b[0]===a[0]?0:Math.max(0,Math.min(1,(seconds-a[0])/(b[0]-a[0])));
 return a[1]+(b[1]-a[1])*t;
}
export function installSoldierMaterialAdapter(root) {
 const uniform={value:0},clones=new Map(),targets=[],bindings=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(material?.name!=='Knight_Blink_Surface')continue;
   const attr=mesh.geometry?.getAttribute('_blinkrestposition');
   if(!attr||attr.itemSize!==3)throw new Error('Soldier rest-position vec3 attribute missing');
   if(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial)throw new Error('Soldier requires a standard or physical PBR material');
   if(material.normalMap&&material.normalMapType!==0)throw new Error('Soldier requires a tangent-space normal map');
   targets.push([mesh,material]);
  }
 });
 if(!targets.length)throw new Error('Knight_Blink_Surface material missing');
 for(const [,original] of targets){
  if(clones.has(original))continue;
  const material=original.clone(),previousHook=original.onBeforeCompile,previousKey=original.customProgramCacheKey?.bind(original);
  material.onBeforeCompile=(shader,renderer)=>{
   previousHook?.call(material,shader,renderer);
   if(!shader.vertexShader.includes('#include <begin_vertex>'))throw new Error('Unsupported Three vertex shader: begin_vertex');
   for(const marker of ['#include <map_fragment>','#include <roughnessmap_fragment>','#include <normal_fragment_maps>','#include <lights_physical_fragment>'])if(!shader.fragmentShader.includes(marker))throw new Error('Unsupported Three fragment shader: '+marker);
   shader.uniforms.soldierBlink=uniform;
   shader.vertexShader='attribute vec3 _blinkrestposition; varying vec3 soldierRestPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsoldierRestPosition = _blinkrestposition;');
   shader.fragmentShader='varying vec3 soldierRestPosition; uniform float soldierBlink;\n'+soldierBlinkGLSL+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    SoldierBlinkData soldierBlinkData = soldierEvaluateBlink(soldierRestPosition, soldierBlink);
    diffuseColor.rgb = soldierApplyBaseColor(diffuseColor.rgb, soldierBlinkData);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor = soldierApplyRoughness(roughnessFactor, soldierBlinkData);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
    #ifdef USE_NORMALMAP_TANGENTSPACE
      float soldierStrength = soldierNormalStrength(soldierBlinkData);
      vec3 soldierMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
      soldierMapN.xy *= normalScale * soldierStrength;
      soldierMapN.z = mix(1.0, soldierMapN.z, clamp(soldierStrength, 0.0, 1.0));
      normal = normalize(tbn * soldierMapN);
    #else
      #include <normal_fragment_maps>
    #endif
    // Geometry True Normal is the actual deformed triangle face normal.
    vec3 soldierTrueNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    // Derivative normals are already face-forward, as in Three FLAT_SHADED.
    normal = soldierSurfaceNormal(normal, soldierTrueNormal, soldierBlinkData);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
    // Blender source IOR=1.5, white tint: dielectric F0=0.08*Specular IOR Level.
    // Keep the source metallic channel, so metallic regions retain colored F0.
    material.specularColor = mix(vec3(0.08 * soldierSpecularIORLevel(soldierBlinkData)), diffuseColor.rgb, metalnessFactor);`);
  };
  material.customProgramCacheKey=()=> (previousKey?.()||'')+'|soldier-source-blink-specular-true-normal-v1';
  material.needsUpdate=true;clones.set(original,material);
 }
 for(const mesh of new Set(targets.map(([mesh])=>mesh))){
  const original=mesh.material,adapted=Array.isArray(original)?original.map(m=>clones.get(m)||m):clones.get(original);
  mesh.material=adapted;bindings.push({mesh,original,adapted});
 }
 let disposed=false;
 return {
  update(clip,clipLocalSeconds){if(disposed)throw new Error('Soldier material adapter is disposed');uniform.value=sampleSoldierBlink(clip,clipLocalSeconds);},
  setBlinkAmount(value){if(disposed||!Number.isFinite(value))throw new Error('Invalid Soldier blink update');uniform.value=value;},
  dispose(){if(disposed)return;for(const {mesh,original,adapted} of bindings)if(mesh.material===adapted)mesh.material=original;for(const material of clones.values())material.dispose();disposed=true;}
 };
}
