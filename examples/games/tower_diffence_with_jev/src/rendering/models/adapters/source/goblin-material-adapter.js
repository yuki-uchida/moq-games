// Goblin_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const goblinBlinkGLSL = `// Generated only from Goblin_Blink_Surface. Input coordinates stay in Blender rest space.
struct GoblinBlinkData { vec2 masks; vec3 lidColor; };

GoblinBlinkData goblinEvaluateBlink(vec3 goblinRest, float goblinBlink) {
  float goblinN0 = (((goblinRest).x) - (-0.2454516738653183)); // Math
  float goblinN1 = ((0.12662376463413239) == 0.0 ? 0.0 : (goblinN0) / (0.12662376463413239)); // Math.001
  float goblinN2 = ((goblinN1) * (goblinN1)); // Math.004
  float goblinN3 = (((goblinRest).z) - (0.3683722913265228)); // Math.002
  float goblinN4 = ((0.10507579147815704) == 0.0 ? 0.0 : (goblinN3) / (0.10507579147815704)); // Math.003
  float goblinN5 = ((goblinN4) * (goblinN4)); // Math.005
  float goblinN6 = ((goblinN2) + (goblinN5)); // Math.006
  float goblinN7 = sqrt(max(goblinN6, 0.0)); // Math.007
  float goblinN8 = ((goblinN7) - (0.9599999785423279)); // Math.008
  float goblinN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (goblinN8) / (0.05999999865889549)); // Math.009
  float goblinN10 = max(goblinN9, 0.0); // Math.010
  float goblinN11 = min(goblinN10, 1.0); // Math.011
  float goblinN12 = ((goblinN11) * (goblinN11)); // Math.012
  float goblinN13 = ((2.0) * (goblinN11)); // Math.013
  float goblinN14 = ((3.0) - (goblinN13)); // Math.014
  float goblinN15 = ((goblinN12) * (goblinN14)); // Math.015
  float goblinN16 = ((1.0) - (goblinN15)); // Math.016
  float goblinN17 = (((goblinRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.017
  float goblinN18 = (((goblinRest).y) > (-0.46000000834465027) ? 1.0 : 0.0); // Math.018
  float goblinN19 = ((goblinN17) * (goblinN18)); // Math.019
  float goblinN20 = ((goblinN16) * (goblinN19)); // Math.020
  float goblinN21 = ((0.13007579743862152) * (goblinBlink)); // Math.025
  float goblinN22 = ((0.10507579147815704) - (goblinN21)); // Math.026
  float goblinN23 = ((goblinN1) * (goblinN1)); // Math.021
  float goblinN24 = ((1.0) - (goblinN23)); // Math.022
  float goblinN25 = max(goblinN24, 0.0); // Math.023
  float goblinN26 = sqrt(max(goblinN25, 0.0)); // Math.024
  float goblinN27 = ((goblinN22) * (goblinN26)); // Math.027
  float goblinN28 = ((0.3683722913265228) + (goblinN27)); // Math.028
  float goblinN29 = (((goblinRest).z) - (goblinN28)); // Math.033
  float goblinN30 = ((goblinN29) - (-0.0007999999797903001)); // Math.034
  float goblinN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (goblinN30) / (0.0015999999595806003)); // Math.035
  float goblinN32 = max(goblinN31, 0.0); // Math.036
  float goblinN33 = min(goblinN32, 1.0); // Math.037
  float goblinN34 = ((goblinN33) * (goblinN33)); // Math.038
  float goblinN35 = ((2.0) * (goblinN33)); // Math.039
  float goblinN36 = ((3.0) - (goblinN35)); // Math.040
  float goblinN37 = ((goblinN34) * (goblinN36)); // Math.041
  float goblinN38 = ((0.08007579296827316) * (goblinBlink)); // Math.029
  float goblinN39 = ((-0.10507579147815704) + (goblinN38)); // Math.030
  float goblinN40 = ((goblinN39) * (goblinN26)); // Math.031
  float goblinN41 = ((0.3683722913265228) + (goblinN40)); // Math.032
  float goblinN42 = (((goblinRest).z) - (goblinN41)); // Math.042
  float goblinN43 = ((goblinN42) - (-0.0007999999797903001)); // Math.043
  float goblinN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (goblinN43) / (0.0015999999595806003)); // Math.044
  float goblinN45 = max(goblinN44, 0.0); // Math.045
  float goblinN46 = min(goblinN45, 1.0); // Math.046
  float goblinN47 = ((goblinN46) * (goblinN46)); // Math.047
  float goblinN48 = ((2.0) * (goblinN46)); // Math.048
  float goblinN49 = ((3.0) - (goblinN48)); // Math.049
  float goblinN50 = ((goblinN47) * (goblinN49)); // Math.050
  float goblinN51 = ((1.0) - (goblinN50)); // Math.051
  float goblinN52 = ((goblinN37) + (goblinN51)); // Math.052
  float goblinN53 = min(goblinN52, 1.0); // Math.053
  float goblinN54 = ((goblinBlink) * (20.0)); // Math.054
  float goblinN55 = min(goblinN54, 1.0); // Math.055
  float goblinN56 = ((goblinN53) * (goblinN55)); // Math.056
  float goblinN57 = ((goblinN20) * (goblinN56)); // Math.057
  float goblinN58 = ((0.0) + (goblinN57)); // Math.058
  float goblinN59 = (((goblinRest).x) - (0.21223819255828857)); // Math.084
  float goblinN60 = ((0.12398239970207214) == 0.0 ? 0.0 : (goblinN59) / (0.12398239970207214)); // Math.085
  float goblinN61 = ((goblinN60) * (goblinN60)); // Math.088
  float goblinN62 = (((goblinRest).z) - (0.3683722913265228)); // Math.086
  float goblinN63 = ((0.10507579147815704) == 0.0 ? 0.0 : (goblinN62) / (0.10507579147815704)); // Math.087
  float goblinN64 = ((goblinN63) * (goblinN63)); // Math.089
  float goblinN65 = ((goblinN61) + (goblinN64)); // Math.090
  float goblinN66 = sqrt(max(goblinN65, 0.0)); // Math.091
  float goblinN67 = ((goblinN66) - (0.9599999785423279)); // Math.092
  float goblinN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (goblinN67) / (0.05999999865889549)); // Math.093
  float goblinN69 = max(goblinN68, 0.0); // Math.094
  float goblinN70 = min(goblinN69, 1.0); // Math.095
  float goblinN71 = ((goblinN70) * (goblinN70)); // Math.096
  float goblinN72 = ((2.0) * (goblinN70)); // Math.097
  float goblinN73 = ((3.0) - (goblinN72)); // Math.098
  float goblinN74 = ((goblinN71) * (goblinN73)); // Math.099
  float goblinN75 = ((1.0) - (goblinN74)); // Math.100
  float goblinN76 = (((goblinRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.101
  float goblinN77 = (((goblinRest).y) > (-0.46000000834465027) ? 1.0 : 0.0); // Math.102
  float goblinN78 = ((goblinN76) * (goblinN77)); // Math.103
  float goblinN79 = ((goblinN75) * (goblinN78)); // Math.104
  float goblinN80 = ((0.13007579743862152) * (goblinBlink)); // Math.109
  float goblinN81 = ((0.10507579147815704) - (goblinN80)); // Math.110
  float goblinN82 = ((goblinN60) * (goblinN60)); // Math.105
  float goblinN83 = ((1.0) - (goblinN82)); // Math.106
  float goblinN84 = max(goblinN83, 0.0); // Math.107
  float goblinN85 = sqrt(max(goblinN84, 0.0)); // Math.108
  float goblinN86 = ((goblinN81) * (goblinN85)); // Math.111
  float goblinN87 = ((0.3683722913265228) + (goblinN86)); // Math.112
  float goblinN88 = (((goblinRest).z) - (goblinN87)); // Math.117
  float goblinN89 = ((goblinN88) - (-0.0007999999797903001)); // Math.118
  float goblinN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (goblinN89) / (0.0015999999595806003)); // Math.119
  float goblinN91 = max(goblinN90, 0.0); // Math.120
  float goblinN92 = min(goblinN91, 1.0); // Math.121
  float goblinN93 = ((goblinN92) * (goblinN92)); // Math.122
  float goblinN94 = ((2.0) * (goblinN92)); // Math.123
  float goblinN95 = ((3.0) - (goblinN94)); // Math.124
  float goblinN96 = ((goblinN93) * (goblinN95)); // Math.125
  float goblinN97 = ((0.08007579296827316) * (goblinBlink)); // Math.113
  float goblinN98 = ((-0.10507579147815704) + (goblinN97)); // Math.114
  float goblinN99 = ((goblinN98) * (goblinN85)); // Math.115
  float goblinN100 = ((0.3683722913265228) + (goblinN99)); // Math.116
  float goblinN101 = (((goblinRest).z) - (goblinN100)); // Math.126
  float goblinN102 = ((goblinN101) - (-0.0007999999797903001)); // Math.127
  float goblinN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (goblinN102) / (0.0015999999595806003)); // Math.128
  float goblinN104 = max(goblinN103, 0.0); // Math.129
  float goblinN105 = min(goblinN104, 1.0); // Math.130
  float goblinN106 = ((goblinN105) * (goblinN105)); // Math.131
  float goblinN107 = ((2.0) * (goblinN105)); // Math.132
  float goblinN108 = ((3.0) - (goblinN107)); // Math.133
  float goblinN109 = ((goblinN106) * (goblinN108)); // Math.134
  float goblinN110 = ((1.0) - (goblinN109)); // Math.135
  float goblinN111 = ((goblinN96) + (goblinN110)); // Math.136
  float goblinN112 = min(goblinN111, 1.0); // Math.137
  float goblinN113 = ((goblinBlink) * (20.0)); // Math.138
  float goblinN114 = min(goblinN113, 1.0); // Math.139
  float goblinN115 = ((goblinN112) * (goblinN114)); // Math.140
  float goblinN116 = ((goblinN79) * (goblinN115)); // Math.141
  float goblinN117 = ((goblinN58) + (goblinN116)); // Math.142
  float goblinN118 = (((goblinRest).z) - (goblinN28)); // Math.059
  float goblinN119 = abs(goblinN118); // Math.060
  float goblinN120 = ((goblinN119) - (0.0044999998062849045)); // Math.061
  float goblinN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (goblinN120) / (0.0044999998062849045)); // Math.062
  float goblinN122 = max(goblinN121, 0.0); // Math.063
  float goblinN123 = min(goblinN122, 1.0); // Math.064
  float goblinN124 = ((goblinN123) * (goblinN123)); // Math.065
  float goblinN125 = ((2.0) * (goblinN123)); // Math.066
  float goblinN126 = ((3.0) - (goblinN125)); // Math.067
  float goblinN127 = ((goblinN124) * (goblinN126)); // Math.068
  float goblinN128 = ((1.0) - (goblinN127)); // Math.069
  float goblinN129 = abs(goblinN1); // Math.070
  float goblinN130 = ((goblinN129) - (0.8999999761581421)); // Math.071
  float goblinN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (goblinN130) / (0.10000000149011612)); // Math.072
  float goblinN132 = max(goblinN131, 0.0); // Math.073
  float goblinN133 = min(goblinN132, 1.0); // Math.074
  float goblinN134 = ((goblinN133) * (goblinN133)); // Math.075
  float goblinN135 = ((2.0) * (goblinN133)); // Math.076
  float goblinN136 = ((3.0) - (goblinN135)); // Math.077
  float goblinN137 = ((goblinN134) * (goblinN136)); // Math.078
  float goblinN138 = ((1.0) - (goblinN137)); // Math.079
  float goblinN139 = ((goblinN128) * (goblinN138)); // Math.080
  float goblinN140 = ((goblinN139) * (goblinN55)); // Math.081
  float goblinN141 = ((goblinN20) * (goblinN140)); // Math.082
  float goblinN142 = ((0.0) + (goblinN141)); // Math.083
  float goblinN143 = (((goblinRest).z) - (goblinN87)); // Math.143
  float goblinN144 = abs(goblinN143); // Math.144
  float goblinN145 = ((goblinN144) - (0.0044999998062849045)); // Math.145
  float goblinN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (goblinN145) / (0.0044999998062849045)); // Math.146
  float goblinN147 = max(goblinN146, 0.0); // Math.147
  float goblinN148 = min(goblinN147, 1.0); // Math.148
  float goblinN149 = ((goblinN148) * (goblinN148)); // Math.149
  float goblinN150 = ((2.0) * (goblinN148)); // Math.150
  float goblinN151 = ((3.0) - (goblinN150)); // Math.151
  float goblinN152 = ((goblinN149) * (goblinN151)); // Math.152
  float goblinN153 = ((1.0) - (goblinN152)); // Math.153
  float goblinN154 = abs(goblinN60); // Math.154
  float goblinN155 = ((goblinN154) - (0.8999999761581421)); // Math.155
  float goblinN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (goblinN155) / (0.10000000149011612)); // Math.156
  float goblinN157 = max(goblinN156, 0.0); // Math.157
  float goblinN158 = min(goblinN157, 1.0); // Math.158
  float goblinN159 = ((goblinN158) * (goblinN158)); // Math.159
  float goblinN160 = ((2.0) * (goblinN158)); // Math.160
  float goblinN161 = ((3.0) - (goblinN160)); // Math.161
  float goblinN162 = ((goblinN159) * (goblinN161)); // Math.162
  float goblinN163 = ((1.0) - (goblinN162)); // Math.163
  float goblinN164 = ((goblinN153) * (goblinN163)); // Math.164
  float goblinN165 = ((goblinN164) * (goblinN114)); // Math.165
  float goblinN166 = ((goblinN79) * (goblinN165)); // Math.166
  float goblinN167 = ((goblinN142) + (goblinN166)); // Math.167
  float goblinN168 = ((0.2522537410259247) * (1.0)); // Math.175
  float goblinN169 = ((0.0) + (goblinN168)); // Math.176
  float goblinN170 = (((goblinRest).x) - (-0.2454516738653183)); // Math.168
  float goblinN171 = ((0.12662376463413239) == 0.0 ? 0.0 : (goblinN170) / (0.12662376463413239)); // Math.169
  float goblinN172 = ((0.006743238307535648) * (goblinN171)); // Math.177
  float goblinN173 = ((goblinN169) + (goblinN172)); // Math.178
  float goblinN174 = (((goblinRest).z) - (0.3683722913265228)); // Math.170
  float goblinN175 = ((0.10507579147815704) == 0.0 ? 0.0 : (goblinN174) / (0.10507579147815704)); // Math.171
  float goblinN176 = ((-0.027810271829366684) * (goblinN175)); // Math.179
  float goblinN177 = ((goblinN173) + (goblinN176)); // Math.180
  float goblinN178 = ((goblinN171) * (goblinN171)); // Math.172
  float goblinN179 = ((0.017636943608522415) * (goblinN178)); // Math.181
  float goblinN180 = ((goblinN177) + (goblinN179)); // Math.182
  float goblinN181 = ((goblinN171) * (goblinN175)); // Math.173
  float goblinN182 = ((-0.007951002568006516) * (goblinN181)); // Math.183
  float goblinN183 = ((goblinN180) + (goblinN182)); // Math.184
  float goblinN184 = ((goblinN175) * (goblinN175)); // Math.174
  float goblinN185 = ((0.019429191946983337) * (goblinN184)); // Math.185
  float goblinN186 = ((goblinN183) + (goblinN185)); // Math.186
  float goblinN187 = max(goblinN186, 0.0); // Math.187
  float goblinN188 = min(goblinN187, 1.0); // Math.188
  float goblinN189 = ((0.367249995470047) * (1.0)); // Math.189
  float goblinN190 = ((0.0) + (goblinN189)); // Math.190
  float goblinN191 = ((0.013704302720725536) * (goblinN171)); // Math.191
  float goblinN192 = ((goblinN190) + (goblinN191)); // Math.192
  float goblinN193 = ((-0.02178855612874031) * (goblinN175)); // Math.193
  float goblinN194 = ((goblinN192) + (goblinN193)); // Math.194
  float goblinN195 = ((0.028478462249040604) * (goblinN178)); // Math.195
  float goblinN196 = ((goblinN194) + (goblinN195)); // Math.196
  float goblinN197 = ((-0.025141848251223564) * (goblinN181)); // Math.197
  float goblinN198 = ((goblinN196) + (goblinN197)); // Math.198
  float goblinN199 = ((0.021982261911034584) * (goblinN184)); // Math.199
  float goblinN200 = ((goblinN198) + (goblinN199)); // Math.200
  float goblinN201 = max(goblinN200, 0.0); // Math.201
  float goblinN202 = min(goblinN201, 1.0); // Math.202
  float goblinN203 = ((0.03764423355460167) * (1.0)); // Math.203
  float goblinN204 = ((0.0) + (goblinN203)); // Math.204
  float goblinN205 = ((0.000413221976486966) * (goblinN171)); // Math.205
  float goblinN206 = ((goblinN204) + (goblinN205)); // Math.206
  float goblinN207 = ((-0.0037696962244808674) * (goblinN175)); // Math.207
  float goblinN208 = ((goblinN206) + (goblinN207)); // Math.208
  float goblinN209 = ((0.0014238508883863688) * (goblinN178)); // Math.209
  float goblinN210 = ((goblinN208) + (goblinN209)); // Math.210
  float goblinN211 = ((-0.0017037703655660152) * (goblinN181)); // Math.211
  float goblinN212 = ((goblinN210) + (goblinN211)); // Math.212
  float goblinN213 = ((0.001879868796095252) * (goblinN184)); // Math.213
  float goblinN214 = ((goblinN212) + (goblinN213)); // Math.214
  float goblinN215 = max(goblinN214, 0.0); // Math.215
  float goblinN216 = min(goblinN215, 1.0); // Math.216
  vec3 goblinN217 = vec3(goblinN188, goblinN202, goblinN216); // Combine XYZ
  float goblinN218 = ((0.2607017457485199) * (1.0)); // Math.224
  float goblinN219 = ((0.0) + (goblinN218)); // Math.225
  float goblinN220 = (((goblinRest).x) - (0.21223819255828857)); // Math.217
  float goblinN221 = ((0.12398239970207214) == 0.0 ? 0.0 : (goblinN220) / (0.12398239970207214)); // Math.218
  float goblinN222 = ((-0.0014259855961427093) * (goblinN221)); // Math.226
  float goblinN223 = ((goblinN219) + (goblinN222)); // Math.227
  float goblinN224 = (((goblinRest).z) - (0.3683722913265228)); // Math.219
  float goblinN225 = ((0.10507579147815704) == 0.0 ? 0.0 : (goblinN224) / (0.10507579147815704)); // Math.220
  float goblinN226 = ((-0.028521889820694923) * (goblinN225)); // Math.228
  float goblinN227 = ((goblinN223) + (goblinN226)); // Math.229
  float goblinN228 = ((goblinN221) * (goblinN221)); // Math.221
  float goblinN229 = ((0.012223893776535988) * (goblinN228)); // Math.230
  float goblinN230 = ((goblinN227) + (goblinN229)); // Math.231
  float goblinN231 = ((goblinN221) * (goblinN225)); // Math.222
  float goblinN232 = ((0.008092375472187996) * (goblinN231)); // Math.232
  float goblinN233 = ((goblinN230) + (goblinN232)); // Math.233
  float goblinN234 = ((goblinN225) * (goblinN225)); // Math.223
  float goblinN235 = ((0.013304331339895725) * (goblinN234)); // Math.234
  float goblinN236 = ((goblinN233) + (goblinN235)); // Math.235
  float goblinN237 = max(goblinN236, 0.0); // Math.236
  float goblinN238 = min(goblinN237, 1.0); // Math.237
  float goblinN239 = ((0.37720271944999695) * (1.0)); // Math.238
  float goblinN240 = ((0.0) + (goblinN239)); // Math.239
  float goblinN241 = ((-0.009950450621545315) * (goblinN221)); // Math.240
  float goblinN242 = ((goblinN240) + (goblinN241)); // Math.241
  float goblinN243 = ((-0.021150564774870872) * (goblinN225)); // Math.242
  float goblinN244 = ((goblinN242) + (goblinN243)); // Math.243
  float goblinN245 = ((0.02158465050160885) * (goblinN228)); // Math.244
  float goblinN246 = ((goblinN244) + (goblinN245)); // Math.245
  float goblinN247 = ((0.02972228266298771) * (goblinN231)); // Math.246
  float goblinN248 = ((goblinN246) + (goblinN247)); // Math.247
  float goblinN249 = ((0.014210112392902374) * (goblinN234)); // Math.248
  float goblinN250 = ((goblinN248) + (goblinN249)); // Math.249
  float goblinN251 = max(goblinN250, 0.0); // Math.250
  float goblinN252 = min(goblinN251, 1.0); // Math.251
  float goblinN253 = ((0.03991158679127693) * (1.0)); // Math.252
  float goblinN254 = ((0.0) + (goblinN253)); // Math.253
  float goblinN255 = ((-7.910149724921212e-05) * (goblinN221)); // Math.254
  float goblinN256 = ((goblinN254) + (goblinN255)); // Math.255
  float goblinN257 = ((-0.004024360794574022) * (goblinN225)); // Math.256
  float goblinN258 = ((goblinN256) + (goblinN257)); // Math.257
  float goblinN259 = ((0.00013566519191954285) * (goblinN228)); // Math.258
  float goblinN260 = ((goblinN258) + (goblinN259)); // Math.259
  float goblinN261 = ((0.0018393081845715642) * (goblinN231)); // Math.260
  float goblinN262 = ((goblinN260) + (goblinN261)); // Math.261
  float goblinN263 = ((0.0007320737931877375) * (goblinN234)); // Math.262
  float goblinN264 = ((goblinN262) + (goblinN263)); // Math.263
  float goblinN265 = max(goblinN264, 0.0); // Math.264
  float goblinN266 = min(goblinN265, 1.0); // Math.265
  vec3 goblinN267 = vec3(goblinN238, goblinN252, goblinN266); // Combine XYZ.001
  float goblinN268 = (((goblinRest).x) > (-0.019999999552965164) ? 1.0 : 0.0); // Math.266
  vec3 goblinN269 = mix(goblinN217, goblinN267, clamp(goblinN268, 0.0, 1.0)); // Mix (Legacy).001
  return GoblinBlinkData(vec2(goblinN117, goblinN167), goblinN269);
}

