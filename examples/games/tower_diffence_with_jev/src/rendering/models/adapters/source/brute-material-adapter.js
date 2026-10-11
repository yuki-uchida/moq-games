// Brute_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const bruteBlinkGLSL = `// Generated only from Brute_Blink_Surface. Input coordinates stay in Blender rest space.
struct BruteBlinkData { vec2 masks; vec3 lidColor; };

BruteBlinkData bruteEvaluateBlink(vec3 bruteRest, float bruteBlink) {
  float bruteN0 = (((bruteRest).x) - (-0.07670111954212189)); // Math
  float bruteN1 = ((0.04082059487700462) == 0.0 ? 0.0 : (bruteN0) / (0.04082059487700462)); // Math.001
  float bruteN2 = ((bruteN1) * (bruteN1)); // Math.004
  float bruteN3 = (((bruteRest).z) - (0.5294241309165955)); // Math.002
  float bruteN4 = ((0.04031667113304138) == 0.0 ? 0.0 : (bruteN3) / (0.04031667113304138)); // Math.003
  float bruteN5 = ((bruteN4) * (bruteN4)); // Math.005
  float bruteN6 = ((bruteN2) + (bruteN5)); // Math.006
  float bruteN7 = sqrt(max(bruteN6, 0.0)); // Math.007
  float bruteN8 = ((bruteN7) - (0.9599999785423279)); // Math.008
  float bruteN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (bruteN8) / (0.05999999865889549)); // Math.009
  float bruteN10 = max(bruteN9, 0.0); // Math.010
  float bruteN11 = min(bruteN10, 1.0); // Math.011
  float bruteN12 = ((bruteN11) * (bruteN11)); // Math.012
  float bruteN13 = ((2.0) * (bruteN11)); // Math.013
  float bruteN14 = ((3.0) - (bruteN13)); // Math.014
  float bruteN15 = ((bruteN12) * (bruteN14)); // Math.015
  float bruteN16 = ((1.0) - (bruteN15)); // Math.016
  float bruteN17 = (((bruteRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.017
  float bruteN18 = (((bruteRest).y) > (-0.5) ? 1.0 : 0.0); // Math.018
  float bruteN19 = ((bruteN17) * (bruteN18)); // Math.019
  float bruteN20 = ((bruteN16) * (bruteN19)); // Math.020
  float bruteN21 = ((0.06531666964292526) * (bruteBlink)); // Math.025
  float bruteN22 = ((0.04031667113304138) - (bruteN21)); // Math.026
  float bruteN23 = ((bruteN1) * (bruteN1)); // Math.021
  float bruteN24 = ((1.0) - (bruteN23)); // Math.022
  float bruteN25 = max(bruteN24, 0.0); // Math.023
  float bruteN26 = sqrt(max(bruteN25, 0.0)); // Math.024
  float bruteN27 = ((bruteN22) * (bruteN26)); // Math.027
  float bruteN28 = ((0.5294241309165955) + (bruteN27)); // Math.028
  float bruteN29 = (((bruteRest).z) - (bruteN28)); // Math.033
  float bruteN30 = ((bruteN29) - (-0.0007999999797903001)); // Math.034
  float bruteN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (bruteN30) / (0.0015999999595806003)); // Math.035
  float bruteN32 = max(bruteN31, 0.0); // Math.036
  float bruteN33 = min(bruteN32, 1.0); // Math.037
  float bruteN34 = ((bruteN33) * (bruteN33)); // Math.038
  float bruteN35 = ((2.0) * (bruteN33)); // Math.039
  float bruteN36 = ((3.0) - (bruteN35)); // Math.040
  float bruteN37 = ((bruteN34) * (bruteN36)); // Math.041
  float bruteN38 = ((0.015316672623157501) * (bruteBlink)); // Math.029
  float bruteN39 = ((-0.04031667113304138) + (bruteN38)); // Math.030
  float bruteN40 = ((bruteN39) * (bruteN26)); // Math.031
  float bruteN41 = ((0.5294241309165955) + (bruteN40)); // Math.032
  float bruteN42 = (((bruteRest).z) - (bruteN41)); // Math.042
  float bruteN43 = ((bruteN42) - (-0.0007999999797903001)); // Math.043
  float bruteN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (bruteN43) / (0.0015999999595806003)); // Math.044
  float bruteN45 = max(bruteN44, 0.0); // Math.045
  float bruteN46 = min(bruteN45, 1.0); // Math.046
  float bruteN47 = ((bruteN46) * (bruteN46)); // Math.047
  float bruteN48 = ((2.0) * (bruteN46)); // Math.048
  float bruteN49 = ((3.0) - (bruteN48)); // Math.049
  float bruteN50 = ((bruteN47) * (bruteN49)); // Math.050
  float bruteN51 = ((1.0) - (bruteN50)); // Math.051
  float bruteN52 = ((bruteN37) + (bruteN51)); // Math.052
  float bruteN53 = min(bruteN52, 1.0); // Math.053
  float bruteN54 = ((bruteBlink) * (20.0)); // Math.054
  float bruteN55 = min(bruteN54, 1.0); // Math.055
  float bruteN56 = ((bruteN53) * (bruteN55)); // Math.056
  float bruteN57 = ((bruteN20) * (bruteN56)); // Math.057
  float bruteN58 = ((0.0) + (bruteN57)); // Math.058
  float bruteN59 = (((bruteRest).x) - (0.0753868892788887)); // Math.084
  float bruteN60 = ((0.041500288993120193) == 0.0 ? 0.0 : (bruteN59) / (0.041500288993120193)); // Math.085
  float bruteN61 = ((bruteN60) * (bruteN60)); // Math.088
  float bruteN62 = (((bruteRest).z) - (0.5294241309165955)); // Math.086
  float bruteN63 = ((0.04031667113304138) == 0.0 ? 0.0 : (bruteN62) / (0.04031667113304138)); // Math.087
  float bruteN64 = ((bruteN63) * (bruteN63)); // Math.089
  float bruteN65 = ((bruteN61) + (bruteN64)); // Math.090
  float bruteN66 = sqrt(max(bruteN65, 0.0)); // Math.091
  float bruteN67 = ((bruteN66) - (0.9599999785423279)); // Math.092
  float bruteN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (bruteN67) / (0.05999999865889549)); // Math.093
  float bruteN69 = max(bruteN68, 0.0); // Math.094
  float bruteN70 = min(bruteN69, 1.0); // Math.095
  float bruteN71 = ((bruteN70) * (bruteN70)); // Math.096
  float bruteN72 = ((2.0) * (bruteN70)); // Math.097
  float bruteN73 = ((3.0) - (bruteN72)); // Math.098
  float bruteN74 = ((bruteN71) * (bruteN73)); // Math.099
  float bruteN75 = ((1.0) - (bruteN74)); // Math.100
  float bruteN76 = (((bruteRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.101
  float bruteN77 = (((bruteRest).y) > (-0.5) ? 1.0 : 0.0); // Math.102
  float bruteN78 = ((bruteN76) * (bruteN77)); // Math.103
  float bruteN79 = ((bruteN75) * (bruteN78)); // Math.104
  float bruteN80 = ((0.06531666964292526) * (bruteBlink)); // Math.109
  float bruteN81 = ((0.04031667113304138) - (bruteN80)); // Math.110
  float bruteN82 = ((bruteN60) * (bruteN60)); // Math.105
  float bruteN83 = ((1.0) - (bruteN82)); // Math.106
  float bruteN84 = max(bruteN83, 0.0); // Math.107
  float bruteN85 = sqrt(max(bruteN84, 0.0)); // Math.108
  float bruteN86 = ((bruteN81) * (bruteN85)); // Math.111
  float bruteN87 = ((0.5294241309165955) + (bruteN86)); // Math.112
  float bruteN88 = (((bruteRest).z) - (bruteN87)); // Math.117
  float bruteN89 = ((bruteN88) - (-0.0007999999797903001)); // Math.118
  float bruteN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (bruteN89) / (0.0015999999595806003)); // Math.119
  float bruteN91 = max(bruteN90, 0.0); // Math.120
  float bruteN92 = min(bruteN91, 1.0); // Math.121
  float bruteN93 = ((bruteN92) * (bruteN92)); // Math.122
  float bruteN94 = ((2.0) * (bruteN92)); // Math.123
  float bruteN95 = ((3.0) - (bruteN94)); // Math.124
  float bruteN96 = ((bruteN93) * (bruteN95)); // Math.125
  float bruteN97 = ((0.015316672623157501) * (bruteBlink)); // Math.113
  float bruteN98 = ((-0.04031667113304138) + (bruteN97)); // Math.114
  float bruteN99 = ((bruteN98) * (bruteN85)); // Math.115
  float bruteN100 = ((0.5294241309165955) + (bruteN99)); // Math.116
  float bruteN101 = (((bruteRest).z) - (bruteN100)); // Math.126
  float bruteN102 = ((bruteN101) - (-0.0007999999797903001)); // Math.127
  float bruteN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (bruteN102) / (0.0015999999595806003)); // Math.128
  float bruteN104 = max(bruteN103, 0.0); // Math.129
  float bruteN105 = min(bruteN104, 1.0); // Math.130
  float bruteN106 = ((bruteN105) * (bruteN105)); // Math.131
  float bruteN107 = ((2.0) * (bruteN105)); // Math.132
  float bruteN108 = ((3.0) - (bruteN107)); // Math.133
  float bruteN109 = ((bruteN106) * (bruteN108)); // Math.134
  float bruteN110 = ((1.0) - (bruteN109)); // Math.135
  float bruteN111 = ((bruteN96) + (bruteN110)); // Math.136
  float bruteN112 = min(bruteN111, 1.0); // Math.137
  float bruteN113 = ((bruteBlink) * (20.0)); // Math.138
  float bruteN114 = min(bruteN113, 1.0); // Math.139
  float bruteN115 = ((bruteN112) * (bruteN114)); // Math.140
  float bruteN116 = ((bruteN79) * (bruteN115)); // Math.141
  float bruteN117 = ((bruteN58) + (bruteN116)); // Math.142
  float bruteN118 = (((bruteRest).z) - (bruteN28)); // Math.059
  float bruteN119 = abs(bruteN118); // Math.060
  float bruteN120 = ((bruteN119) - (0.0044999998062849045)); // Math.061
  float bruteN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (bruteN120) / (0.0044999998062849045)); // Math.062
  float bruteN122 = max(bruteN121, 0.0); // Math.063
  float bruteN123 = min(bruteN122, 1.0); // Math.064
  float bruteN124 = ((bruteN123) * (bruteN123)); // Math.065
  float bruteN125 = ((2.0) * (bruteN123)); // Math.066
  float bruteN126 = ((3.0) - (bruteN125)); // Math.067
  float bruteN127 = ((bruteN124) * (bruteN126)); // Math.068
  float bruteN128 = ((1.0) - (bruteN127)); // Math.069
  float bruteN129 = abs(bruteN1); // Math.070
  float bruteN130 = ((bruteN129) - (0.8999999761581421)); // Math.071
  float bruteN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (bruteN130) / (0.10000000149011612)); // Math.072
  float bruteN132 = max(bruteN131, 0.0); // Math.073
  float bruteN133 = min(bruteN132, 1.0); // Math.074
  float bruteN134 = ((bruteN133) * (bruteN133)); // Math.075
  float bruteN135 = ((2.0) * (bruteN133)); // Math.076
  float bruteN136 = ((3.0) - (bruteN135)); // Math.077
  float bruteN137 = ((bruteN134) * (bruteN136)); // Math.078
  float bruteN138 = ((1.0) - (bruteN137)); // Math.079
  float bruteN139 = ((bruteN128) * (bruteN138)); // Math.080
  float bruteN140 = ((bruteN139) * (bruteN55)); // Math.081
  float bruteN141 = ((bruteN20) * (bruteN140)); // Math.082
  float bruteN142 = ((0.0) + (bruteN141)); // Math.083
  float bruteN143 = (((bruteRest).z) - (bruteN87)); // Math.143
  float bruteN144 = abs(bruteN143); // Math.144
  float bruteN145 = ((bruteN144) - (0.0044999998062849045)); // Math.145
  float bruteN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (bruteN145) / (0.0044999998062849045)); // Math.146
  float bruteN147 = max(bruteN146, 0.0); // Math.147
  float bruteN148 = min(bruteN147, 1.0); // Math.148
  float bruteN149 = ((bruteN148) * (bruteN148)); // Math.149
  float bruteN150 = ((2.0) * (bruteN148)); // Math.150
  float bruteN151 = ((3.0) - (bruteN150)); // Math.151
  float bruteN152 = ((bruteN149) * (bruteN151)); // Math.152
  float bruteN153 = ((1.0) - (bruteN152)); // Math.153
  float bruteN154 = abs(bruteN60); // Math.154
  float bruteN155 = ((bruteN154) - (0.8999999761581421)); // Math.155
  float bruteN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (bruteN155) / (0.10000000149011612)); // Math.156
  float bruteN157 = max(bruteN156, 0.0); // Math.157
  float bruteN158 = min(bruteN157, 1.0); // Math.158
  float bruteN159 = ((bruteN158) * (bruteN158)); // Math.159
  float bruteN160 = ((2.0) * (bruteN158)); // Math.160
  float bruteN161 = ((3.0) - (bruteN160)); // Math.161
  float bruteN162 = ((bruteN159) * (bruteN161)); // Math.162
  float bruteN163 = ((1.0) - (bruteN162)); // Math.163
  float bruteN164 = ((bruteN153) * (bruteN163)); // Math.164
  float bruteN165 = ((bruteN164) * (bruteN114)); // Math.165
  float bruteN166 = ((bruteN79) * (bruteN165)); // Math.166
  float bruteN167 = ((bruteN142) + (bruteN166)); // Math.167
  float bruteN168 = ((0.7216634750366211) * (1.0)); // Math.175
  float bruteN169 = ((0.0) + (bruteN168)); // Math.176
  float bruteN170 = (((bruteRest).x) - (-0.07670111954212189)); // Math.168
  float bruteN171 = ((0.04082059487700462) == 0.0 ? 0.0 : (bruteN170) / (0.04082059487700462)); // Math.169
  float bruteN172 = ((0.033531658351421356) * (bruteN171)); // Math.177
  float bruteN173 = ((bruteN169) + (bruteN172)); // Math.178
  float bruteN174 = (((bruteRest).z) - (0.5294241309165955)); // Math.170
  float bruteN175 = ((0.04031667113304138) == 0.0 ? 0.0 : (bruteN174) / (0.04031667113304138)); // Math.171
  float bruteN176 = ((0.0001193401258205995) * (bruteN175)); // Math.179
  float bruteN177 = ((bruteN173) + (bruteN176)); // Math.180
  float bruteN178 = ((bruteN171) * (bruteN171)); // Math.172
  float bruteN179 = ((-0.2359122335910797) * (bruteN178)); // Math.181
  float bruteN180 = ((bruteN177) + (bruteN179)); // Math.182
  float bruteN181 = ((bruteN171) * (bruteN175)); // Math.173
  float bruteN182 = ((-0.001741544110700488) * (bruteN181)); // Math.183
  float bruteN183 = ((bruteN180) + (bruteN182)); // Math.184
  float bruteN184 = ((bruteN175) * (bruteN175)); // Math.174
  float bruteN185 = ((-0.23017676174640656) * (bruteN184)); // Math.185
  float bruteN186 = ((bruteN183) + (bruteN185)); // Math.186
  float bruteN187 = max(bruteN186, 0.0); // Math.187
  float bruteN188 = min(bruteN187, 1.0); // Math.188
  float bruteN189 = ((0.5761422514915466) * (1.0)); // Math.189
  float bruteN190 = ((0.0) + (bruteN189)); // Math.190
  float bruteN191 = ((0.025992751121520996) * (bruteN171)); // Math.191
  float bruteN192 = ((bruteN190) + (bruteN191)); // Math.192
  float bruteN193 = ((0.004714277107268572) * (bruteN175)); // Math.193
  float bruteN194 = ((bruteN192) + (bruteN193)); // Math.194
  float bruteN195 = ((-0.1860126405954361) * (bruteN178)); // Math.195
  float bruteN196 = ((bruteN194) + (bruteN195)); // Math.196
  float bruteN197 = ((-0.005022828467190266) * (bruteN181)); // Math.197
  float bruteN198 = ((bruteN196) + (bruteN197)); // Math.198
  float bruteN199 = ((-0.19389845430850983) * (bruteN184)); // Math.199
  float bruteN200 = ((bruteN198) + (bruteN199)); // Math.200
  float bruteN201 = max(bruteN200, 0.0); // Math.201
  float bruteN202 = min(bruteN201, 1.0); // Math.202
  float bruteN203 = ((0.412537157535553) * (1.0)); // Math.203
  float bruteN204 = ((0.0) + (bruteN203)); // Math.204
  float bruteN205 = ((0.01606772653758526) * (bruteN171)); // Math.205
  float bruteN206 = ((bruteN204) + (bruteN205)); // Math.206
  float bruteN207 = ((0.010226462967693806) * (bruteN175)); // Math.207
  float bruteN208 = ((bruteN206) + (bruteN207)); // Math.208
  float bruteN209 = ((-0.11221908032894135) * (bruteN178)); // Math.209
  float bruteN210 = ((bruteN208) + (bruteN209)); // Math.210
  float bruteN211 = ((-0.009639420546591282) * (bruteN181)); // Math.211
  float bruteN212 = ((bruteN210) + (bruteN211)); // Math.212
  float bruteN213 = ((-0.1199609786272049) * (bruteN184)); // Math.213
  float bruteN214 = ((bruteN212) + (bruteN213)); // Math.214
  float bruteN215 = max(bruteN214, 0.0); // Math.215
  float bruteN216 = min(bruteN215, 1.0); // Math.216
  vec3 bruteN217 = vec3(bruteN188, bruteN202, bruteN216); // Combine XYZ
  float bruteN218 = ((0.6570848226547241) * (1.0)); // Math.224
  float bruteN219 = ((0.0) + (bruteN218)); // Math.225
  float bruteN220 = (((bruteRest).x) - (0.0753868892788887)); // Math.217
  float bruteN221 = ((0.041500288993120193) == 0.0 ? 0.0 : (bruteN220) / (0.041500288993120193)); // Math.218
  float bruteN222 = ((-0.03410943225026131) * (bruteN221)); // Math.226
  float bruteN223 = ((bruteN219) + (bruteN222)); // Math.227
  float bruteN224 = (((bruteRest).z) - (0.5294241309165955)); // Math.219
  float bruteN225 = ((0.04031667113304138) == 0.0 ? 0.0 : (bruteN224) / (0.04031667113304138)); // Math.220
  float bruteN226 = ((-0.0015662160003557801) * (bruteN225)); // Math.228
  float bruteN227 = ((bruteN223) + (bruteN226)); // Math.229
  float bruteN228 = ((bruteN221) * (bruteN221)); // Math.221
  float bruteN229 = ((-0.18887001276016235) * (bruteN228)); // Math.230
  float bruteN230 = ((bruteN227) + (bruteN229)); // Math.231
  float bruteN231 = ((bruteN221) * (bruteN225)); // Math.222
  float bruteN232 = ((0.011129382066428661) * (bruteN231)); // Math.232
  float bruteN233 = ((bruteN230) + (bruteN232)); // Math.233
  float bruteN234 = ((bruteN225) * (bruteN225)); // Math.223
  float bruteN235 = ((-0.19854198396205902) * (bruteN234)); // Math.234
  float bruteN236 = ((bruteN233) + (bruteN235)); // Math.235
  float bruteN237 = max(bruteN236, 0.0); // Math.236
  float bruteN238 = min(bruteN237, 1.0); // Math.237
  float bruteN239 = ((0.5320436954498291) * (1.0)); // Math.238
  float bruteN240 = ((0.0) + (bruteN239)); // Math.239
  float bruteN241 = ((-0.02865825593471527) * (bruteN221)); // Math.240
  float bruteN242 = ((bruteN240) + (bruteN241)); // Math.241
  float bruteN243 = ((0.0020294589921832085) * (bruteN225)); // Math.242
  float bruteN244 = ((bruteN242) + (bruteN243)); // Math.243
  float bruteN245 = ((-0.15694691240787506) * (bruteN228)); // Math.244
  float bruteN246 = ((bruteN244) + (bruteN245)); // Math.245
  float bruteN247 = ((0.01916354149580002) * (bruteN231)); // Math.246
  float bruteN248 = ((bruteN246) + (bruteN247)); // Math.247
  float bruteN249 = ((-0.16973765194416046) * (bruteN234)); // Math.248
  float bruteN250 = ((bruteN248) + (bruteN249)); // Math.249
  float bruteN251 = max(bruteN250, 0.0); // Math.250
  float bruteN252 = min(bruteN251, 1.0); // Math.251
  float bruteN253 = ((0.4021143317222595) * (1.0)); // Math.252
  float bruteN254 = ((0.0) + (bruteN253)); // Math.253
  float bruteN255 = ((-0.019180575385689735) * (bruteN221)); // Math.254
  float bruteN256 = ((bruteN254) + (bruteN255)); // Math.255
  float bruteN257 = ((0.008461441844701767) * (bruteN225)); // Math.256
  float bruteN258 = ((bruteN256) + (bruteN257)); // Math.257
  float bruteN259 = ((-0.10599908977746964) * (bruteN228)); // Math.258
  float bruteN260 = ((bruteN258) + (bruteN259)); // Math.259
  float bruteN261 = ((0.01812678389251232) * (bruteN231)); // Math.260
  float bruteN262 = ((bruteN260) + (bruteN261)); // Math.261
  float bruteN263 = ((-0.11490751802921295) * (bruteN234)); // Math.262
  float bruteN264 = ((bruteN262) + (bruteN263)); // Math.263
  float bruteN265 = max(bruteN264, 0.0); // Math.264
  float bruteN266 = min(bruteN265, 1.0); // Math.265
  vec3 bruteN267 = vec3(bruteN238, bruteN252, bruteN266); // Combine XYZ.001
  float bruteN268 = (((bruteRest).x) > (0.0) ? 1.0 : 0.0); // Math.266
  vec3 bruteN269 = mix(bruteN217, bruteN267, clamp(bruteN268, 0.0, 1.0)); // Mix (Legacy).001
  return BruteBlinkData(vec2(bruteN117, bruteN167), bruteN269);
}

