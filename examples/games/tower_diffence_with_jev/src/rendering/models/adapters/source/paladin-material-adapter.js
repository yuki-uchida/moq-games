// Paladin_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const paladinBlinkGLSL = `// Generated only from Paladin_Blink_Surface. Input coordinates stay in Blender rest space.
struct PaladinBlinkData { vec2 masks; vec3 lidColor; };

PaladinBlinkData paladinEvaluateBlink(vec3 paladinRest, float paladinBlink) {
  float paladinN0 = (((paladinRest).x) - (-0.11662598699331284)); // Math
  float paladinN1 = ((0.1080000028014183) == 0.0 ? 0.0 : (paladinN0) / (0.1080000028014183)); // Math.001
  float paladinN2 = ((paladinN1) * (paladinN1)); // Math.004
  float paladinN3 = (((paladinRest).z) - (0.27027609944343567)); // Math.002
  float paladinN4 = ((0.09000000357627869) == 0.0 ? 0.0 : (paladinN3) / (0.09000000357627869)); // Math.003
  float paladinN5 = ((paladinN4) * (paladinN4)); // Math.005
  float paladinN6 = ((paladinN2) + (paladinN5)); // Math.006
  float paladinN7 = sqrt(max(paladinN6, 0.0)); // Math.007
  float paladinN8 = ((paladinN7) - (0.9599999785423279)); // Math.008
  float paladinN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (paladinN8) / (0.05999999865889549)); // Math.009
  float paladinN10 = max(paladinN9, 0.0); // Math.010
  float paladinN11 = min(paladinN10, 1.0); // Math.011
  float paladinN12 = ((paladinN11) * (paladinN11)); // Math.012
  float paladinN13 = ((2.0) * (paladinN11)); // Math.013
  float paladinN14 = ((3.0) - (paladinN13)); // Math.014
  float paladinN15 = ((paladinN12) * (paladinN14)); // Math.015
  float paladinN16 = ((1.0) - (paladinN15)); // Math.016
  float paladinN17 = (((paladinRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.017
  float paladinN18 = (((paladinRest).y) > (-0.4300000071525574) ? 1.0 : 0.0); // Math.018
  float paladinN19 = ((paladinN17) * (paladinN18)); // Math.019
  float paladinN20 = ((paladinN16) * (paladinN19)); // Math.020
  float paladinN21 = ((0.11500000208616257) * (paladinBlink)); // Math.025
  float paladinN22 = ((0.09000000357627869) - (paladinN21)); // Math.026
  float paladinN23 = ((paladinN1) * (paladinN1)); // Math.021
  float paladinN24 = ((1.0) - (paladinN23)); // Math.022
  float paladinN25 = max(paladinN24, 0.0); // Math.023
  float paladinN26 = sqrt(max(paladinN25, 0.0)); // Math.024
  float paladinN27 = ((paladinN22) * (paladinN26)); // Math.027
  float paladinN28 = ((0.27027609944343567) + (paladinN27)); // Math.028
  float paladinN29 = (((paladinRest).z) - (paladinN28)); // Math.033
  float paladinN30 = ((paladinN29) - (-0.0007999999797903001)); // Math.034
  float paladinN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (paladinN30) / (0.0015999999595806003)); // Math.035
  float paladinN32 = max(paladinN31, 0.0); // Math.036
  float paladinN33 = min(paladinN32, 1.0); // Math.037
  float paladinN34 = ((paladinN33) * (paladinN33)); // Math.038
  float paladinN35 = ((2.0) * (paladinN33)); // Math.039
  float paladinN36 = ((3.0) - (paladinN35)); // Math.040
  float paladinN37 = ((paladinN34) * (paladinN36)); // Math.041
  float paladinN38 = ((0.06499999761581421) * (paladinBlink)); // Math.029
  float paladinN39 = ((-0.09000000357627869) + (paladinN38)); // Math.030
  float paladinN40 = ((paladinN39) * (paladinN26)); // Math.031
  float paladinN41 = ((0.27027609944343567) + (paladinN40)); // Math.032
  float paladinN42 = (((paladinRest).z) - (paladinN41)); // Math.042
  float paladinN43 = ((paladinN42) - (-0.0007999999797903001)); // Math.043
  float paladinN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (paladinN43) / (0.0015999999595806003)); // Math.044
  float paladinN45 = max(paladinN44, 0.0); // Math.045
  float paladinN46 = min(paladinN45, 1.0); // Math.046
  float paladinN47 = ((paladinN46) * (paladinN46)); // Math.047
  float paladinN48 = ((2.0) * (paladinN46)); // Math.048
  float paladinN49 = ((3.0) - (paladinN48)); // Math.049
  float paladinN50 = ((paladinN47) * (paladinN49)); // Math.050
  float paladinN51 = ((1.0) - (paladinN50)); // Math.051
  float paladinN52 = ((paladinN37) + (paladinN51)); // Math.052
  float paladinN53 = min(paladinN52, 1.0); // Math.053
  float paladinN54 = ((paladinBlink) * (20.0)); // Math.054
  float paladinN55 = min(paladinN54, 1.0); // Math.055
  float paladinN56 = ((paladinN53) * (paladinN55)); // Math.056
  float paladinN57 = ((paladinN20) * (paladinN56)); // Math.057
  float paladinN58 = ((0.0) + (paladinN57)); // Math.058
  float paladinN59 = (((paladinRest).x) - (0.2115280032157898)); // Math.084
  float paladinN60 = ((0.10199999809265137) == 0.0 ? 0.0 : (paladinN59) / (0.10199999809265137)); // Math.085
  float paladinN61 = ((paladinN60) * (paladinN60)); // Math.088
  float paladinN62 = (((paladinRest).z) - (0.27027609944343567)); // Math.086
  float paladinN63 = ((0.09000000357627869) == 0.0 ? 0.0 : (paladinN62) / (0.09000000357627869)); // Math.087
  float paladinN64 = ((paladinN63) * (paladinN63)); // Math.089
  float paladinN65 = ((paladinN61) + (paladinN64)); // Math.090
  float paladinN66 = sqrt(max(paladinN65, 0.0)); // Math.091
  float paladinN67 = ((paladinN66) - (0.9599999785423279)); // Math.092
  float paladinN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (paladinN67) / (0.05999999865889549)); // Math.093
  float paladinN69 = max(paladinN68, 0.0); // Math.094
  float paladinN70 = min(paladinN69, 1.0); // Math.095
  float paladinN71 = ((paladinN70) * (paladinN70)); // Math.096
  float paladinN72 = ((2.0) * (paladinN70)); // Math.097
  float paladinN73 = ((3.0) - (paladinN72)); // Math.098
  float paladinN74 = ((paladinN71) * (paladinN73)); // Math.099
  float paladinN75 = ((1.0) - (paladinN74)); // Math.100
  float paladinN76 = (((paladinRest).y) < (-0.14000000059604645) ? 1.0 : 0.0); // Math.101
  float paladinN77 = (((paladinRest).y) > (-0.4300000071525574) ? 1.0 : 0.0); // Math.102
  float paladinN78 = ((paladinN76) * (paladinN77)); // Math.103
  float paladinN79 = ((paladinN75) * (paladinN78)); // Math.104
  float paladinN80 = ((0.11500000208616257) * (paladinBlink)); // Math.109
  float paladinN81 = ((0.09000000357627869) - (paladinN80)); // Math.110
  float paladinN82 = ((paladinN60) * (paladinN60)); // Math.105
  float paladinN83 = ((1.0) - (paladinN82)); // Math.106
  float paladinN84 = max(paladinN83, 0.0); // Math.107
  float paladinN85 = sqrt(max(paladinN84, 0.0)); // Math.108
  float paladinN86 = ((paladinN81) * (paladinN85)); // Math.111
  float paladinN87 = ((0.27027609944343567) + (paladinN86)); // Math.112
  float paladinN88 = (((paladinRest).z) - (paladinN87)); // Math.117
  float paladinN89 = ((paladinN88) - (-0.0007999999797903001)); // Math.118
  float paladinN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (paladinN89) / (0.0015999999595806003)); // Math.119
  float paladinN91 = max(paladinN90, 0.0); // Math.120
  float paladinN92 = min(paladinN91, 1.0); // Math.121
  float paladinN93 = ((paladinN92) * (paladinN92)); // Math.122
  float paladinN94 = ((2.0) * (paladinN92)); // Math.123
  float paladinN95 = ((3.0) - (paladinN94)); // Math.124
  float paladinN96 = ((paladinN93) * (paladinN95)); // Math.125
  float paladinN97 = ((0.06499999761581421) * (paladinBlink)); // Math.113
  float paladinN98 = ((-0.09000000357627869) + (paladinN97)); // Math.114
  float paladinN99 = ((paladinN98) * (paladinN85)); // Math.115
  float paladinN100 = ((0.27027609944343567) + (paladinN99)); // Math.116
  float paladinN101 = (((paladinRest).z) - (paladinN100)); // Math.126
  float paladinN102 = ((paladinN101) - (-0.0007999999797903001)); // Math.127
  float paladinN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (paladinN102) / (0.0015999999595806003)); // Math.128
  float paladinN104 = max(paladinN103, 0.0); // Math.129
  float paladinN105 = min(paladinN104, 1.0); // Math.130
  float paladinN106 = ((paladinN105) * (paladinN105)); // Math.131
  float paladinN107 = ((2.0) * (paladinN105)); // Math.132
  float paladinN108 = ((3.0) - (paladinN107)); // Math.133
  float paladinN109 = ((paladinN106) * (paladinN108)); // Math.134
  float paladinN110 = ((1.0) - (paladinN109)); // Math.135
  float paladinN111 = ((paladinN96) + (paladinN110)); // Math.136
  float paladinN112 = min(paladinN111, 1.0); // Math.137
  float paladinN113 = ((paladinBlink) * (20.0)); // Math.138
  float paladinN114 = min(paladinN113, 1.0); // Math.139
  float paladinN115 = ((paladinN112) * (paladinN114)); // Math.140
  float paladinN116 = ((paladinN79) * (paladinN115)); // Math.141
  float paladinN117 = ((paladinN58) + (paladinN116)); // Math.142
  float paladinN118 = (((paladinRest).z) - (paladinN28)); // Math.059
  float paladinN119 = abs(paladinN118); // Math.060
  float paladinN120 = ((paladinN119) - (0.0044999998062849045)); // Math.061
  float paladinN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (paladinN120) / (0.0044999998062849045)); // Math.062
  float paladinN122 = max(paladinN121, 0.0); // Math.063
  float paladinN123 = min(paladinN122, 1.0); // Math.064
  float paladinN124 = ((paladinN123) * (paladinN123)); // Math.065
  float paladinN125 = ((2.0) * (paladinN123)); // Math.066
  float paladinN126 = ((3.0) - (paladinN125)); // Math.067
  float paladinN127 = ((paladinN124) * (paladinN126)); // Math.068
  float paladinN128 = ((1.0) - (paladinN127)); // Math.069
  float paladinN129 = abs(paladinN1); // Math.070
  float paladinN130 = ((paladinN129) - (0.8999999761581421)); // Math.071
  float paladinN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (paladinN130) / (0.10000000149011612)); // Math.072
  float paladinN132 = max(paladinN131, 0.0); // Math.073
  float paladinN133 = min(paladinN132, 1.0); // Math.074
  float paladinN134 = ((paladinN133) * (paladinN133)); // Math.075
  float paladinN135 = ((2.0) * (paladinN133)); // Math.076
  float paladinN136 = ((3.0) - (paladinN135)); // Math.077
  float paladinN137 = ((paladinN134) * (paladinN136)); // Math.078
  float paladinN138 = ((1.0) - (paladinN137)); // Math.079
  float paladinN139 = ((paladinN128) * (paladinN138)); // Math.080
  float paladinN140 = ((paladinN139) * (paladinN55)); // Math.081
  float paladinN141 = ((paladinN20) * (paladinN140)); // Math.082
  float paladinN142 = ((0.0) + (paladinN141)); // Math.083
  float paladinN143 = (((paladinRest).z) - (paladinN87)); // Math.143
  float paladinN144 = abs(paladinN143); // Math.144
  float paladinN145 = ((paladinN144) - (0.0044999998062849045)); // Math.145
  float paladinN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (paladinN145) / (0.0044999998062849045)); // Math.146
  float paladinN147 = max(paladinN146, 0.0); // Math.147
  float paladinN148 = min(paladinN147, 1.0); // Math.148
  float paladinN149 = ((paladinN148) * (paladinN148)); // Math.149
  float paladinN150 = ((2.0) * (paladinN148)); // Math.150
  float paladinN151 = ((3.0) - (paladinN150)); // Math.151
  float paladinN152 = ((paladinN149) * (paladinN151)); // Math.152
  float paladinN153 = ((1.0) - (paladinN152)); // Math.153
  float paladinN154 = abs(paladinN60); // Math.154
  float paladinN155 = ((paladinN154) - (0.8999999761581421)); // Math.155
  float paladinN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (paladinN155) / (0.10000000149011612)); // Math.156
  float paladinN157 = max(paladinN156, 0.0); // Math.157
  float paladinN158 = min(paladinN157, 1.0); // Math.158
  float paladinN159 = ((paladinN158) * (paladinN158)); // Math.159
  float paladinN160 = ((2.0) * (paladinN158)); // Math.160
  float paladinN161 = ((3.0) - (paladinN160)); // Math.161
  float paladinN162 = ((paladinN159) * (paladinN161)); // Math.162
  float paladinN163 = ((1.0) - (paladinN162)); // Math.163
  float paladinN164 = ((paladinN153) * (paladinN163)); // Math.164
  float paladinN165 = ((paladinN164) * (paladinN114)); // Math.165
  float paladinN166 = ((paladinN79) * (paladinN165)); // Math.166
  float paladinN167 = ((paladinN142) + (paladinN166)); // Math.167
  float paladinN168 = ((0.9740073084831238) * (1.0)); // Math.175
  float paladinN169 = ((0.0) + (paladinN168)); // Math.176
  float paladinN170 = (((paladinRest).x) - (-0.11662598699331284)); // Math.168
  float paladinN171 = ((0.1080000028014183) == 0.0 ? 0.0 : (paladinN170) / (0.1080000028014183)); // Math.169
  float paladinN172 = ((0.03203493356704712) * (paladinN171)); // Math.177
  float paladinN173 = ((paladinN169) + (paladinN172)); // Math.178
  float paladinN174 = (((paladinRest).z) - (0.27027609944343567)); // Math.170
  float paladinN175 = ((0.09000000357627869) == 0.0 ? 0.0 : (paladinN174) / (0.09000000357627869)); // Math.171
  float paladinN176 = ((-0.01742609776556492) * (paladinN175)); // Math.179
  float paladinN177 = ((paladinN173) + (paladinN176)); // Math.180
  float paladinN178 = ((paladinN171) * (paladinN171)); // Math.172
  float paladinN179 = ((-0.02739025093615055) * (paladinN178)); // Math.181
  float paladinN180 = ((paladinN177) + (paladinN179)); // Math.182
  float paladinN181 = ((paladinN171) * (paladinN175)); // Math.173
  float paladinN182 = ((0.006838737986981869) * (paladinN181)); // Math.183
  float paladinN183 = ((paladinN180) + (paladinN182)); // Math.184
  float paladinN184 = ((paladinN175) * (paladinN175)); // Math.174
  float paladinN185 = ((-0.030668038874864578) * (paladinN184)); // Math.185
  float paladinN186 = ((paladinN183) + (paladinN185)); // Math.186
  float paladinN187 = max(paladinN186, 0.0); // Math.187
  float paladinN188 = min(paladinN187, 1.0); // Math.188
  float paladinN189 = ((0.6520773768424988) * (1.0)); // Math.189
  float paladinN190 = ((0.0) + (paladinN189)); // Math.190
  float paladinN191 = ((0.06755619496107101) * (paladinN171)); // Math.191
  float paladinN192 = ((paladinN190) + (paladinN191)); // Math.192
  float paladinN193 = ((0.0104609290137887) * (paladinN175)); // Math.193
  float paladinN194 = ((paladinN192) + (paladinN193)); // Math.194
  float paladinN195 = ((-0.022259043529629707) * (paladinN178)); // Math.195
  float paladinN196 = ((paladinN194) + (paladinN195)); // Math.196
  float paladinN197 = ((0.005685111042112112) * (paladinN181)); // Math.197
  float paladinN198 = ((paladinN196) + (paladinN197)); // Math.198
  float paladinN199 = ((-0.04772317036986351) * (paladinN184)); // Math.199
  float paladinN200 = ((paladinN198) + (paladinN199)); // Math.200
  float paladinN201 = max(paladinN200, 0.0); // Math.201
  float paladinN202 = min(paladinN201, 1.0); // Math.202
  float paladinN203 = ((0.5292554497718811) * (1.0)); // Math.203
  float paladinN204 = ((0.0) + (paladinN203)); // Math.204
  float paladinN205 = ((0.12294922769069672) * (paladinN171)); // Math.205
  float paladinN206 = ((paladinN204) + (paladinN205)); // Math.206
  float paladinN207 = ((-0.002346745925024152) * (paladinN175)); // Math.207
  float paladinN208 = ((paladinN206) + (paladinN207)); // Math.208
  float paladinN209 = ((-0.09050532430410385) * (paladinN178)); // Math.209
  float paladinN210 = ((paladinN208) + (paladinN209)); // Math.210
  float paladinN211 = ((-0.01105378195643425) * (paladinN181)); // Math.211
  float paladinN212 = ((paladinN210) + (paladinN211)); // Math.212
  float paladinN213 = ((-0.061844825744628906) * (paladinN184)); // Math.213
  float paladinN214 = ((paladinN212) + (paladinN213)); // Math.214
  float paladinN215 = max(paladinN214, 0.0); // Math.215
  float paladinN216 = min(paladinN215, 1.0); // Math.216
  vec3 paladinN217 = vec3(paladinN188, paladinN202, paladinN216); // Combine XYZ
  float paladinN218 = ((0.956664502620697) * (1.0)); // Math.224
  float paladinN219 = ((0.0) + (paladinN218)); // Math.225
  float paladinN220 = (((paladinRest).x) - (0.2115280032157898)); // Math.217
  float paladinN221 = ((0.10199999809265137) == 0.0 ? 0.0 : (paladinN220) / (0.10199999809265137)); // Math.218
  float paladinN222 = ((-0.02736569568514824) * (paladinN221)); // Math.226
  float paladinN223 = ((paladinN219) + (paladinN222)); // Math.227
  float paladinN224 = (((paladinRest).z) - (0.27027609944343567)); // Math.219
  float paladinN225 = ((0.09000000357627869) == 0.0 ? 0.0 : (paladinN224) / (0.09000000357627869)); // Math.220
  float paladinN226 = ((-0.015097251161932945) * (paladinN225)); // Math.228
  float paladinN227 = ((paladinN223) + (paladinN226)); // Math.229
  float paladinN228 = ((paladinN221) * (paladinN221)); // Math.221
  float paladinN229 = ((-0.02064359560608864) * (paladinN228)); // Math.230
  float paladinN230 = ((paladinN227) + (paladinN229)); // Math.231
  float paladinN231 = ((paladinN221) * (paladinN225)); // Math.222
  float paladinN232 = ((-0.0014359239721670747) * (paladinN231)); // Math.232
  float paladinN233 = ((paladinN230) + (paladinN232)); // Math.233
  float paladinN234 = ((paladinN225) * (paladinN225)); // Math.223
  float paladinN235 = ((-0.01597602665424347) * (paladinN234)); // Math.234
  float paladinN236 = ((paladinN233) + (paladinN235)); // Math.235
  float paladinN237 = max(paladinN236, 0.0); // Math.236
  float paladinN238 = min(paladinN237, 1.0); // Math.237
  float paladinN239 = ((0.6242376565933228) * (1.0)); // Math.238
  float paladinN240 = ((0.0) + (paladinN239)); // Math.239
  float paladinN241 = ((-0.06298702210187912) * (paladinN221)); // Math.240
  float paladinN242 = ((paladinN240) + (paladinN241)); // Math.241
  float paladinN243 = ((0.013640709221363068) * (paladinN225)); // Math.242
  float paladinN244 = ((paladinN242) + (paladinN243)); // Math.243
  float paladinN245 = ((-0.011438865214586258) * (paladinN228)); // Math.244
  float paladinN246 = ((paladinN244) + (paladinN245)); // Math.245
  float paladinN247 = ((-0.003812521928921342) * (paladinN231)); // Math.246
  float paladinN248 = ((paladinN246) + (paladinN247)); // Math.247
  float paladinN249 = ((-0.020979328081011772) * (paladinN234)); // Math.248
  float paladinN250 = ((paladinN248) + (paladinN249)); // Math.249
  float paladinN251 = max(paladinN250, 0.0); // Math.250
  float paladinN252 = min(paladinN251, 1.0); // Math.251
  float paladinN253 = ((0.497824490070343) * (1.0)); // Math.252
  float paladinN254 = ((0.0) + (paladinN253)); // Math.253
  float paladinN255 = ((-0.1225932389497757) * (paladinN221)); // Math.254
  float paladinN256 = ((paladinN254) + (paladinN255)); // Math.255
  float paladinN257 = ((3.8098573895695154e-06) * (paladinN225)); // Math.256
  float paladinN258 = ((paladinN256) + (paladinN257)); // Math.257
  float paladinN259 = ((-0.07758515328168869) * (paladinN228)); // Math.258
  float paladinN260 = ((paladinN258) + (paladinN259)); // Math.259
  float paladinN261 = ((0.0049618687480688095) * (paladinN231)); // Math.260
  float paladinN262 = ((paladinN260) + (paladinN261)); // Math.261
  float paladinN263 = ((-0.03392782062292099) * (paladinN234)); // Math.262
  float paladinN264 = ((paladinN262) + (paladinN263)); // Math.263
  float paladinN265 = max(paladinN264, 0.0); // Math.264
  float paladinN266 = min(paladinN265, 1.0); // Math.265
  vec3 paladinN267 = vec3(paladinN238, paladinN252, paladinN266); // Combine XYZ.001
  float paladinN268 = (((paladinRest).x) > (0.03999999910593033) ? 1.0 : 0.0); // Math.266
  vec3 paladinN269 = mix(paladinN217, paladinN267, clamp(paladinN268, 0.0, 1.0)); // Mix (Legacy).001
  return PaladinBlinkData(vec2(paladinN117, paladinN167), paladinN269);
}

