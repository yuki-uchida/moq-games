// Bat_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const batBlinkGLSL = `// Generated only from Bat_Blink_Surface. Input coordinates stay in Blender rest space.
struct BatBlinkData { vec2 masks; vec3 lidColor; };

BatBlinkData batEvaluateBlink(vec3 batRest, float batBlink) {
  float batN0 = (((batRest).x) - (-0.14097900688648224)); // Math
  float batN1 = ((0.062194835394620895) == 0.0 ? 0.0 : (batN0) / (0.062194835394620895)); // Math.001
  float batN2 = ((batN1) * (batN1)); // Math.004
  float batN3 = (((batRest).z) - (-0.21447332203388214)); // Math.002
  float batN4 = ((0.07344255596399307) == 0.0 ? 0.0 : (batN3) / (0.07344255596399307)); // Math.003
  float batN5 = ((batN4) * (batN4)); // Math.005
  float batN6 = ((batN2) + (batN5)); // Math.006
  float batN7 = sqrt(max(batN6, 0.0)); // Math.007
  float batN8 = ((batN7) - (0.9599999785423279)); // Math.008
  float batN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (batN8) / (0.05999999865889549)); // Math.009
  float batN10 = max(batN9, 0.0); // Math.010
  float batN11 = min(batN10, 1.0); // Math.011
  float batN12 = ((batN11) * (batN11)); // Math.012
  float batN13 = ((2.0) * (batN11)); // Math.013
  float batN14 = ((3.0) - (batN13)); // Math.014
  float batN15 = ((batN12) * (batN14)); // Math.015
  float batN16 = ((1.0) - (batN15)); // Math.016
  float batN17 = (((batRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.017
  float batN18 = (((batRest).y) > (-0.5) ? 1.0 : 0.0); // Math.018
  float batN19 = ((batN17) * (batN18)); // Math.019
  float batN20 = ((batN16) * (batN19)); // Math.020
  float batN21 = ((0.09844255447387695) * (batBlink)); // Math.025
  float batN22 = ((0.07344255596399307) - (batN21)); // Math.026
  float batN23 = ((batN1) * (batN1)); // Math.021
  float batN24 = ((1.0) - (batN23)); // Math.022
  float batN25 = max(batN24, 0.0); // Math.023
  float batN26 = sqrt(max(batN25, 0.0)); // Math.024
  float batN27 = ((batN22) * (batN26)); // Math.027
  float batN28 = ((-0.21447332203388214) + (batN27)); // Math.028
  float batN29 = (((batRest).z) - (batN28)); // Math.033
  float batN30 = ((batN29) - (-0.0007999999797903001)); // Math.034
  float batN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (batN30) / (0.0015999999595806003)); // Math.035
  float batN32 = max(batN31, 0.0); // Math.036
  float batN33 = min(batN32, 1.0); // Math.037
  float batN34 = ((batN33) * (batN33)); // Math.038
  float batN35 = ((2.0) * (batN33)); // Math.039
  float batN36 = ((3.0) - (batN35)); // Math.040
  float batN37 = ((batN34) * (batN36)); // Math.041
  float batN38 = ((0.04844255372881889) * (batBlink)); // Math.029
  float batN39 = ((-0.07344255596399307) + (batN38)); // Math.030
  float batN40 = ((batN39) * (batN26)); // Math.031
  float batN41 = ((-0.21447332203388214) + (batN40)); // Math.032
  float batN42 = (((batRest).z) - (batN41)); // Math.042
  float batN43 = ((batN42) - (-0.0007999999797903001)); // Math.043
  float batN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (batN43) / (0.0015999999595806003)); // Math.044
  float batN45 = max(batN44, 0.0); // Math.045
  float batN46 = min(batN45, 1.0); // Math.046
  float batN47 = ((batN46) * (batN46)); // Math.047
  float batN48 = ((2.0) * (batN46)); // Math.048
  float batN49 = ((3.0) - (batN48)); // Math.049
  float batN50 = ((batN47) * (batN49)); // Math.050
  float batN51 = ((1.0) - (batN50)); // Math.051
  float batN52 = ((batN37) + (batN51)); // Math.052
  float batN53 = min(batN52, 1.0); // Math.053
  float batN54 = ((batBlink) * (20.0)); // Math.054
  float batN55 = min(batN54, 1.0); // Math.055
  float batN56 = ((batN53) * (batN55)); // Math.056
  float batN57 = ((batN20) * (batN56)); // Math.057
  float batN58 = ((0.0) + (batN57)); // Math.058
  float batN59 = (((batRest).x) - (0.13999512791633606)); // Math.084
  float batN60 = ((0.0625639408826828) == 0.0 ? 0.0 : (batN59) / (0.0625639408826828)); // Math.085
  float batN61 = ((batN60) * (batN60)); // Math.088
  float batN62 = (((batRest).z) - (-0.21447332203388214)); // Math.086
  float batN63 = ((0.07344255596399307) == 0.0 ? 0.0 : (batN62) / (0.07344255596399307)); // Math.087
  float batN64 = ((batN63) * (batN63)); // Math.089
  float batN65 = ((batN61) + (batN64)); // Math.090
  float batN66 = sqrt(max(batN65, 0.0)); // Math.091
  float batN67 = ((batN66) - (0.9599999785423279)); // Math.092
  float batN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (batN67) / (0.05999999865889549)); // Math.093
  float batN69 = max(batN68, 0.0); // Math.094
  float batN70 = min(batN69, 1.0); // Math.095
  float batN71 = ((batN70) * (batN70)); // Math.096
  float batN72 = ((2.0) * (batN70)); // Math.097
  float batN73 = ((3.0) - (batN72)); // Math.098
  float batN74 = ((batN71) * (batN73)); // Math.099
  float batN75 = ((1.0) - (batN74)); // Math.100
  float batN76 = (((batRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.101
  float batN77 = (((batRest).y) > (-0.5) ? 1.0 : 0.0); // Math.102
  float batN78 = ((batN76) * (batN77)); // Math.103
  float batN79 = ((batN75) * (batN78)); // Math.104
  float batN80 = ((0.09844255447387695) * (batBlink)); // Math.109
  float batN81 = ((0.07344255596399307) - (batN80)); // Math.110
  float batN82 = ((batN60) * (batN60)); // Math.105
  float batN83 = ((1.0) - (batN82)); // Math.106
  float batN84 = max(batN83, 0.0); // Math.107
  float batN85 = sqrt(max(batN84, 0.0)); // Math.108
  float batN86 = ((batN81) * (batN85)); // Math.111
  float batN87 = ((-0.21447332203388214) + (batN86)); // Math.112
  float batN88 = (((batRest).z) - (batN87)); // Math.117
  float batN89 = ((batN88) - (-0.0007999999797903001)); // Math.118
  float batN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (batN89) / (0.0015999999595806003)); // Math.119
  float batN91 = max(batN90, 0.0); // Math.120
  float batN92 = min(batN91, 1.0); // Math.121
  float batN93 = ((batN92) * (batN92)); // Math.122
  float batN94 = ((2.0) * (batN92)); // Math.123
  float batN95 = ((3.0) - (batN94)); // Math.124
  float batN96 = ((batN93) * (batN95)); // Math.125
  float batN97 = ((0.04844255372881889) * (batBlink)); // Math.113
  float batN98 = ((-0.07344255596399307) + (batN97)); // Math.114
  float batN99 = ((batN98) * (batN85)); // Math.115
  float batN100 = ((-0.21447332203388214) + (batN99)); // Math.116
  float batN101 = (((batRest).z) - (batN100)); // Math.126
  float batN102 = ((batN101) - (-0.0007999999797903001)); // Math.127
  float batN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (batN102) / (0.0015999999595806003)); // Math.128
  float batN104 = max(batN103, 0.0); // Math.129
  float batN105 = min(batN104, 1.0); // Math.130
  float batN106 = ((batN105) * (batN105)); // Math.131
  float batN107 = ((2.0) * (batN105)); // Math.132
  float batN108 = ((3.0) - (batN107)); // Math.133
  float batN109 = ((batN106) * (batN108)); // Math.134
  float batN110 = ((1.0) - (batN109)); // Math.135
  float batN111 = ((batN96) + (batN110)); // Math.136
  float batN112 = min(batN111, 1.0); // Math.137
  float batN113 = ((batBlink) * (20.0)); // Math.138
  float batN114 = min(batN113, 1.0); // Math.139
  float batN115 = ((batN112) * (batN114)); // Math.140
  float batN116 = ((batN79) * (batN115)); // Math.141
  float batN117 = ((batN58) + (batN116)); // Math.142
  float batN118 = (((batRest).z) - (batN28)); // Math.059
  float batN119 = abs(batN118); // Math.060
  float batN120 = ((batN119) - (0.0044999998062849045)); // Math.061
  float batN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (batN120) / (0.0044999998062849045)); // Math.062
  float batN122 = max(batN121, 0.0); // Math.063
  float batN123 = min(batN122, 1.0); // Math.064
  float batN124 = ((batN123) * (batN123)); // Math.065
  float batN125 = ((2.0) * (batN123)); // Math.066
  float batN126 = ((3.0) - (batN125)); // Math.067
  float batN127 = ((batN124) * (batN126)); // Math.068
  float batN128 = ((1.0) - (batN127)); // Math.069
  float batN129 = abs(batN1); // Math.070
  float batN130 = ((batN129) - (0.8999999761581421)); // Math.071
  float batN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (batN130) / (0.10000000149011612)); // Math.072
  float batN132 = max(batN131, 0.0); // Math.073
  float batN133 = min(batN132, 1.0); // Math.074
  float batN134 = ((batN133) * (batN133)); // Math.075
  float batN135 = ((2.0) * (batN133)); // Math.076
  float batN136 = ((3.0) - (batN135)); // Math.077
  float batN137 = ((batN134) * (batN136)); // Math.078
  float batN138 = ((1.0) - (batN137)); // Math.079
  float batN139 = ((batN128) * (batN138)); // Math.080
  float batN140 = ((batN139) * (batN55)); // Math.081
  float batN141 = ((batN20) * (batN140)); // Math.082
  float batN142 = ((0.0) + (batN141)); // Math.083
  float batN143 = (((batRest).z) - (batN87)); // Math.143
  float batN144 = abs(batN143); // Math.144
  float batN145 = ((batN144) - (0.0044999998062849045)); // Math.145
  float batN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (batN145) / (0.0044999998062849045)); // Math.146
  float batN147 = max(batN146, 0.0); // Math.147
  float batN148 = min(batN147, 1.0); // Math.148
  float batN149 = ((batN148) * (batN148)); // Math.149
  float batN150 = ((2.0) * (batN148)); // Math.150
  float batN151 = ((3.0) - (batN150)); // Math.151
  float batN152 = ((batN149) * (batN151)); // Math.152
  float batN153 = ((1.0) - (batN152)); // Math.153
  float batN154 = abs(batN60); // Math.154
  float batN155 = ((batN154) - (0.8999999761581421)); // Math.155
  float batN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (batN155) / (0.10000000149011612)); // Math.156
  float batN157 = max(batN156, 0.0); // Math.157
  float batN158 = min(batN157, 1.0); // Math.158
  float batN159 = ((batN158) * (batN158)); // Math.159
  float batN160 = ((2.0) * (batN158)); // Math.160
  float batN161 = ((3.0) - (batN160)); // Math.161
  float batN162 = ((batN159) * (batN161)); // Math.162
  float batN163 = ((1.0) - (batN162)); // Math.163
  float batN164 = ((batN153) * (batN163)); // Math.164
  float batN165 = ((batN164) * (batN114)); // Math.165
  float batN166 = ((batN79) * (batN165)); // Math.166
  float batN167 = ((batN142) + (batN166)); // Math.167
  float batN168 = ((0.18375623226165771) * (1.0)); // Math.175
  float batN169 = ((0.0) + (batN168)); // Math.176
  float batN170 = (((batRest).x) - (-0.14097900688648224)); // Math.168
  float batN171 = ((0.062194835394620895) == 0.0 ? 0.0 : (batN170) / (0.062194835394620895)); // Math.169
  float batN172 = ((0.004736305680125952) * (batN171)); // Math.177
  float batN173 = ((batN169) + (batN172)); // Math.178
  float batN174 = (((batRest).z) - (-0.21447332203388214)); // Math.170
  float batN175 = ((0.07344255596399307) == 0.0 ? 0.0 : (batN174) / (0.07344255596399307)); // Math.171
  float batN176 = ((0.0013464584480971098) * (batN175)); // Math.179
  float batN177 = ((batN173) + (batN176)); // Math.180
  float batN178 = ((batN171) * (batN171)); // Math.172
  float batN179 = ((-0.005048037972301245) * (batN178)); // Math.181
  float batN180 = ((batN177) + (batN179)); // Math.182
  float batN181 = ((batN171) * (batN175)); // Math.173
  float batN182 = ((-0.0004692502843681723) * (batN181)); // Math.183
  float batN183 = ((batN180) + (batN182)); // Math.184
  float batN184 = ((batN175) * (batN175)); // Math.174
  float batN185 = ((-0.003563538659363985) * (batN184)); // Math.185
  float batN186 = ((batN183) + (batN185)); // Math.186
  float batN187 = max(batN186, 0.0); // Math.187
  float batN188 = min(batN187, 1.0); // Math.188
  float batN189 = ((0.055416759103536606) * (1.0)); // Math.189
  float batN190 = ((0.0) + (batN189)); // Math.190
  float batN191 = ((0.002460199175402522) * (batN171)); // Math.191
  float batN192 = ((batN190) + (batN191)); // Math.192
  float batN193 = ((0.000580927764531225) * (batN175)); // Math.193
  float batN194 = ((batN192) + (batN193)); // Math.194
  float batN195 = ((-0.0036536853294819593) * (batN178)); // Math.195
  float batN196 = ((batN194) + (batN195)); // Math.196
  float batN197 = ((-0.0006973114795982838) * (batN181)); // Math.197
  float batN198 = ((batN196) + (batN197)); // Math.198
  float batN199 = ((-0.003285264829173684) * (batN184)); // Math.199
  float batN200 = ((batN198) + (batN199)); // Math.200
  float batN201 = max(batN200, 0.0); // Math.201
  float batN202 = min(batN201, 1.0); // Math.202
  float batN203 = ((0.16455650329589844) * (1.0)); // Math.203
  float batN204 = ((0.0) + (batN203)); // Math.204
  float batN205 = ((0.002821106929332018) * (batN171)); // Math.205
  float batN206 = ((batN204) + (batN205)); // Math.206
  float batN207 = ((-0.0002935334050562233) * (batN175)); // Math.207
  float batN208 = ((batN206) + (batN207)); // Math.208
  float batN209 = ((-0.0051324316300451756) * (batN178)); // Math.209
  float batN210 = ((batN208) + (batN209)); // Math.210
  float batN211 = ((-0.002003525150939822) * (batN181)); // Math.211
  float batN212 = ((batN210) + (batN211)); // Math.212
  float batN213 = ((-0.00378906331025064) * (batN184)); // Math.213
  float batN214 = ((batN212) + (batN213)); // Math.214
  float batN215 = max(batN214, 0.0); // Math.215
  float batN216 = min(batN215, 1.0); // Math.216
  vec3 batN217 = vec3(batN188, batN202, batN216); // Combine XYZ
  float batN218 = ((0.1821899265050888) * (1.0)); // Math.224
  float batN219 = ((0.0) + (batN218)); // Math.225
  float batN220 = (((batRest).x) - (0.13999512791633606)); // Math.217
  float batN221 = ((0.0625639408826828) == 0.0 ? 0.0 : (batN220) / (0.0625639408826828)); // Math.218
  float batN222 = ((-0.002077754121273756) * (batN221)); // Math.226
  float batN223 = ((batN219) + (batN222)); // Math.227
  float batN224 = (((batRest).z) - (-0.21447332203388214)); // Math.219
  float batN225 = ((0.07344255596399307) == 0.0 ? 0.0 : (batN224) / (0.07344255596399307)); // Math.220
  float batN226 = ((0.0014535319060087204) * (batN225)); // Math.228
  float batN227 = ((batN223) + (batN226)); // Math.229
  float batN228 = ((batN221) * (batN221)); // Math.221
  float batN229 = ((-0.0035007738042622805) * (batN228)); // Math.230
  float batN230 = ((batN227) + (batN229)); // Math.231
  float batN231 = ((batN221) * (batN225)); // Math.222
  float batN232 = ((0.002011226722970605) * (batN231)); // Math.232
  float batN233 = ((batN230) + (batN232)); // Math.233
  float batN234 = ((batN225) * (batN225)); // Math.223
  float batN235 = ((-0.0030830902978777885) * (batN234)); // Math.234
  float batN236 = ((batN233) + (batN235)); // Math.235
  float batN237 = max(batN236, 0.0); // Math.236
  float batN238 = min(batN237, 1.0); // Math.237
  float batN239 = ((0.05521717667579651) * (1.0)); // Math.238
  float batN240 = ((0.0) + (batN239)); // Math.239
  float batN241 = ((-0.0018468531779944897) * (batN221)); // Math.240
  float batN242 = ((batN240) + (batN241)); // Math.241
  float batN243 = ((0.0007442414644174278) * (batN225)); // Math.242
  float batN244 = ((batN242) + (batN243)); // Math.243
  float batN245 = ((-0.0030498828273266554) * (batN228)); // Math.244
  float batN246 = ((batN244) + (batN245)); // Math.245
  float batN247 = ((0.0009384100558236241) * (batN231)); // Math.246
  float batN248 = ((batN246) + (batN247)); // Math.247
  float batN249 = ((-0.00338542927056551) * (batN234)); // Math.248
  float batN250 = ((batN248) + (batN249)); // Math.249
  float batN251 = max(batN250, 0.0); // Math.250
  float batN252 = min(batN251, 1.0); // Math.251
  float batN253 = ((0.16365042328834534) * (1.0)); // Math.252
  float batN254 = ((0.0) + (batN253)); // Math.253
  float batN255 = ((-0.001608332502655685) * (batN221)); // Math.254
  float batN256 = ((batN254) + (batN255)); // Math.255
  float batN257 = ((0.00013180264795664698) * (batN225)); // Math.256
  float batN258 = ((batN256) + (batN257)); // Math.257
  float batN259 = ((-0.004416191950440407) * (batN228)); // Math.258
  float batN260 = ((batN258) + (batN259)); // Math.259
  float batN261 = ((0.0016556340269744396) * (batN231)); // Math.260
  float batN262 = ((batN260) + (batN261)); // Math.261
  float batN263 = ((-0.004162351135164499) * (batN234)); // Math.262
  float batN264 = ((batN262) + (batN263)); // Math.263
  float batN265 = max(batN264, 0.0); // Math.264
  float batN266 = min(batN265, 1.0); // Math.265
  vec3 batN267 = vec3(batN238, batN252, batN266); // Combine XYZ.001
  float batN268 = (((batRest).x) > (0.0) ? 1.0 : 0.0); // Math.266
  vec3 batN269 = mix(batN217, batN267, clamp(batN268, 0.0, 1.0)); // Mix (Legacy).001
  return BatBlinkData(vec2(batN117, batN167), batN269);
}