vec3 goblinApplyBaseColor(vec3 textureBaseColor, GoblinBlinkData blinkData) {
  vec3 goblinN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 goblinN1 = mix(goblinN0, vec3(0.03799999877810478, 0.004000000189989805, 0.002400000113993883), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return goblinN1;
}

float goblinApplyRoughness(float textureRoughness, GoblinBlinkData blinkData) {
  float goblinN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float goblinN1 = ((textureRoughness) * (goblinN0)); // Math.268
  float goblinN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float goblinN3 = ((goblinN1) + (goblinN2)); // Math.270
  return goblinN3;
}

float goblinNormalStrength(GoblinBlinkData blinkData) {
  float goblinN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return goblinN0;
}
`;

export function sampleGoblinBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Goblin blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Goblin clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installGoblinMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Goblin instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Goblin_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Goblin rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Goblin requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Goblin requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Goblin_Blink_Surface material missing');
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
      shader.uniforms.goblinBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 goblinRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ngoblinRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 goblinRestPosition; uniform float goblinBlink;\n' + goblinBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        GoblinBlinkData goblinBlinkData = goblinEvaluateBlink(goblinRestPosition, goblinBlink);
        diffuseColor.rgb = goblinApplyBaseColor(diffuseColor.rgb, goblinBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = goblinApplyRoughness(roughnessFactor, goblinBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float goblinStrength = goblinNormalStrength(goblinBlinkData);
          vec3 goblinMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          goblinMapN.xy *= normalScale * goblinStrength;
          goblinMapN.z = mix(1.0, goblinMapN.z, clamp(goblinStrength, 0.0, 1.0));
          normal = normalize(tbn * goblinMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'goblin-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Goblin material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleGoblinBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Goblin blink update');
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
