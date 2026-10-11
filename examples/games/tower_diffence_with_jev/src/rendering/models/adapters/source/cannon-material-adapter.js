// Cannon source Cannon_Blink_Surface only. Derived assets; no gameplay-clock edits.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition in GLTFLoader.
// Pass THREE, {THREE}, or {lightsPhysicalFragment: THREE.ShaderChunk.lights_physical_fragment}
// to detect legacy mixed-F0 versus newer split-F0 shader layouts. No option means
// the established Three r180 mixed-F0 layout; it does not assert a runtime version.
// Install before Cannon's DQ adapter. Dispose DQ before disposing this adapter.
export const cannonBlinkGLSL = `// Generated only from Cannon source Cannon_Blink_Surface. Coordinates are Blender rest space.
struct CannonBlinkData { vec2 masks; vec3 rest; };

vec3 cannonSafeNormalize(vec3 v) { float magnitude = length(v); return magnitude > 0.0 ? v / magnitude : vec3(0.0); }

CannonBlinkData cannonEvaluateBlink(vec3 cannonRest, float cannonBlink) {
  float cannonN0 = (((cannonRest).x) - (-0.18799999356269836)); // Math
  float cannonN1 = ((0.11900000274181366) == 0.0 ? 0.0 : (cannonN0) / (0.11900000274181366)); // Math.001
  float cannonN2 = ((cannonN1) * (cannonN1)); // Math.004
  float cannonN3 = (((cannonRest).z) - (0.23399999737739563)); // Math.002
  float cannonN4 = ((0.10400000214576721) == 0.0 ? 0.0 : (cannonN3) / (0.10400000214576721)); // Math.003
  float cannonN5 = ((cannonN4) * (cannonN4)); // Math.005
  float cannonN6 = ((cannonN2) + (cannonN5)); // Math.006
  float cannonN7 = sqrt(max(cannonN6, 0.0)); // Math.007
  float cannonN8 = ((cannonN7) - (0.9599999785423279)); // Math.008
  float cannonN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (cannonN8) / (0.05999999865889549)); // Math.009
  float cannonN10 = max(cannonN9, 0.0); // Math.010
  float cannonN11 = min(cannonN10, 1.0); // Math.011
  float cannonN12 = ((cannonN11) * (cannonN11)); // Math.012
  float cannonN13 = ((2.0) * (cannonN11)); // Math.013
  float cannonN14 = ((3.0) - (cannonN13)); // Math.014
  float cannonN15 = ((cannonN12) * (cannonN14)); // Math.015
  float cannonN16 = ((1.0) - (cannonN15)); // Math.016
  float cannonN17 = (((cannonRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.017
  float cannonN18 = (((cannonRest).y) > (-0.3100000023841858) ? 1.0 : 0.0); // Math.018
  float cannonN19 = ((cannonN17) * (cannonN18)); // Math.019
  float cannonN20 = ((cannonN16) * (cannonN19)); // Math.020
  float cannonN21 = ((0.1289999932050705) * (cannonBlink)); // Math.025
  float cannonN22 = ((0.10400000214576721) - (cannonN21)); // Math.026
  float cannonN23 = ((cannonN1) * (cannonN1)); // Math.021
  float cannonN24 = ((1.0) - (cannonN23)); // Math.022
  float cannonN25 = max(cannonN24, 0.0); // Math.023
  float cannonN26 = sqrt(max(cannonN25, 0.0)); // Math.024
  float cannonN27 = ((cannonN22) * (cannonN26)); // Math.027
  float cannonN28 = ((0.23399999737739563) + (cannonN27)); // Math.028
  float cannonN29 = (((cannonRest).z) - (cannonN28)); // Math.033
  float cannonN30 = ((cannonN29) - (-0.0007999999797903001)); // Math.034
  float cannonN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (cannonN30) / (0.0015999999595806003)); // Math.035
  float cannonN32 = max(cannonN31, 0.0); // Math.036
  float cannonN33 = min(cannonN32, 1.0); // Math.037
  float cannonN34 = ((cannonN33) * (cannonN33)); // Math.038
  float cannonN35 = ((2.0) * (cannonN33)); // Math.039
  float cannonN36 = ((3.0) - (cannonN35)); // Math.040
  float cannonN37 = ((cannonN34) * (cannonN36)); // Math.041
  float cannonN38 = ((0.07900000363588333) * (cannonBlink)); // Math.029
  float cannonN39 = ((-0.10400000214576721) + (cannonN38)); // Math.030
  float cannonN40 = ((cannonN39) * (cannonN26)); // Math.031
  float cannonN41 = ((0.23399999737739563) + (cannonN40)); // Math.032
  float cannonN42 = (((cannonRest).z) - (cannonN41)); // Math.042
  float cannonN43 = ((cannonN42) - (-0.0007999999797903001)); // Math.043
  float cannonN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (cannonN43) / (0.0015999999595806003)); // Math.044
  float cannonN45 = max(cannonN44, 0.0); // Math.045
  float cannonN46 = min(cannonN45, 1.0); // Math.046
  float cannonN47 = ((cannonN46) * (cannonN46)); // Math.047
  float cannonN48 = ((2.0) * (cannonN46)); // Math.048
  float cannonN49 = ((3.0) - (cannonN48)); // Math.049
  float cannonN50 = ((cannonN47) * (cannonN49)); // Math.050
  float cannonN51 = ((1.0) - (cannonN50)); // Math.051
  float cannonN52 = ((cannonN37) + (cannonN51)); // Math.052
  float cannonN53 = min(cannonN52, 1.0); // Math.053
  float cannonN54 = ((cannonBlink) * (20.0)); // Math.054
  float cannonN55 = min(cannonN54, 1.0); // Math.055
  float cannonN56 = ((cannonN53) * (cannonN55)); // Math.056
  float cannonN57 = ((cannonN20) * (cannonN56)); // Math.057
  float cannonN58 = ((0.0) + (cannonN57)); // Math.058
  float cannonN59 = (((cannonRest).x) - (0.1889999955892563)); // Math.084
  float cannonN60 = ((0.11999999731779099) == 0.0 ? 0.0 : (cannonN59) / (0.11999999731779099)); // Math.085
  float cannonN61 = ((cannonN60) * (cannonN60)); // Math.088
  float cannonN62 = (((cannonRest).z) - (0.23399999737739563)); // Math.086
  float cannonN63 = ((0.10400000214576721) == 0.0 ? 0.0 : (cannonN62) / (0.10400000214576721)); // Math.087
  float cannonN64 = ((cannonN63) * (cannonN63)); // Math.089
  float cannonN65 = ((cannonN61) + (cannonN64)); // Math.090
  float cannonN66 = sqrt(max(cannonN65, 0.0)); // Math.091
  float cannonN67 = ((cannonN66) - (0.9599999785423279)); // Math.092
  float cannonN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (cannonN67) / (0.05999999865889549)); // Math.093
  float cannonN69 = max(cannonN68, 0.0); // Math.094
  float cannonN70 = min(cannonN69, 1.0); // Math.095
  float cannonN71 = ((cannonN70) * (cannonN70)); // Math.096
  float cannonN72 = ((2.0) * (cannonN70)); // Math.097
  float cannonN73 = ((3.0) - (cannonN72)); // Math.098
  float cannonN74 = ((cannonN71) * (cannonN73)); // Math.099
  float cannonN75 = ((1.0) - (cannonN74)); // Math.100
  float cannonN76 = (((cannonRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.101
  float cannonN77 = (((cannonRest).y) > (-0.3100000023841858) ? 1.0 : 0.0); // Math.102
  float cannonN78 = ((cannonN76) * (cannonN77)); // Math.103
  float cannonN79 = ((cannonN75) * (cannonN78)); // Math.104
  float cannonN80 = ((0.1289999932050705) * (cannonBlink)); // Math.109
  float cannonN81 = ((0.10400000214576721) - (cannonN80)); // Math.110
  float cannonN82 = ((cannonN60) * (cannonN60)); // Math.105
  float cannonN83 = ((1.0) - (cannonN82)); // Math.106
  float cannonN84 = max(cannonN83, 0.0); // Math.107
  float cannonN85 = sqrt(max(cannonN84, 0.0)); // Math.108
  float cannonN86 = ((cannonN81) * (cannonN85)); // Math.111
  float cannonN87 = ((0.23399999737739563) + (cannonN86)); // Math.112
  float cannonN88 = (((cannonRest).z) - (cannonN87)); // Math.117
  float cannonN89 = ((cannonN88) - (-0.0007999999797903001)); // Math.118
  float cannonN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (cannonN89) / (0.0015999999595806003)); // Math.119
  float cannonN91 = max(cannonN90, 0.0); // Math.120
  float cannonN92 = min(cannonN91, 1.0); // Math.121
  float cannonN93 = ((cannonN92) * (cannonN92)); // Math.122
  float cannonN94 = ((2.0) * (cannonN92)); // Math.123
  float cannonN95 = ((3.0) - (cannonN94)); // Math.124
  float cannonN96 = ((cannonN93) * (cannonN95)); // Math.125
  float cannonN97 = ((0.07900000363588333) * (cannonBlink)); // Math.113
  float cannonN98 = ((-0.10400000214576721) + (cannonN97)); // Math.114
  float cannonN99 = ((cannonN98) * (cannonN85)); // Math.115
  float cannonN100 = ((0.23399999737739563) + (cannonN99)); // Math.116
  float cannonN101 = (((cannonRest).z) - (cannonN100)); // Math.126
  float cannonN102 = ((cannonN101) - (-0.0007999999797903001)); // Math.127
  float cannonN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (cannonN102) / (0.0015999999595806003)); // Math.128
  float cannonN104 = max(cannonN103, 0.0); // Math.129
  float cannonN105 = min(cannonN104, 1.0); // Math.130
  float cannonN106 = ((cannonN105) * (cannonN105)); // Math.131
  float cannonN107 = ((2.0) * (cannonN105)); // Math.132
  float cannonN108 = ((3.0) - (cannonN107)); // Math.133
  float cannonN109 = ((cannonN106) * (cannonN108)); // Math.134
  float cannonN110 = ((1.0) - (cannonN109)); // Math.135
  float cannonN111 = ((cannonN96) + (cannonN110)); // Math.136
  float cannonN112 = min(cannonN111, 1.0); // Math.137
  float cannonN113 = ((cannonBlink) * (20.0)); // Math.138
  float cannonN114 = min(cannonN113, 1.0); // Math.139
  float cannonN115 = ((cannonN112) * (cannonN114)); // Math.140
  float cannonN116 = ((cannonN79) * (cannonN115)); // Math.141
  float cannonN117 = ((cannonN58) + (cannonN116)); // Math.142
  float cannonN118 = (((cannonRest).z) - (cannonN28)); // Math.059
  float cannonN119 = abs(cannonN118); // Math.060
  float cannonN120 = ((cannonN119) - (0.0044999998062849045)); // Math.061
  float cannonN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (cannonN120) / (0.0044999998062849045)); // Math.062
  float cannonN122 = max(cannonN121, 0.0); // Math.063
  float cannonN123 = min(cannonN122, 1.0); // Math.064
  float cannonN124 = ((cannonN123) * (cannonN123)); // Math.065
  float cannonN125 = ((2.0) * (cannonN123)); // Math.066
  float cannonN126 = ((3.0) - (cannonN125)); // Math.067
  float cannonN127 = ((cannonN124) * (cannonN126)); // Math.068
  float cannonN128 = ((1.0) - (cannonN127)); // Math.069
  float cannonN129 = abs(cannonN1); // Math.070
  float cannonN130 = ((cannonN129) - (0.8999999761581421)); // Math.071
  float cannonN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (cannonN130) / (0.10000000149011612)); // Math.072
  float cannonN132 = max(cannonN131, 0.0); // Math.073
  float cannonN133 = min(cannonN132, 1.0); // Math.074
  float cannonN134 = ((cannonN133) * (cannonN133)); // Math.075
  float cannonN135 = ((2.0) * (cannonN133)); // Math.076
  float cannonN136 = ((3.0) - (cannonN135)); // Math.077
  float cannonN137 = ((cannonN134) * (cannonN136)); // Math.078
  float cannonN138 = ((1.0) - (cannonN137)); // Math.079
  float cannonN139 = ((cannonN128) * (cannonN138)); // Math.080
  float cannonN140 = ((cannonN139) * (cannonN55)); // Math.081
  float cannonN141 = ((cannonN20) * (cannonN140)); // Math.082
  float cannonN142 = ((0.0) + (cannonN141)); // Math.083
  float cannonN143 = (((cannonRest).z) - (cannonN87)); // Math.143
  float cannonN144 = abs(cannonN143); // Math.144
  float cannonN145 = ((cannonN144) - (0.0044999998062849045)); // Math.145
  float cannonN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (cannonN145) / (0.0044999998062849045)); // Math.146
  float cannonN147 = max(cannonN146, 0.0); // Math.147
  float cannonN148 = min(cannonN147, 1.0); // Math.148
  float cannonN149 = ((cannonN148) * (cannonN148)); // Math.149
  float cannonN150 = ((2.0) * (cannonN148)); // Math.150
  float cannonN151 = ((3.0) - (cannonN150)); // Math.151
  float cannonN152 = ((cannonN149) * (cannonN151)); // Math.152
  float cannonN153 = ((1.0) - (cannonN152)); // Math.153
  float cannonN154 = abs(cannonN60); // Math.154
  float cannonN155 = ((cannonN154) - (0.8999999761581421)); // Math.155
  float cannonN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (cannonN155) / (0.10000000149011612)); // Math.156
  float cannonN157 = max(cannonN156, 0.0); // Math.157
  float cannonN158 = min(cannonN157, 1.0); // Math.158
  float cannonN159 = ((cannonN158) * (cannonN158)); // Math.159
  float cannonN160 = ((2.0) * (cannonN158)); // Math.160
  float cannonN161 = ((3.0) - (cannonN160)); // Math.161
  float cannonN162 = ((cannonN159) * (cannonN161)); // Math.162
  float cannonN163 = ((1.0) - (cannonN162)); // Math.163
  float cannonN164 = ((cannonN153) * (cannonN163)); // Math.164
  float cannonN165 = ((cannonN164) * (cannonN114)); // Math.165
  float cannonN166 = ((cannonN79) * (cannonN165)); // Math.166
  float cannonN167 = ((cannonN142) + (cannonN166)); // Math.167
  return CannonBlinkData(vec2(cannonN117, cannonN167), cannonRest);
}

vec3 cannonApplyBaseColor(vec3 textureBaseColor, CannonBlinkData blinkData) {
  float cannonN0 = ((0.9745716452598572) * (1.0)); // Math.175
  float cannonN1 = ((0.0) + (cannonN0)); // Math.176
  float cannonN2 = (((blinkData.rest).x) - (-0.18799999356269836)); // Math.168
  float cannonN3 = ((0.11900000274181366) == 0.0 ? 0.0 : (cannonN2) / (0.11900000274181366)); // Math.169
  float cannonN4 = ((0.010057440027594566) * (cannonN3)); // Math.177
  float cannonN5 = ((cannonN1) + (cannonN4)); // Math.178
  float cannonN6 = (((blinkData.rest).z) - (0.23399999737739563)); // Math.170
  float cannonN7 = ((0.10400000214576721) == 0.0 ? 0.0 : (cannonN6) / (0.10400000214576721)); // Math.171
  float cannonN8 = ((0.007149409037083387) * (cannonN7)); // Math.179
  float cannonN9 = ((cannonN5) + (cannonN8)); // Math.180
  float cannonN10 = ((cannonN3) * (cannonN3)); // Math.172
  float cannonN11 = ((-0.004068987909704447) * (cannonN10)); // Math.181
  float cannonN12 = ((cannonN9) + (cannonN11)); // Math.182
  float cannonN13 = ((cannonN3) * (cannonN7)); // Math.173
  float cannonN14 = ((-0.008601386100053787) * (cannonN13)); // Math.183
  float cannonN15 = ((cannonN12) + (cannonN14)); // Math.184
  float cannonN16 = ((cannonN7) * (cannonN7)); // Math.174
  float cannonN17 = ((-0.0022077274043112993) * (cannonN16)); // Math.185
  float cannonN18 = ((cannonN15) + (cannonN17)); // Math.186
  float cannonN19 = max(cannonN18, 0.0); // Math.187
  float cannonN20 = min(cannonN19, 1.0); // Math.188
  float cannonN21 = ((0.4721047282218933) * (1.0)); // Math.189
  float cannonN22 = ((0.0) + (cannonN21)); // Math.190
  float cannonN23 = ((0.06744071841239929) * (cannonN3)); // Math.191
  float cannonN24 = ((cannonN22) + (cannonN23)); // Math.192
  float cannonN25 = ((0.08438241481781006) * (cannonN7)); // Math.193
  float cannonN26 = ((cannonN24) + (cannonN25)); // Math.194
  float cannonN27 = ((0.0005859832745045424) * (cannonN10)); // Math.195
  float cannonN28 = ((cannonN26) + (cannonN27)); // Math.196
  float cannonN29 = ((-0.08393578231334686) * (cannonN13)); // Math.197
  float cannonN30 = ((cannonN28) + (cannonN29)); // Math.198
  float cannonN31 = ((-0.015949293971061707) * (cannonN16)); // Math.199
  float cannonN32 = ((cannonN30) + (cannonN31)); // Math.200
  float cannonN33 = max(cannonN32, 0.0); // Math.201
  float cannonN34 = min(cannonN33, 1.0); // Math.202
  float cannonN35 = ((0.3202328681945801) * (1.0)); // Math.203
  float cannonN36 = ((0.0) + (cannonN35)); // Math.204
  float cannonN37 = ((0.04091687127947807) * (cannonN3)); // Math.205
  float cannonN38 = ((cannonN36) + (cannonN37)); // Math.206
  float cannonN39 = ((0.058130789548158646) * (cannonN7)); // Math.207
  float cannonN40 = ((cannonN38) + (cannonN39)); // Math.208
  float cannonN41 = ((0.005047053564339876) * (cannonN10)); // Math.209
  float cannonN42 = ((cannonN40) + (cannonN41)); // Math.210
  float cannonN43 = ((-0.05729154869914055) * (cannonN13)); // Math.211
  float cannonN44 = ((cannonN42) + (cannonN43)); // Math.212
  float cannonN45 = ((-0.010610257275402546) * (cannonN16)); // Math.213
  float cannonN46 = ((cannonN44) + (cannonN45)); // Math.214
  float cannonN47 = max(cannonN46, 0.0); // Math.215
  float cannonN48 = min(cannonN47, 1.0); // Math.216
  vec3 cannonN49 = vec3(cannonN20, cannonN34, cannonN48); // Combine XYZ
  float cannonN50 = ((0.9801745414733887) * (1.0)); // Math.224
  float cannonN51 = ((0.0) + (cannonN50)); // Math.225
  float cannonN52 = (((blinkData.rest).x) - (0.1889999955892563)); // Math.217
  float cannonN53 = ((0.11999999731779099) == 0.0 ? 0.0 : (cannonN52) / (0.11999999731779099)); // Math.218
  float cannonN54 = ((-0.00810143444687128) * (cannonN53)); // Math.226
  float cannonN55 = ((cannonN51) + (cannonN54)); // Math.227
  float cannonN56 = (((blinkData.rest).z) - (0.23399999737739563)); // Math.219
  float cannonN57 = ((0.10400000214576721) == 0.0 ? 0.0 : (cannonN56) / (0.10400000214576721)); // Math.220
  float cannonN58 = ((0.006413477007299662) * (cannonN57)); // Math.228
  float cannonN59 = ((cannonN55) + (cannonN58)); // Math.229
  float cannonN60 = ((cannonN53) * (cannonN53)); // Math.221
  float cannonN61 = ((-0.005906666629016399) * (cannonN60)); // Math.230
  float cannonN62 = ((cannonN59) + (cannonN61)); // Math.231
  float cannonN63 = ((cannonN53) * (cannonN57)); // Math.222
  float cannonN64 = ((0.005400633439421654) * (cannonN63)); // Math.232
  float cannonN65 = ((cannonN62) + (cannonN64)); // Math.233
  float cannonN66 = ((cannonN57) * (cannonN57)); // Math.223
  float cannonN67 = ((-0.004931652918457985) * (cannonN66)); // Math.234
  float cannonN68 = ((cannonN65) + (cannonN67)); // Math.235
  float cannonN69 = max(cannonN68, 0.0); // Math.236
  float cannonN70 = min(cannonN69, 1.0); // Math.237
  float cannonN71 = ((0.4842199385166168) * (1.0)); // Math.238
  float cannonN72 = ((0.0) + (cannonN71)); // Math.239
  float cannonN73 = ((-0.05915115028619766) * (cannonN53)); // Math.240
  float cannonN74 = ((cannonN72) + (cannonN73)); // Math.241
  float cannonN75 = ((0.07808728516101837) * (cannonN57)); // Math.242
  float cannonN76 = ((cannonN74) + (cannonN75)); // Math.243
  float cannonN77 = ((0.00035324529744684696) * (cannonN60)); // Math.244
  float cannonN78 = ((cannonN76) + (cannonN77)); // Math.245
  float cannonN79 = ((0.07992393523454666) * (cannonN63)); // Math.246
  float cannonN80 = ((cannonN78) + (cannonN79)); // Math.247
  float cannonN81 = ((-0.024659212678670883) * (cannonN66)); // Math.248
  float cannonN82 = ((cannonN80) + (cannonN81)); // Math.249
  float cannonN83 = max(cannonN82, 0.0); // Math.250
  float cannonN84 = min(cannonN83, 1.0); // Math.251
  float cannonN85 = ((0.3259267508983612) * (1.0)); // Math.252
  float cannonN86 = ((0.0) + (cannonN85)); // Math.253
  float cannonN87 = ((-0.0362817645072937) * (cannonN53)); // Math.254
  float cannonN88 = ((cannonN86) + (cannonN87)); // Math.255
  float cannonN89 = ((0.05327955260872841) * (cannonN57)); // Math.256
  float cannonN90 = ((cannonN88) + (cannonN89)); // Math.257
  float cannonN91 = ((0.005591357592493296) * (cannonN60)); // Math.258
  float cannonN92 = ((cannonN90) + (cannonN91)); // Math.259
  float cannonN93 = ((0.05458487942814827) * (cannonN63)); // Math.260
  float cannonN94 = ((cannonN92) + (cannonN93)); // Math.261
  float cannonN95 = ((-0.014271955005824566) * (cannonN66)); // Math.262
  float cannonN96 = ((cannonN94) + (cannonN95)); // Math.263
  float cannonN97 = max(cannonN96, 0.0); // Math.264
  float cannonN98 = min(cannonN97, 1.0); // Math.265
  vec3 cannonN99 = vec3(cannonN70, cannonN84, cannonN98); // Combine XYZ.001
  float cannonN100 = (((blinkData.rest).x) > (0.0) ? 1.0 : 0.0); // Math.266
  vec3 cannonN101 = mix(cannonN49, cannonN99, clamp(cannonN100, 0.0, 1.0)); // Mix (Legacy).001
  vec3 cannonN102 = mix(textureBaseColor, cannonN101, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 cannonN103 = mix(cannonN102, vec3(0.03799999877810478, 0.004000000189989805, 0.002400000113993883), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return cannonN103;
}

float cannonApplyRoughness(float textureRoughness, CannonBlinkData blinkData) {
  float cannonN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float cannonN1 = ((textureRoughness) * (cannonN0)); // Math.268
  float cannonN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float cannonN3 = ((cannonN1) + (cannonN2)); // Math.270
  return cannonN3;
}

float cannonNormalStrength(CannonBlinkData blinkData) {
  float cannonN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return cannonN0;
}

float cannonSpecularIORLevel(CannonBlinkData blinkData) {

  return 0.5;
}

vec3 cannonApplySurfaceNormal(vec3 mappedNormal, vec3 geometryTrueNormal, CannonBlinkData blinkData) {

  return mappedNormal;
}
`;
export const cannonSourceIOR = 1.5;