vec3 batApplyBaseColor(vec3 textureBaseColor, BatBlinkData blinkData, vec3 batRest, float batBite) {
  vec3 batN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 batN1 = mix(batN0, vec3(0.02500000037252903, 0.017999999225139618, 0.008999999612569809), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  float batN2 = ((batBite) * (20.0)); // Math.283
  float batN3 = min(batN2, 1.0); // Math.284
  float batN4 = ((0.05000000074505806) * (batBite)); // Math.272
  float batN5 = ((0.03500000014901161) + (batN4)); // Math.273
  float batN6 = ((batN5) == 0.0 ? 0.0 : ((batRest).x) / (batN5)); // Math.274
  float batN7 = ((batN6) * (batN6)); // Math.279
  float batN8 = (((batRest).z) + (0.3240000009536743)); // Math.275
  float batN9 = ((0.03799999877810478) * (batBite)); // Math.276
  float batN10 = ((0.00800000037997961) + (batN9)); // Math.277
  float batN11 = ((batN10) == 0.0 ? 0.0 : (batN8) / (batN10)); // Math.278
  float batN12 = ((batN11) * (batN11)); // Math.280
  float batN13 = ((batN7) + (batN12)); // Math.281
  float batN14 = sqrt(max(batN13, 0.0)); // Math.282
  float batN15 = ((1.0) - (batN14)); // Math.285
  float batN16 = ((batN15) * (15.0)); // Math.286
  float batN17 = max(batN16, 0.0); // Math.287
  float batN18 = min(batN17, 1.0); // Math.288
  float batN19 = ((batN3) * (batN18)); // Math.289
  float batN20 = (((batRest).y) < (-0.23999999463558197) ? 1.0 : 0.0); // Math.290
  float batN21 = ((batN19) * (batN20)); // Math.291
  float batN22 = min((batN1).r, (batN1).g); // Math.292
  float batN23 = min(batN22, (batN1).b); // Math.293
  float batN24 = ((batN23) > (0.5) ? 1.0 : 0.0); // Math.294
  float batN25 = ((1.0) - (batN24)); // Math.295
  float batN26 = ((batN21) * (batN25)); // Math.296
  vec3 batN27 = mix(batN1, vec3(0.02199999988079071, 0.003000000026077032, 0.014999999664723873), clamp(batN26, 0.0, 1.0)); // Mix (Legacy).003
  return batN27;
}

float batApplyRoughness(float textureRoughness, BatBlinkData blinkData) {
  float batN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float batN1 = ((textureRoughness) * (batN0)); // Math.268
  float batN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float batN3 = ((batN1) + (batN2)); // Math.270
  return batN3;
}

float batNormalStrength(BatBlinkData blinkData) {
  float batN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return batN0;
}
`;

export function sampleBatBlink(clip, seconds) {
  return sampleBatChannel(clip, seconds, 'blinkAmountSamples');
}

export function sampleBatBite(clip, seconds) {
  return sampleBatChannel(clip, seconds, 'biteAmountSamples');
}

function sampleBatChannel(clip, seconds, channel) {
  const samples = clip?.userData?.[channel];
  if (!samples?.length) {
    throw new Error('Bat ' + channel + ' samples missing: copy animation extras into clip.userData, including explicit zeros for inactive channels');
  }
  if (!Number.isFinite(seconds)) throw new Error('Bat clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installBatMaterialAdapter(root) {
  const uniform = { value: 0 };
  const biteUniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Bat instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Bat_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Bat rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Bat requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Bat requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Bat_Blink_Surface material missing');
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
      shader.uniforms.batBlink = uniform;
      shader.uniforms.batBite = biteUniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 batRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbatRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 batRestPosition; uniform float batBlink; uniform float batBite;\n' + batBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        BatBlinkData batBlinkData = batEvaluateBlink(batRestPosition, batBlink);
        diffuseColor.rgb = batApplyBaseColor(diffuseColor.rgb, batBlinkData, batRestPosition, batBite);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = batApplyRoughness(roughnessFactor, batBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float batStrength = batNormalStrength(batBlinkData);
          vec3 batMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          batMapN.xy *= normalScale * batStrength;
          batMapN.z = mix(1.0, batMapN.z, clamp(batStrength, 0.0, 1.0));
          normal = normalize(tbn * batMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'bat-source-blink-bite-v2';
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
      if (disposed) throw new Error('Bat material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      const blink = sampleBatBlink(clip, clipLocalSeconds);
      const bite = sampleBatBite(clip, clipLocalSeconds);
      uniform.value = blink;
      biteUniform.value = bite;
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Bat blink update');
      uniform.value = value;
    },
    setBiteAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Bat bite update');
      biteUniform.value = value;
    },
    dispose() {
      if (disposed) return;
      for (const { mesh, original, adapted } of bindings) if (mesh.material === adapted) mesh.material = original;
      for (const material of clones.values()) material.dispose();
      disposed = true;
    }
  };
}