vec3 bruteApplyBaseColor(vec3 textureBaseColor, BruteBlinkData blinkData) {
  vec3 bruteN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 bruteN1 = mix(bruteN0, vec3(0.02500000037252903, 0.017999999225139618, 0.008999999612569809), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return bruteN1;
}

float bruteApplyRoughness(float textureRoughness, BruteBlinkData blinkData) {
  float bruteN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float bruteN1 = ((textureRoughness) * (bruteN0)); // Math.268
  float bruteN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float bruteN3 = ((bruteN1) + (bruteN2)); // Math.270
  return bruteN3;
}

float bruteNormalStrength(BruteBlinkData blinkData) {
  float bruteN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return bruteN0;
}
`;

export function sampleBruteBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Brute blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Brute clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installBruteMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Brute instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Brute_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Brute rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Brute requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Brute requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Brute_Blink_Surface material missing');
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
      shader.uniforms.bruteBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 bruteRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbruteRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 bruteRestPosition; uniform float bruteBlink;\n' + bruteBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        BruteBlinkData bruteBlinkData = bruteEvaluateBlink(bruteRestPosition, bruteBlink);
        diffuseColor.rgb = bruteApplyBaseColor(diffuseColor.rgb, bruteBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = bruteApplyRoughness(roughnessFactor, bruteBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float bruteStrength = bruteNormalStrength(bruteBlinkData);
          vec3 bruteMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          bruteMapN.xy *= normalScale * bruteStrength;
          bruteMapN.z = mix(1.0, bruteMapN.z, clamp(bruteStrength, 0.0, 1.0));
          normal = normalize(tbn * bruteMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'brute-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Brute material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleBruteBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Brute blink update');
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