export function sampleCannonBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) throw new Error('Cannon blink samples missing: preserve animation extras as clip.userData');
  if (!Number.isFinite(seconds)) throw new Error('Cannon clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installCannonMaterialAdapter(root, options = {}) {
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
      if (material?.name !== 'Cannon_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Cannon rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Cannon requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Cannon requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Cannon Cannon_Blink_Surface material missing');
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
      shader.uniforms.cannonBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 cannonRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncannonRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 cannonRestPosition; uniform float cannonBlink;\n' + cannonBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        CannonBlinkData cannonBlinkData = cannonEvaluateBlink(cannonRestPosition, cannonBlink);
        diffuseColor.rgb = cannonApplyBaseColor(diffuseColor.rgb, cannonBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = cannonApplyRoughness(roughnessFactor, cannonBlinkData);`);
      // Blender tangent Normal Map strength scales XY AND blends Z toward 1.
      // Derivatives of the fully deformed position give Geometry True Normal,
      // rather than the smooth interpolated (nonPerturbedNormal) vertex normal.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float cannonStrength = cannonNormalStrength(cannonBlinkData);
          vec3 cannonMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          cannonMapN.xy *= normalScale * cannonStrength;
          cannonMapN.z = mix(1.0, cannonMapN.z, clamp(cannonStrength, 0.0, 1.0));
          normal = cannonSafeNormalize(tbn * cannonMapN);
        #else
          #include <normal_fragment_maps>
        #endif
        vec3 cannonTrueNormal = cannonSafeNormalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        normal = cannonApplySurfaceNormal(normal, cannonTrueNormal, cannonBlinkData);`);
      // The exact source graph yields the Blender Specular IOR Level. Its
      // dielectric F0 is F0(IOR) * (2 * level), with F90=1; metallic color stays.
      // This preserves source inputs, not a claim of identical renderer BRDFs.
      const f0 = ((cannonSourceIOR - 1) / (cannonSourceIOR + 1)) ** 2;
      const specularBridge = `
        vec3 cannonDielectricF0 = vec3(${f0.toPrecision(17)} * 2.0 * max(cannonSpecularIORLevel(cannonBlinkData), 0.0));
        ${splitF0 ? 'material.specularColor = cannonDielectricF0;\n        material.specularColorBlended = mix(cannonDielectricF0, diffuseColor.rgb, metalnessFactor);' : 'material.specularColor = mix(cannonDielectricF0, diffuseColor.rgb, metalnessFactor);'}
        material.specularF90 = 1.0;`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + specularBridge);
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}:cannon-source-blink-v1-${splitF0 ? 'split' : 'mixed'}`;
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
      if (disposed) throw new Error('Cannon material adapter is disposed');
      // Same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns loops/crossfades and switching the separate Cannon roots.
      uniform.value = sampleCannonBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Cannon blink update');
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
