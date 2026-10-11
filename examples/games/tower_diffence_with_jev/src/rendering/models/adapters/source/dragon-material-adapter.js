// Dragon_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const dragonBlinkGLSL = `// Generated only from Dragon_Blink_Surface. Input coordinates stay in Blender rest space.
struct DragonBlinkData { vec2 masks; vec3 lidColor; };

DragonBlinkData dragonEvaluateBlink(vec3 dragonRest, float dragonBlink) {
  float dragonN0 = (((dragonRest).x) - (-0.133186936378479)); // Math
  float dragonN1 = ((0.06518330425024033) == 0.0 ? 0.0 : (dragonN0) / (0.06518330425024033)); // Math.001
  float dragonN2 = ((dragonN1) * (dragonN1)); // Math.004
  float dragonN3 = (((dragonRest).z) - (0.18284285068511963)); // Math.002
  float dragonN4 = ((0.07329605519771576) == 0.0 ? 0.0 : (dragonN3) / (0.07329605519771576)); // Math.003
  float dragonN5 = ((dragonN4) * (dragonN4)); // Math.005
  float dragonN6 = ((dragonN2) + (dragonN5)); // Math.006
  float dragonN7 = sqrt(max(dragonN6, 0.0)); // Math.007
  float dragonN8 = ((dragonN7) - (0.9599999785423279)); // Math.008
  float dragonN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (dragonN8) / (0.05999999865889549)); // Math.009
  float dragonN10 = max(dragonN9, 0.0); // Math.010
  float dragonN11 = min(dragonN10, 1.0); // Math.011
  float dragonN12 = ((dragonN11) * (dragonN11)); // Math.012
  float dragonN13 = ((2.0) * (dragonN11)); // Math.013
  float dragonN14 = ((3.0) - (dragonN13)); // Math.014
  float dragonN15 = ((dragonN12) * (dragonN14)); // Math.015
  float dragonN16 = ((1.0) - (dragonN15)); // Math.016
  float dragonN17 = (((dragonRest).y) < (-0.5) ? 1.0 : 0.0); // Math.017
  float dragonN18 = (((dragonRest).y) > (-0.949999988079071) ? 1.0 : 0.0); // Math.018
  float dragonN19 = ((dragonN17) * (dragonN18)); // Math.019
  float dragonN20 = ((dragonN16) * (dragonN19)); // Math.020
  float dragonN21 = ((0.07629606127738953) * (dragonBlink)); // Math.025
  float dragonN22 = ((0.07329605519771576) - (dragonN21)); // Math.026
  float dragonN23 = ((dragonN1) * (dragonN1)); // Math.021
  float dragonN24 = ((1.0) - (dragonN23)); // Math.022
  float dragonN25 = max(dragonN24, 0.0); // Math.023
  float dragonN26 = sqrt(max(dragonN25, 0.0)); // Math.024
  float dragonN27 = ((dragonN22) * (dragonN26)); // Math.027
  float dragonN28 = ((0.18284285068511963) + (dragonN27)); // Math.028
  float dragonN29 = (((dragonRest).z) - (dragonN28)); // Math.033
  float dragonN30 = ((dragonN29) - (-0.0007999999797903001)); // Math.034
  float dragonN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (dragonN30) / (0.0015999999595806003)); // Math.035
  float dragonN32 = max(dragonN31, 0.0); // Math.036
  float dragonN33 = min(dragonN32, 1.0); // Math.037
  float dragonN34 = ((dragonN33) * (dragonN33)); // Math.038
  float dragonN35 = ((2.0) * (dragonN33)); // Math.039
  float dragonN36 = ((3.0) - (dragonN35)); // Math.040
  float dragonN37 = ((dragonN34) * (dragonN36)); // Math.041
  float dragonN38 = ((0.07029605656862259) * (dragonBlink)); // Math.029
  float dragonN39 = ((-0.07329605519771576) + (dragonN38)); // Math.030
  float dragonN40 = ((dragonN39) * (dragonN26)); // Math.031
  float dragonN41 = ((0.18284285068511963) + (dragonN40)); // Math.032
  float dragonN42 = (((dragonRest).z) - (dragonN41)); // Math.042
  float dragonN43 = ((dragonN42) - (-0.0007999999797903001)); // Math.043
  float dragonN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (dragonN43) / (0.0015999999595806003)); // Math.044
  float dragonN45 = max(dragonN44, 0.0); // Math.045
  float dragonN46 = min(dragonN45, 1.0); // Math.046
  float dragonN47 = ((dragonN46) * (dragonN46)); // Math.047
  float dragonN48 = ((2.0) * (dragonN46)); // Math.048
  float dragonN49 = ((3.0) - (dragonN48)); // Math.049
  float dragonN50 = ((dragonN47) * (dragonN49)); // Math.050
  float dragonN51 = ((1.0) - (dragonN50)); // Math.051
  float dragonN52 = ((dragonN37) + (dragonN51)); // Math.052
  float dragonN53 = min(dragonN52, 1.0); // Math.053
  float dragonN54 = ((dragonBlink) * (20.0)); // Math.054
  float dragonN55 = min(dragonN54, 1.0); // Math.055
  float dragonN56 = ((dragonN53) * (dragonN55)); // Math.056
  float dragonN57 = ((dragonN20) * (dragonN56)); // Math.057
  float dragonN58 = ((0.0) + (dragonN57)); // Math.058
  float dragonN59 = (((dragonRest).x) - (0.1329597383737564)); // Math.084
  float dragonN60 = ((0.06481608748435974) == 0.0 ? 0.0 : (dragonN59) / (0.06481608748435974)); // Math.085
  float dragonN61 = ((dragonN60) * (dragonN60)); // Math.088
  float dragonN62 = (((dragonRest).z) - (0.18284285068511963)); // Math.086
  float dragonN63 = ((0.07329605519771576) == 0.0 ? 0.0 : (dragonN62) / (0.07329605519771576)); // Math.087
  float dragonN64 = ((dragonN63) * (dragonN63)); // Math.089
  float dragonN65 = ((dragonN61) + (dragonN64)); // Math.090
  float dragonN66 = sqrt(max(dragonN65, 0.0)); // Math.091
  float dragonN67 = ((dragonN66) - (0.9599999785423279)); // Math.092
  float dragonN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (dragonN67) / (0.05999999865889549)); // Math.093
  float dragonN69 = max(dragonN68, 0.0); // Math.094
  float dragonN70 = min(dragonN69, 1.0); // Math.095
  float dragonN71 = ((dragonN70) * (dragonN70)); // Math.096
  float dragonN72 = ((2.0) * (dragonN70)); // Math.097
  float dragonN73 = ((3.0) - (dragonN72)); // Math.098
  float dragonN74 = ((dragonN71) * (dragonN73)); // Math.099
  float dragonN75 = ((1.0) - (dragonN74)); // Math.100
  float dragonN76 = (((dragonRest).y) < (-0.5) ? 1.0 : 0.0); // Math.101
  float dragonN77 = (((dragonRest).y) > (-0.949999988079071) ? 1.0 : 0.0); // Math.102
  float dragonN78 = ((dragonN76) * (dragonN77)); // Math.103
  float dragonN79 = ((dragonN75) * (dragonN78)); // Math.104
  float dragonN80 = ((0.07629606127738953) * (dragonBlink)); // Math.109
  float dragonN81 = ((0.07329605519771576) - (dragonN80)); // Math.110
  float dragonN82 = ((dragonN60) * (dragonN60)); // Math.105
  float dragonN83 = ((1.0) - (dragonN82)); // Math.106
  float dragonN84 = max(dragonN83, 0.0); // Math.107
  float dragonN85 = sqrt(max(dragonN84, 0.0)); // Math.108
  float dragonN86 = ((dragonN81) * (dragonN85)); // Math.111
  float dragonN87 = ((0.18284285068511963) + (dragonN86)); // Math.112
  float dragonN88 = (((dragonRest).z) - (dragonN87)); // Math.117
  float dragonN89 = ((dragonN88) - (-0.0007999999797903001)); // Math.118
  float dragonN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (dragonN89) / (0.0015999999595806003)); // Math.119
  float dragonN91 = max(dragonN90, 0.0); // Math.120
  float dragonN92 = min(dragonN91, 1.0); // Math.121
  float dragonN93 = ((dragonN92) * (dragonN92)); // Math.122
  float dragonN94 = ((2.0) * (dragonN92)); // Math.123
  float dragonN95 = ((3.0) - (dragonN94)); // Math.124
  float dragonN96 = ((dragonN93) * (dragonN95)); // Math.125
  float dragonN97 = ((0.07029605656862259) * (dragonBlink)); // Math.113
  float dragonN98 = ((-0.07329605519771576) + (dragonN97)); // Math.114
  float dragonN99 = ((dragonN98) * (dragonN85)); // Math.115
  float dragonN100 = ((0.18284285068511963) + (dragonN99)); // Math.116
  float dragonN101 = (((dragonRest).z) - (dragonN100)); // Math.126
  float dragonN102 = ((dragonN101) - (-0.0007999999797903001)); // Math.127
  float dragonN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (dragonN102) / (0.0015999999595806003)); // Math.128
  float dragonN104 = max(dragonN103, 0.0); // Math.129
  float dragonN105 = min(dragonN104, 1.0); // Math.130
  float dragonN106 = ((dragonN105) * (dragonN105)); // Math.131
  float dragonN107 = ((2.0) * (dragonN105)); // Math.132
  float dragonN108 = ((3.0) - (dragonN107)); // Math.133
  float dragonN109 = ((dragonN106) * (dragonN108)); // Math.134
  float dragonN110 = ((1.0) - (dragonN109)); // Math.135
  float dragonN111 = ((dragonN96) + (dragonN110)); // Math.136
  float dragonN112 = min(dragonN111, 1.0); // Math.137
  float dragonN113 = ((dragonBlink) * (20.0)); // Math.138
  float dragonN114 = min(dragonN113, 1.0); // Math.139
  float dragonN115 = ((dragonN112) * (dragonN114)); // Math.140
  float dragonN116 = ((dragonN79) * (dragonN115)); // Math.141
  float dragonN117 = ((dragonN58) + (dragonN116)); // Math.142
  float dragonN118 = (((dragonRest).z) - (dragonN28)); // Math.059
  float dragonN119 = abs(dragonN118); // Math.060
  float dragonN120 = ((dragonN119) - (0.001500000013038516)); // Math.061
  float dragonN121 = ((0.001500000013038516) == 0.0 ? 0.0 : (dragonN120) / (0.001500000013038516)); // Math.062
  float dragonN122 = max(dragonN121, 0.0); // Math.063
  float dragonN123 = min(dragonN122, 1.0); // Math.064
  float dragonN124 = ((dragonN123) * (dragonN123)); // Math.065
  float dragonN125 = ((2.0) * (dragonN123)); // Math.066
  float dragonN126 = ((3.0) - (dragonN125)); // Math.067
  float dragonN127 = ((dragonN124) * (dragonN126)); // Math.068
  float dragonN128 = ((1.0) - (dragonN127)); // Math.069
  float dragonN129 = abs(dragonN1); // Math.070
  float dragonN130 = ((dragonN129) - (0.8999999761581421)); // Math.071
  float dragonN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (dragonN130) / (0.10000000149011612)); // Math.072
  float dragonN132 = max(dragonN131, 0.0); // Math.073
  float dragonN133 = min(dragonN132, 1.0); // Math.074
  float dragonN134 = ((dragonN133) * (dragonN133)); // Math.075
  float dragonN135 = ((2.0) * (dragonN133)); // Math.076
  float dragonN136 = ((3.0) - (dragonN135)); // Math.077
  float dragonN137 = ((dragonN134) * (dragonN136)); // Math.078
  float dragonN138 = ((1.0) - (dragonN137)); // Math.079
  float dragonN139 = ((dragonN128) * (dragonN138)); // Math.080
  float dragonN140 = ((dragonN139) * (dragonN55)); // Math.081
  float dragonN141 = ((dragonN20) * (dragonN140)); // Math.082
  float dragonN142 = ((0.0) + (dragonN141)); // Math.083
  float dragonN143 = (((dragonRest).z) - (dragonN87)); // Math.143
  float dragonN144 = abs(dragonN143); // Math.144
  float dragonN145 = ((dragonN144) - (0.001500000013038516)); // Math.145
  float dragonN146 = ((0.001500000013038516) == 0.0 ? 0.0 : (dragonN145) / (0.001500000013038516)); // Math.146
  float dragonN147 = max(dragonN146, 0.0); // Math.147
  float dragonN148 = min(dragonN147, 1.0); // Math.148
  float dragonN149 = ((dragonN148) * (dragonN148)); // Math.149
  float dragonN150 = ((2.0) * (dragonN148)); // Math.150
  float dragonN151 = ((3.0) - (dragonN150)); // Math.151
  float dragonN152 = ((dragonN149) * (dragonN151)); // Math.152
  float dragonN153 = ((1.0) - (dragonN152)); // Math.153
  float dragonN154 = abs(dragonN60); // Math.154
  float dragonN155 = ((dragonN154) - (0.8999999761581421)); // Math.155
  float dragonN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (dragonN155) / (0.10000000149011612)); // Math.156
  float dragonN157 = max(dragonN156, 0.0); // Math.157
  float dragonN158 = min(dragonN157, 1.0); // Math.158
  float dragonN159 = ((dragonN158) * (dragonN158)); // Math.159
  float dragonN160 = ((2.0) * (dragonN158)); // Math.160
  float dragonN161 = ((3.0) - (dragonN160)); // Math.161
  float dragonN162 = ((dragonN159) * (dragonN161)); // Math.162
  float dragonN163 = ((1.0) - (dragonN162)); // Math.163
  float dragonN164 = ((dragonN153) * (dragonN163)); // Math.164
  float dragonN165 = ((dragonN164) * (dragonN114)); // Math.165
  float dragonN166 = ((dragonN79) * (dragonN165)); // Math.166
  float dragonN167 = ((dragonN142) + (dragonN166)); // Math.167
  float dragonN168 = ((0.7848626375198364) * (1.0)); // Math.175
  float dragonN169 = ((0.0) + (dragonN168)); // Math.176
  float dragonN170 = (((dragonRest).x) - (-0.133186936378479)); // Math.168
  float dragonN171 = ((0.06518330425024033) == 0.0 ? 0.0 : (dragonN170) / (0.06518330425024033)); // Math.169
  float dragonN172 = ((0.031695619225502014) * (dragonN171)); // Math.177
  float dragonN173 = ((dragonN169) + (dragonN172)); // Math.178
  float dragonN174 = (((dragonRest).z) - (0.18284285068511963)); // Math.170
  float dragonN175 = ((0.07329605519771576) == 0.0 ? 0.0 : (dragonN174) / (0.07329605519771576)); // Math.171
  float dragonN176 = ((-0.025891244411468506) * (dragonN175)); // Math.179
  float dragonN177 = ((dragonN173) + (dragonN176)); // Math.180
  float dragonN178 = ((dragonN171) * (dragonN171)); // Math.172
  float dragonN179 = ((0.03186508268117905) * (dragonN178)); // Math.181
  float dragonN180 = ((dragonN177) + (dragonN179)); // Math.182
  float dragonN181 = ((dragonN171) * (dragonN175)); // Math.173
  float dragonN182 = ((0.0948614701628685) * (dragonN181)); // Math.183
  float dragonN183 = ((dragonN180) + (dragonN182)); // Math.184
  float dragonN184 = ((dragonN175) * (dragonN175)); // Math.174
  float dragonN185 = ((0.053261272609233856) * (dragonN184)); // Math.185
  float dragonN186 = ((dragonN183) + (dragonN185)); // Math.186
  float dragonN187 = max(dragonN186, 0.0); // Math.187
  float dragonN188 = min(dragonN187, 1.0); // Math.188
  float dragonN189 = ((0.08187464624643326) * (1.0)); // Math.189
  float dragonN190 = ((0.0) + (dragonN189)); // Math.190
  float dragonN191 = ((0.008643215522170067) * (dragonN171)); // Math.191
  float dragonN192 = ((dragonN190) + (dragonN191)); // Math.192
  float dragonN193 = ((-0.002925148466601968) * (dragonN175)); // Math.193
  float dragonN194 = ((dragonN192) + (dragonN193)); // Math.194
  float dragonN195 = ((-0.006072336342185736) * (dragonN178)); // Math.195
  float dragonN196 = ((dragonN194) + (dragonN195)); // Math.196
  float dragonN197 = ((0.03897540271282196) * (dragonN181)); // Math.197
  float dragonN198 = ((dragonN196) + (dragonN197)); // Math.198
  float dragonN199 = ((0.0157553032040596) * (dragonN184)); // Math.199
  float dragonN200 = ((dragonN198) + (dragonN199)); // Math.200
  float dragonN201 = max(dragonN200, 0.0); // Math.201
  float dragonN202 = min(dragonN201, 1.0); // Math.202
  float dragonN203 = ((0.03317977860569954) * (1.0)); // Math.203
  float dragonN204 = ((0.0) + (dragonN203)); // Math.204
  float dragonN205 = ((0.0024879092816263437) * (dragonN171)); // Math.205
  float dragonN206 = ((dragonN204) + (dragonN205)); // Math.206
  float dragonN207 = ((-0.00201558880507946) * (dragonN175)); // Math.207
  float dragonN208 = ((dragonN206) + (dragonN207)); // Math.208
  float dragonN209 = ((-0.0023750592954456806) * (dragonN178)); // Math.209
  float dragonN210 = ((dragonN208) + (dragonN209)); // Math.210
  float dragonN211 = ((0.011213297955691814) * (dragonN181)); // Math.211
  float dragonN212 = ((dragonN210) + (dragonN211)); // Math.212
  float dragonN213 = ((0.0030278221238404512) * (dragonN184)); // Math.213
  float dragonN214 = ((dragonN212) + (dragonN213)); // Math.214
  float dragonN215 = max(dragonN214, 0.0); // Math.215
  float dragonN216 = min(dragonN215, 1.0); // Math.216
  vec3 dragonN217 = vec3(dragonN188, dragonN202, dragonN216); // Combine XYZ
  float dragonN218 = ((0.7826839685440063) * (1.0)); // Math.224
  float dragonN219 = ((0.0) + (dragonN218)); // Math.225
  float dragonN220 = (((dragonRest).x) - (0.1329597383737564)); // Math.217
  float dragonN221 = ((0.06481608748435974) == 0.0 ? 0.0 : (dragonN220) / (0.06481608748435974)); // Math.218
  float dragonN222 = ((-0.03260739520192146) * (dragonN221)); // Math.226
  float dragonN223 = ((dragonN219) + (dragonN222)); // Math.227
  float dragonN224 = (((dragonRest).z) - (0.18284285068511963)); // Math.219
  float dragonN225 = ((0.07329605519771576) == 0.0 ? 0.0 : (dragonN224) / (0.07329605519771576)); // Math.220
  float dragonN226 = ((-0.023040680214762688) * (dragonN225)); // Math.228
  float dragonN227 = ((dragonN223) + (dragonN226)); // Math.229
  float dragonN228 = ((dragonN221) * (dragonN221)); // Math.221
  float dragonN229 = ((0.03032566048204899) * (dragonN228)); // Math.230
  float dragonN230 = ((dragonN227) + (dragonN229)); // Math.231
  float dragonN231 = ((dragonN221) * (dragonN225)); // Math.222
  float dragonN232 = ((-0.09682725369930267) * (dragonN231)); // Math.232
  float dragonN233 = ((dragonN230) + (dragonN232)); // Math.233
  float dragonN234 = ((dragonN225) * (dragonN225)); // Math.223
  float dragonN235 = ((0.05838602036237717) * (dragonN234)); // Math.234
  float dragonN236 = ((dragonN233) + (dragonN235)); // Math.235
  float dragonN237 = max(dragonN236, 0.0); // Math.236
  float dragonN238 = min(dragonN237, 1.0); // Math.237
  float dragonN239 = ((0.082768015563488) * (1.0)); // Math.238
  float dragonN240 = ((0.0) + (dragonN239)); // Math.239
  float dragonN241 = ((-0.009678211994469166) * (dragonN221)); // Math.240
  float dragonN242 = ((dragonN240) + (dragonN241)); // Math.241
  float dragonN243 = ((-0.004144070204347372) * (dragonN225)); // Math.242
  float dragonN244 = ((dragonN242) + (dragonN243)); // Math.243
  float dragonN245 = ((-0.007786660920828581) * (dragonN228)); // Math.244
  float dragonN246 = ((dragonN244) + (dragonN245)); // Math.245
  float dragonN247 = ((-0.03950118273496628) * (dragonN231)); // Math.246
  float dragonN248 = ((dragonN246) + (dragonN247)); // Math.247
  float dragonN249 = ((0.016438374295830727) * (dragonN234)); // Math.248
  float dragonN250 = ((dragonN248) + (dragonN249)); // Math.249
  float dragonN251 = max(dragonN250, 0.0); // Math.250
  float dragonN252 = min(dragonN251, 1.0); // Math.251
  float dragonN253 = ((0.03409074991941452) * (1.0)); // Math.252
  float dragonN254 = ((0.0) + (dragonN253)); // Math.253
  float dragonN255 = ((-0.0027952033560723066) * (dragonN221)); // Math.254
  float dragonN256 = ((dragonN254) + (dragonN255)); // Math.255
  float dragonN257 = ((-0.0024694299791008234) * (dragonN225)); // Math.256
  float dragonN258 = ((dragonN256) + (dragonN257)); // Math.257
  float dragonN259 = ((-0.003555825212970376) * (dragonN228)); // Math.258
  float dragonN260 = ((dragonN258) + (dragonN259)); // Math.259
  float dragonN261 = ((-0.011522266082465649) * (dragonN231)); // Math.260
  float dragonN262 = ((dragonN260) + (dragonN261)); // Math.261
  float dragonN263 = ((0.0029252106323838234) * (dragonN234)); // Math.262
  float dragonN264 = ((dragonN262) + (dragonN263)); // Math.263
  float dragonN265 = max(dragonN264, 0.0); // Math.264
  float dragonN266 = min(dragonN265, 1.0); // Math.265
  vec3 dragonN267 = vec3(dragonN238, dragonN252, dragonN266); // Combine XYZ.001
  float dragonN268 = (((dragonRest).x) > (0.0) ? 1.0 : 0.0); // Math.266
  vec3 dragonN269 = mix(dragonN217, dragonN267, clamp(dragonN268, 0.0, 1.0)); // Mix (Legacy).001
  return DragonBlinkData(vec2(dragonN117, dragonN167), dragonN269);
}

