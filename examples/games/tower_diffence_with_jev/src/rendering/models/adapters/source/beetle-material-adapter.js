// Beetle_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const beetleBlinkGLSL = `// Generated only from Beetle_Blink_Surface. Input coordinates stay in Blender rest space.
struct BeetleBlinkData { vec2 masks; vec3 lidColor; };

BeetleBlinkData beetleEvaluateBlink(vec3 beetleRest, float beetleBlink) {
  float beetleN0 = (((beetleRest).x) - (-0.18770067393779755)); // Math
  float beetleN1 = ((0.07939400523900986) == 0.0 ? 0.0 : (beetleN0) / (0.07939400523900986)); // Math.001
  float beetleN2 = ((beetleN1) * (beetleN1)); // Math.004
  float beetleN3 = (((beetleRest).z) - (-0.12113749235868454)); // Math.002
  float beetleN4 = ((0.10812938213348389) == 0.0 ? 0.0 : (beetleN3) / (0.10812938213348389)); // Math.003
  float beetleN5 = ((beetleN4) * (beetleN4)); // Math.005
  float beetleN6 = ((beetleN2) + (beetleN5)); // Math.006
  float beetleN7 = sqrt(max(beetleN6, 0.0)); // Math.007
  float beetleN8 = ((beetleN7) - (0.9599999785423279)); // Math.008
  float beetleN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (beetleN8) / (0.05999999865889549)); // Math.009
  float beetleN10 = max(beetleN9, 0.0); // Math.010
  float beetleN11 = min(beetleN10, 1.0); // Math.011
  float beetleN12 = ((beetleN11) * (beetleN11)); // Math.012
  float beetleN13 = ((2.0) * (beetleN11)); // Math.013
  float beetleN14 = ((3.0) - (beetleN13)); // Math.014
  float beetleN15 = ((beetleN12) * (beetleN14)); // Math.015
  float beetleN16 = ((1.0) - (beetleN15)); // Math.016
  float beetleN17 = (((beetleRest).y) < (-0.44999998807907104) ? 1.0 : 0.0); // Math.017
  float beetleN18 = (((beetleRest).y) > (-0.8500000238418579) ? 1.0 : 0.0); // Math.018
  float beetleN19 = ((beetleN17) * (beetleN18)); // Math.019
  float beetleN20 = ((beetleN16) * (beetleN19)); // Math.020
  float beetleN21 = ((0.13312938809394836) * (beetleBlink)); // Math.025
  float beetleN22 = ((0.10812938213348389) - (beetleN21)); // Math.026
  float beetleN23 = ((beetleN1) * (beetleN1)); // Math.021
  float beetleN24 = ((1.0) - (beetleN23)); // Math.022
  float beetleN25 = max(beetleN24, 0.0); // Math.023
  float beetleN26 = sqrt(max(beetleN25, 0.0)); // Math.024
  float beetleN27 = ((beetleN22) * (beetleN26)); // Math.027
  float beetleN28 = ((-0.12113749235868454) + (beetleN27)); // Math.028
  float beetleN29 = (((beetleRest).z) - (beetleN28)); // Math.033
  float beetleN30 = ((beetleN29) - (-0.0007999999797903001)); // Math.034
  float beetleN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (beetleN30) / (0.0015999999595806003)); // Math.035
  float beetleN32 = max(beetleN31, 0.0); // Math.036
  float beetleN33 = min(beetleN32, 1.0); // Math.037
  float beetleN34 = ((beetleN33) * (beetleN33)); // Math.038
  float beetleN35 = ((2.0) * (beetleN33)); // Math.039
  float beetleN36 = ((3.0) - (beetleN35)); // Math.040
  float beetleN37 = ((beetleN34) * (beetleN36)); // Math.041
  float beetleN38 = ((0.0831293836236) * (beetleBlink)); // Math.029
  float beetleN39 = ((-0.10812938213348389) + (beetleN38)); // Math.030
  float beetleN40 = ((beetleN39) * (beetleN26)); // Math.031
  float beetleN41 = ((-0.12113749235868454) + (beetleN40)); // Math.032
  float beetleN42 = (((beetleRest).z) - (beetleN41)); // Math.042
  float beetleN43 = ((beetleN42) - (-0.0007999999797903001)); // Math.043
  float beetleN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (beetleN43) / (0.0015999999595806003)); // Math.044
  float beetleN45 = max(beetleN44, 0.0); // Math.045
  float beetleN46 = min(beetleN45, 1.0); // Math.046
  float beetleN47 = ((beetleN46) * (beetleN46)); // Math.047
  float beetleN48 = ((2.0) * (beetleN46)); // Math.048
  float beetleN49 = ((3.0) - (beetleN48)); // Math.049
  float beetleN50 = ((beetleN47) * (beetleN49)); // Math.050
  float beetleN51 = ((1.0) - (beetleN50)); // Math.051
  float beetleN52 = ((beetleN37) + (beetleN51)); // Math.052
  float beetleN53 = min(beetleN52, 1.0); // Math.053
  float beetleN54 = ((beetleBlink) * (20.0)); // Math.054
  float beetleN55 = min(beetleN54, 1.0); // Math.055
  float beetleN56 = ((beetleN53) * (beetleN55)); // Math.056
  float beetleN57 = ((beetleN20) * (beetleN56)); // Math.057
  float beetleN58 = ((0.0) + (beetleN57)); // Math.058
  float beetleN59 = (((beetleRest).x) - (0.18671254813671112)); // Math.084
  float beetleN60 = ((0.0786750316619873) == 0.0 ? 0.0 : (beetleN59) / (0.0786750316619873)); // Math.085
  float beetleN61 = ((beetleN60) * (beetleN60)); // Math.088
  float beetleN62 = (((beetleRest).z) - (-0.12113749235868454)); // Math.086
  float beetleN63 = ((0.10812938213348389) == 0.0 ? 0.0 : (beetleN62) / (0.10812938213348389)); // Math.087
  float beetleN64 = ((beetleN63) * (beetleN63)); // Math.089
  float beetleN65 = ((beetleN61) + (beetleN64)); // Math.090
  float beetleN66 = sqrt(max(beetleN65, 0.0)); // Math.091
  float beetleN67 = ((beetleN66) - (0.9599999785423279)); // Math.092
  float beetleN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (beetleN67) / (0.05999999865889549)); // Math.093
  float beetleN69 = max(beetleN68, 0.0); // Math.094
  float beetleN70 = min(beetleN69, 1.0); // Math.095
  float beetleN71 = ((beetleN70) * (beetleN70)); // Math.096
  float beetleN72 = ((2.0) * (beetleN70)); // Math.097
  float beetleN73 = ((3.0) - (beetleN72)); // Math.098
  float beetleN74 = ((beetleN71) * (beetleN73)); // Math.099
  float beetleN75 = ((1.0) - (beetleN74)); // Math.100
  float beetleN76 = (((beetleRest).y) < (-0.44999998807907104) ? 1.0 : 0.0); // Math.101
  float beetleN77 = (((beetleRest).y) > (-0.8500000238418579) ? 1.0 : 0.0); // Math.102
  float beetleN78 = ((beetleN76) * (beetleN77)); // Math.103
  float beetleN79 = ((beetleN75) * (beetleN78)); // Math.104
  float beetleN80 = ((0.13312938809394836) * (beetleBlink)); // Math.109
  float beetleN81 = ((0.10812938213348389) - (beetleN80)); // Math.110
  float beetleN82 = ((beetleN60) * (beetleN60)); // Math.105
  float beetleN83 = ((1.0) - (beetleN82)); // Math.106
  float beetleN84 = max(beetleN83, 0.0); // Math.107
  float beetleN85 = sqrt(max(beetleN84, 0.0)); // Math.108
  float beetleN86 = ((beetleN81) * (beetleN85)); // Math.111
  float beetleN87 = ((-0.12113749235868454) + (beetleN86)); // Math.112
  float beetleN88 = (((beetleRest).z) - (beetleN87)); // Math.117
  float beetleN89 = ((beetleN88) - (-0.0007999999797903001)); // Math.118
  float beetleN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (beetleN89) / (0.0015999999595806003)); // Math.119
  float beetleN91 = max(beetleN90, 0.0); // Math.120
  float beetleN92 = min(beetleN91, 1.0); // Math.121
  float beetleN93 = ((beetleN92) * (beetleN92)); // Math.122
  float beetleN94 = ((2.0) * (beetleN92)); // Math.123
  float beetleN95 = ((3.0) - (beetleN94)); // Math.124
  float beetleN96 = ((beetleN93) * (beetleN95)); // Math.125
  float beetleN97 = ((0.0831293836236) * (beetleBlink)); // Math.113
  float beetleN98 = ((-0.10812938213348389) + (beetleN97)); // Math.114
  float beetleN99 = ((beetleN98) * (beetleN85)); // Math.115
  float beetleN100 = ((-0.12113749235868454) + (beetleN99)); // Math.116
  float beetleN101 = (((beetleRest).z) - (beetleN100)); // Math.126
  float beetleN102 = ((beetleN101) - (-0.0007999999797903001)); // Math.127
  float beetleN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (beetleN102) / (0.0015999999595806003)); // Math.128
  float beetleN104 = max(beetleN103, 0.0); // Math.129
  float beetleN105 = min(beetleN104, 1.0); // Math.130
  float beetleN106 = ((beetleN105) * (beetleN105)); // Math.131
  float beetleN107 = ((2.0) * (beetleN105)); // Math.132
  float beetleN108 = ((3.0) - (beetleN107)); // Math.133
  float beetleN109 = ((beetleN106) * (beetleN108)); // Math.134
  float beetleN110 = ((1.0) - (beetleN109)); // Math.135
  float beetleN111 = ((beetleN96) + (beetleN110)); // Math.136
  float beetleN112 = min(beetleN111, 1.0); // Math.137
  float beetleN113 = ((beetleBlink) * (20.0)); // Math.138
  float beetleN114 = min(beetleN113, 1.0); // Math.139
  float beetleN115 = ((beetleN112) * (beetleN114)); // Math.140
  float beetleN116 = ((beetleN79) * (beetleN115)); // Math.141
  float beetleN117 = ((beetleN58) + (beetleN116)); // Math.142
  float beetleN118 = (((beetleRest).z) - (beetleN28)); // Math.059
  float beetleN119 = abs(beetleN118); // Math.060
  float beetleN120 = ((beetleN119) - (0.0044999998062849045)); // Math.061
  float beetleN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (beetleN120) / (0.0044999998062849045)); // Math.062
  float beetleN122 = max(beetleN121, 0.0); // Math.063
  float beetleN123 = min(beetleN122, 1.0); // Math.064
  float beetleN124 = ((beetleN123) * (beetleN123)); // Math.065
  float beetleN125 = ((2.0) * (beetleN123)); // Math.066
  float beetleN126 = ((3.0) - (beetleN125)); // Math.067
  float beetleN127 = ((beetleN124) * (beetleN126)); // Math.068
  float beetleN128 = ((1.0) - (beetleN127)); // Math.069
  float beetleN129 = abs(beetleN1); // Math.070
  float beetleN130 = ((beetleN129) - (0.8999999761581421)); // Math.071
  float beetleN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (beetleN130) / (0.10000000149011612)); // Math.072
  float beetleN132 = max(beetleN131, 0.0); // Math.073
  float beetleN133 = min(beetleN132, 1.0); // Math.074
  float beetleN134 = ((beetleN133) * (beetleN133)); // Math.075
  float beetleN135 = ((2.0) * (beetleN133)); // Math.076
  float beetleN136 = ((3.0) - (beetleN135)); // Math.077
  float beetleN137 = ((beetleN134) * (beetleN136)); // Math.078
  float beetleN138 = ((1.0) - (beetleN137)); // Math.079
  float beetleN139 = ((beetleN128) * (beetleN138)); // Math.080
  float beetleN140 = ((beetleN139) * (beetleN55)); // Math.081
  float beetleN141 = ((beetleN20) * (beetleN140)); // Math.082
  float beetleN142 = ((0.0) + (beetleN141)); // Math.083
  float beetleN143 = (((beetleRest).z) - (beetleN87)); // Math.143
  float beetleN144 = abs(beetleN143); // Math.144
  float beetleN145 = ((beetleN144) - (0.0044999998062849045)); // Math.145
  float beetleN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (beetleN145) / (0.0044999998062849045)); // Math.146
  float beetleN147 = max(beetleN146, 0.0); // Math.147
  float beetleN148 = min(beetleN147, 1.0); // Math.148
  float beetleN149 = ((beetleN148) * (beetleN148)); // Math.149
  float beetleN150 = ((2.0) * (beetleN148)); // Math.150
  float beetleN151 = ((3.0) - (beetleN150)); // Math.151
  float beetleN152 = ((beetleN149) * (beetleN151)); // Math.152
  float beetleN153 = ((1.0) - (beetleN152)); // Math.153
  float beetleN154 = abs(beetleN60); // Math.154
  float beetleN155 = ((beetleN154) - (0.8999999761581421)); // Math.155
  float beetleN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (beetleN155) / (0.10000000149011612)); // Math.156
  float beetleN157 = max(beetleN156, 0.0); // Math.157
  float beetleN158 = min(beetleN157, 1.0); // Math.158
  float beetleN159 = ((beetleN158) * (beetleN158)); // Math.159
  float beetleN160 = ((2.0) * (beetleN158)); // Math.160
  float beetleN161 = ((3.0) - (beetleN160)); // Math.161
  float beetleN162 = ((beetleN159) * (beetleN161)); // Math.162
  float beetleN163 = ((1.0) - (beetleN162)); // Math.163
  float beetleN164 = ((beetleN153) * (beetleN163)); // Math.164
  float beetleN165 = ((beetleN164) * (beetleN114)); // Math.165
  float beetleN166 = ((beetleN79) * (beetleN165)); // Math.166
  float beetleN167 = ((beetleN142) + (beetleN166)); // Math.167
  float beetleN168 = ((0.11886262148618698) * (1.0)); // Math.175
  float beetleN169 = ((0.0) + (beetleN168)); // Math.176
  float beetleN170 = (((beetleRest).x) - (-0.18770067393779755)); // Math.168
  float beetleN171 = ((0.07939400523900986) == 0.0 ? 0.0 : (beetleN170) / (0.07939400523900986)); // Math.169
  float beetleN172 = ((0.008458700962364674) * (beetleN171)); // Math.177
  float beetleN173 = ((beetleN169) + (beetleN172)); // Math.178
  float beetleN174 = (((beetleRest).z) - (-0.12113749235868454)); // Math.170
  float beetleN175 = ((0.10812938213348389) == 0.0 ? 0.0 : (beetleN174) / (0.10812938213348389)); // Math.171
  float beetleN176 = ((0.0014323432696983218) * (beetleN175)); // Math.179
  float beetleN177 = ((beetleN173) + (beetleN176)); // Math.180
  float beetleN178 = ((beetleN171) * (beetleN171)); // Math.172
  float beetleN179 = ((-0.021771229803562164) * (beetleN178)); // Math.181
  float beetleN180 = ((beetleN177) + (beetleN179)); // Math.182
  float beetleN181 = ((beetleN171) * (beetleN175)); // Math.173
  float beetleN182 = ((0.004064921755343676) * (beetleN181)); // Math.183
  float beetleN183 = ((beetleN180) + (beetleN182)); // Math.184
  float beetleN184 = ((beetleN175) * (beetleN175)); // Math.174
  float beetleN185 = ((-0.03359358385205269) * (beetleN184)); // Math.185
  float beetleN186 = ((beetleN183) + (beetleN185)); // Math.186
  float beetleN187 = max(beetleN186, 0.0); // Math.187
  float beetleN188 = min(beetleN187, 1.0); // Math.188
  float beetleN189 = ((0.19678403437137604) * (1.0)); // Math.189
  float beetleN190 = ((0.0) + (beetleN189)); // Math.190
  float beetleN191 = ((0.013726421631872654) * (beetleN171)); // Math.191
  float beetleN192 = ((beetleN190) + (beetleN191)); // Math.192
  float beetleN193 = ((0.0017923170235008001) * (beetleN175)); // Math.193
  float beetleN194 = ((beetleN192) + (beetleN193)); // Math.194
  float beetleN195 = ((-0.03755107522010803) * (beetleN178)); // Math.195
  float beetleN196 = ((beetleN194) + (beetleN195)); // Math.196
  float beetleN197 = ((0.007239447440952063) * (beetleN181)); // Math.197
  float beetleN198 = ((beetleN196) + (beetleN197)); // Math.198
  float beetleN199 = ((-0.057972487062215805) * (beetleN184)); // Math.199
  float beetleN200 = ((beetleN198) + (beetleN199)); // Math.200
  float beetleN201 = max(beetleN200, 0.0); // Math.201
  float beetleN202 = min(beetleN201, 1.0); // Math.202
  float beetleN203 = ((0.4606362283229828) * (1.0)); // Math.203
  float beetleN204 = ((0.0) + (beetleN203)); // Math.204
  float beetleN205 = ((0.028834223747253418) * (beetleN171)); // Math.205
  float beetleN206 = ((beetleN204) + (beetleN205)); // Math.206
  float beetleN207 = ((0.0049341111443936825) * (beetleN175)); // Math.207
  float beetleN208 = ((beetleN206) + (beetleN207)); // Math.208
  float beetleN209 = ((-0.05844244733452797) * (beetleN178)); // Math.209
  float beetleN210 = ((beetleN208) + (beetleN209)); // Math.210
  float beetleN211 = ((0.011773486621677876) * (beetleN181)); // Math.211
  float beetleN212 = ((beetleN210) + (beetleN211)); // Math.212
  float beetleN213 = ((-0.09678027778863907) * (beetleN184)); // Math.213
  float beetleN214 = ((beetleN212) + (beetleN213)); // Math.214
  float beetleN215 = max(beetleN214, 0.0); // Math.215
  float beetleN216 = min(beetleN215, 1.0); // Math.216
  vec3 beetleN217 = vec3(beetleN188, beetleN202, beetleN216); // Combine XYZ
  float beetleN218 = ((0.11745895445346832) * (1.0)); // Math.224
  float beetleN219 = ((0.0) + (beetleN218)); // Math.225
  float beetleN220 = (((beetleRest).x) - (0.18671254813671112)); // Math.217
  float beetleN221 = ((0.0786750316619873) == 0.0 ? 0.0 : (beetleN220) / (0.0786750316619873)); // Math.218
  float beetleN222 = ((-0.008655227720737457) * (beetleN221)); // Math.226
  float beetleN223 = ((beetleN219) + (beetleN222)); // Math.227
  float beetleN224 = (((beetleRest).z) - (-0.12113749235868454)); // Math.219
  float beetleN225 = ((0.10812938213348389) == 0.0 ? 0.0 : (beetleN224) / (0.10812938213348389)); // Math.220
  float beetleN226 = ((0.0016856419388204813) * (beetleN225)); // Math.228
  float beetleN227 = ((beetleN223) + (beetleN226)); // Math.229
  float beetleN228 = ((beetleN221) * (beetleN221)); // Math.221
  float beetleN229 = ((-0.020993849262595177) * (beetleN228)); // Math.230
  float beetleN230 = ((beetleN227) + (beetleN229)); // Math.231
  float beetleN231 = ((beetleN221) * (beetleN225)); // Math.222
  float beetleN232 = ((-0.0032178086694329977) * (beetleN231)); // Math.232
  float beetleN233 = ((beetleN230) + (beetleN232)); // Math.233
  float beetleN234 = ((beetleN225) * (beetleN225)); // Math.223
  float beetleN235 = ((-0.0334484800696373) * (beetleN234)); // Math.234
  float beetleN236 = ((beetleN233) + (beetleN235)); // Math.235
  float beetleN237 = max(beetleN236, 0.0); // Math.236
  float beetleN238 = min(beetleN237, 1.0); // Math.237
  float beetleN239 = ((0.19533436000347137) * (1.0)); // Math.238
  float beetleN240 = ((0.0) + (beetleN239)); // Math.239
  float beetleN241 = ((-0.014065997675061226) * (beetleN221)); // Math.240
  float beetleN242 = ((beetleN240) + (beetleN241)); // Math.241
  float beetleN243 = ((0.0020001267548650503) * (beetleN225)); // Math.242
  float beetleN244 = ((beetleN242) + (beetleN243)); // Math.243
  float beetleN245 = ((-0.036580897867679596) * (beetleN228)); // Math.244
  float beetleN246 = ((beetleN244) + (beetleN245)); // Math.245
  float beetleN247 = ((-0.006152458488941193) * (beetleN231)); // Math.246
  float beetleN248 = ((beetleN246) + (beetleN247)); // Math.247
  float beetleN249 = ((-0.05802434682846069) * (beetleN234)); // Math.248
  float beetleN250 = ((beetleN248) + (beetleN249)); // Math.249
  float beetleN251 = max(beetleN250, 0.0); // Math.250
  float beetleN252 = min(beetleN251, 1.0); // Math.251
  float beetleN253 = ((0.46182069182395935) * (1.0)); // Math.252
  float beetleN254 = ((0.0) + (beetleN253)); // Math.253
  float beetleN255 = ((-0.030439041554927826) * (beetleN221)); // Math.254
  float beetleN256 = ((beetleN254) + (beetleN255)); // Math.255
  float beetleN257 = ((0.004770028870552778) * (beetleN225)); // Math.256
  float beetleN258 = ((beetleN256) + (beetleN257)); // Math.257
  float beetleN259 = ((-0.059143971651792526) * (beetleN228)); // Math.258
  float beetleN260 = ((beetleN258) + (beetleN259)); // Math.259
  float beetleN261 = ((-0.011008447967469692) * (beetleN231)); // Math.260
  float beetleN262 = ((beetleN260) + (beetleN261)); // Math.261
  float beetleN263 = ((-0.0983462706208229) * (beetleN234)); // Math.262
  float beetleN264 = ((beetleN262) + (beetleN263)); // Math.263
  float beetleN265 = max(beetleN264, 0.0); // Math.264
  float beetleN266 = min(beetleN265, 1.0); // Math.265
  vec3 beetleN267 = vec3(beetleN238, beetleN252, beetleN266); // Combine XYZ.001
  float beetleN268 = (((beetleRest).x) > (0.0) ? 1.0 : 0.0); // Math.266
  vec3 beetleN269 = mix(beetleN217, beetleN267, clamp(beetleN268, 0.0, 1.0)); // Mix (Legacy).001
  return BeetleBlinkData(vec2(beetleN117, beetleN167), beetleN269);
}