vec3 paladinApplyBaseColor(vec3 textureBaseColor, PaladinBlinkData blinkData) {
  vec3 paladinN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 paladinN1 = mix(paladinN0, vec3(0.03799999877810478, 0.004000000189989805, 0.002400000113993883), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return paladinN1;
}

float paladinApplyRoughness(float textureRoughness, PaladinBlinkData blinkData) {
  float paladinN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float paladinN1 = ((textureRoughness) * (paladinN0)); // Math.268
  float paladinN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float paladinN3 = ((paladinN1) + (paladinN2)); // Math.270
  return paladinN3;
}

float paladinNormalStrength(PaladinBlinkData blinkData) {
  float paladinN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return paladinN0;
}
`;

export function samplePaladinBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Paladin blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Paladin clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installPaladinMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Paladin instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Paladin_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Paladin rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Paladin requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Paladin requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Paladin_Blink_Surface material missing');
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
      shader.uniforms.paladinBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 paladinRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npaladinRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 paladinRestPosition; uniform float paladinBlink;\n' + paladinBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        PaladinBlinkData paladinBlinkData = paladinEvaluateBlink(paladinRestPosition, paladinBlink);
        diffuseColor.rgb = paladinApplyBaseColor(diffuseColor.rgb, paladinBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = paladinApplyRoughness(roughnessFactor, paladinBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float paladinStrength = paladinNormalStrength(paladinBlinkData);
          vec3 paladinMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          paladinMapN.xy *= normalScale * paladinStrength;
          paladinMapN.z = mix(1.0, paladinMapN.z, clamp(paladinStrength, 0.0, 1.0));
          normal = normalize(tbn * paladinMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'paladin-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Paladin material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = samplePaladinBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Paladin blink update');
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