vec3 dragonApplyBaseColor(vec3 textureBaseColor, DragonBlinkData blinkData) {
  vec3 dragonN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 dragonN1 = mix(dragonN0, vec3(0.03500000014901161, 0.013000000268220901, 0.006000000052154064), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return dragonN1;
}

float dragonApplyRoughness(float textureRoughness, DragonBlinkData blinkData) {
  float dragonN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float dragonN1 = ((textureRoughness) * (dragonN0)); // Math.268
  float dragonN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float dragonN3 = ((dragonN1) + (dragonN2)); // Math.270
  return dragonN3;
}

float dragonNormalStrength(DragonBlinkData blinkData) {
  float dragonN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return dragonN0;
}
`;

export function sampleDragonBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Dragon blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Dragon clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installDragonMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Dragon instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Dragon_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Dragon rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Dragon requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Dragon requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Dragon_Blink_Surface material missing');
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
      shader.uniforms.dragonBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 dragonRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ndragonRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 dragonRestPosition; uniform float dragonBlink;\n' + dragonBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        DragonBlinkData dragonBlinkData = dragonEvaluateBlink(dragonRestPosition, dragonBlink);
        diffuseColor.rgb = dragonApplyBaseColor(diffuseColor.rgb, dragonBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = dragonApplyRoughness(roughnessFactor, dragonBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float dragonStrength = dragonNormalStrength(dragonBlinkData);
          vec3 dragonMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          dragonMapN.xy *= normalScale * dragonStrength;
          dragonMapN.z = mix(1.0, dragonMapN.z, clamp(dragonStrength, 0.0, 1.0));
          normal = normalize(tbn * dragonMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'dragon-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Dragon material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleDragonBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Dragon blink update');
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