vec3 beetleApplyBaseColor(vec3 textureBaseColor, BeetleBlinkData blinkData) {
  vec3 beetleN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 beetleN1 = mix(beetleN0, vec3(0.00800000037997961, 0.013000000268220901, 0.03500000014901161), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return beetleN1;
}

float beetleApplyRoughness(float textureRoughness, BeetleBlinkData blinkData) {
  float beetleN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float beetleN1 = ((textureRoughness) * (beetleN0)); // Math.268
  float beetleN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float beetleN3 = ((beetleN1) + (beetleN2)); // Math.270
  return beetleN3;
}

float beetleNormalStrength(BeetleBlinkData blinkData) {
  float beetleN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return beetleN0;
}
`;

export function sampleBeetleBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Beetle blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Beetle clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installBeetleMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Beetle instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Beetle_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Beetle rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Beetle requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Beetle requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Beetle_Blink_Surface material missing');
  for (const [, original] of targets) {
    if (clones.has(original)) continue;
    const material = original.clone();
    material.onBeforeCompile = shader => {
      for (const marker of ['#include <begin_vertex>']) {
        if (!shader.vertexShader.includes(marker)) throw new Error('Unsupported Three vertex shader: ' + marker);
      }
      for (const marker of ['#include <map_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>']) {
        if (!shader.fragmentShader.includes(marker)) throw new Error('Unsupported Three fragment shader: ' + marker);
      }
      shader.uniforms.beetleBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 beetleRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbeetleRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 beetleRestPosition; uniform float beetleBlink;\n' + beetleBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        BeetleBlinkData beetleBlinkData = beetleEvaluateBlink(beetleRestPosition, beetleBlink);
        diffuseColor.rgb = beetleApplyBaseColor(diffuseColor.rgb, beetleBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = beetleApplyRoughness(roughnessFactor, beetleBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float beetleStrength = beetleNormalStrength(beetleBlinkData);
          vec3 beetleMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          beetleMapN.xy *= normalScale * beetleStrength;
          beetleMapN.z = mix(1.0, beetleMapN.z, clamp(beetleStrength, 0.0, 1.0));
          normal = normalize(tbn * beetleMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'beetle-source-blink-gradient-v1';
    material.needsUpdate = true;
    clones.set(original, material);
  }
  const meshes = new Set(targets.map(([mesh]) => mesh));
  for (const mesh of meshes) {
    const original = mesh.material;
    const adapted = Array.isArray(original) ? original.map(m => clones.get(m) || m) : clones.get(original);
    mesh.material = adapted;
    bindings.push({ mesh, original, adapted });
  }
  let disposed = false;
  return {
    update(clip, clipLocalSeconds) {
      if (disposed) throw new Error('Beetle material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleBeetleBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Beetle blink update');
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
