// Ogre_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const ogreBlinkGLSL = `// Generated only from Ogre_Blink_Surface. Input coordinates stay in Blender rest space.
struct OgreBlinkData { vec2 masks; vec3 lidColor; };

OgreBlinkData ogreEvaluateBlink(vec3 ogreRest, float ogreBlink) {
  float ogreN0 = (((ogreRest).x) - (-0.047364164143800735)); // Math
  float ogreN1 = ((0.029394665732979774) == 0.0 ? 0.0 : (ogreN0) / (0.029394665732979774)); // Math.001
  float ogreN2 = ((ogreN1) * (ogreN1)); // Math.004
  float ogreN3 = (((ogreRest).z) - (0.6948168873786926)); // Math.002
  float ogreN4 = ((0.019999999552965164) == 0.0 ? 0.0 : (ogreN3) / (0.019999999552965164)); // Math.003
  float ogreN5 = ((ogreN4) * (ogreN4)); // Math.005
  float ogreN6 = ((ogreN2) + (ogreN5)); // Math.006
  float ogreN7 = sqrt(max(ogreN6, 0.0)); // Math.007
  float ogreN8 = ((ogreN7) - (0.9599999785423279)); // Math.008
  float ogreN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (ogreN8) / (0.05999999865889549)); // Math.009
  float ogreN10 = max(ogreN9, 0.0); // Math.010
  float ogreN11 = min(ogreN10, 1.0); // Math.011
  float ogreN12 = ((ogreN11) * (ogreN11)); // Math.012
  float ogreN13 = ((2.0) * (ogreN11)); // Math.013
  float ogreN14 = ((3.0) - (ogreN13)); // Math.014
  float ogreN15 = ((ogreN12) * (ogreN14)); // Math.015
  float ogreN16 = ((1.0) - (ogreN15)); // Math.016
  float ogreN17 = (((ogreRest).y) < (0.33000001311302185) ? 1.0 : 0.0); // Math.017
  float ogreN18 = (((ogreRest).y) > (-0.019999999552965164) ? 1.0 : 0.0); // Math.018
  float ogreN19 = ((ogreN17) * (ogreN18)); // Math.019
  float ogreN20 = ((ogreN16) * (ogreN19)); // Math.020
  float ogreN21 = ((0.023000000044703484) * (ogreBlink)); // Math.025
  float ogreN22 = ((0.019999999552965164) - (ogreN21)); // Math.026
  float ogreN23 = ((ogreN1) * (ogreN1)); // Math.021
  float ogreN24 = ((1.0) - (ogreN23)); // Math.022
  float ogreN25 = max(ogreN24, 0.0); // Math.023
  float ogreN26 = sqrt(max(ogreN25, 0.0)); // Math.024
  float ogreN27 = ((ogreN22) * (ogreN26)); // Math.027
  float ogreN28 = ((0.6948168873786926) + (ogreN27)); // Math.028
  float ogreN29 = (((ogreRest).z) - (ogreN28)); // Math.033
  float ogreN30 = ((ogreN29) - (-0.0007999999797903001)); // Math.034
  float ogreN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (ogreN30) / (0.0015999999595806003)); // Math.035
  float ogreN32 = max(ogreN31, 0.0); // Math.036
  float ogreN33 = min(ogreN32, 1.0); // Math.037
  float ogreN34 = ((ogreN33) * (ogreN33)); // Math.038
  float ogreN35 = ((2.0) * (ogreN33)); // Math.039
  float ogreN36 = ((3.0) - (ogreN35)); // Math.040
  float ogreN37 = ((ogreN34) * (ogreN36)); // Math.041
  float ogreN38 = ((0.017000000923871994) * (ogreBlink)); // Math.029
  float ogreN39 = ((-0.019999999552965164) + (ogreN38)); // Math.030
  float ogreN40 = ((ogreN39) * (ogreN26)); // Math.031
  float ogreN41 = ((0.6948168873786926) + (ogreN40)); // Math.032
  float ogreN42 = (((ogreRest).z) - (ogreN41)); // Math.042
  float ogreN43 = ((ogreN42) - (-0.0007999999797903001)); // Math.043
  float ogreN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (ogreN43) / (0.0015999999595806003)); // Math.044
  float ogreN45 = max(ogreN44, 0.0); // Math.045
  float ogreN46 = min(ogreN45, 1.0); // Math.046
  float ogreN47 = ((ogreN46) * (ogreN46)); // Math.047
  float ogreN48 = ((2.0) * (ogreN46)); // Math.048
  float ogreN49 = ((3.0) - (ogreN48)); // Math.049
  float ogreN50 = ((ogreN47) * (ogreN49)); // Math.050
  float ogreN51 = ((1.0) - (ogreN50)); // Math.051
  float ogreN52 = ((ogreN37) + (ogreN51)); // Math.052
  float ogreN53 = min(ogreN52, 1.0); // Math.053
  float ogreN54 = ((ogreBlink) * (20.0)); // Math.054
  float ogreN55 = min(ogreN54, 1.0); // Math.055
  float ogreN56 = ((ogreN53) * (ogreN55)); // Math.056
  float ogreN57 = ((ogreN20) * (ogreN56)); // Math.057
  float ogreN58 = ((0.0) + (ogreN57)); // Math.058
  float ogreN59 = (((ogreRest).x) - (0.12383236736059189)); // Math.084
  float ogreN60 = ((0.0326196551322937) == 0.0 ? 0.0 : (ogreN59) / (0.0326196551322937)); // Math.085
  float ogreN61 = ((ogreN60) * (ogreN60)); // Math.088
  float ogreN62 = (((ogreRest).z) - (0.6948168873786926)); // Math.086
  float ogreN63 = ((0.019999999552965164) == 0.0 ? 0.0 : (ogreN62) / (0.019999999552965164)); // Math.087
  float ogreN64 = ((ogreN63) * (ogreN63)); // Math.089
  float ogreN65 = ((ogreN61) + (ogreN64)); // Math.090
  float ogreN66 = sqrt(max(ogreN65, 0.0)); // Math.091
  float ogreN67 = ((ogreN66) - (0.9599999785423279)); // Math.092
  float ogreN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (ogreN67) / (0.05999999865889549)); // Math.093
  float ogreN69 = max(ogreN68, 0.0); // Math.094
  float ogreN70 = min(ogreN69, 1.0); // Math.095
  float ogreN71 = ((ogreN70) * (ogreN70)); // Math.096
  float ogreN72 = ((2.0) * (ogreN70)); // Math.097
  float ogreN73 = ((3.0) - (ogreN72)); // Math.098
  float ogreN74 = ((ogreN71) * (ogreN73)); // Math.099
  float ogreN75 = ((1.0) - (ogreN74)); // Math.100
  float ogreN76 = (((ogreRest).y) < (0.33000001311302185) ? 1.0 : 0.0); // Math.101
  float ogreN77 = (((ogreRest).y) > (-0.019999999552965164) ? 1.0 : 0.0); // Math.102
  float ogreN78 = ((ogreN76) * (ogreN77)); // Math.103
  float ogreN79 = ((ogreN75) * (ogreN78)); // Math.104
  float ogreN80 = ((0.023000000044703484) * (ogreBlink)); // Math.109
  float ogreN81 = ((0.019999999552965164) - (ogreN80)); // Math.110
  float ogreN82 = ((ogreN60) * (ogreN60)); // Math.105
  float ogreN83 = ((1.0) - (ogreN82)); // Math.106
  float ogreN84 = max(ogreN83, 0.0); // Math.107
  float ogreN85 = sqrt(max(ogreN84, 0.0)); // Math.108
  float ogreN86 = ((ogreN81) * (ogreN85)); // Math.111
  float ogreN87 = ((0.6948168873786926) + (ogreN86)); // Math.112
  float ogreN88 = (((ogreRest).z) - (ogreN87)); // Math.117
  float ogreN89 = ((ogreN88) - (-0.0007999999797903001)); // Math.118
  float ogreN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (ogreN89) / (0.0015999999595806003)); // Math.119
  float ogreN91 = max(ogreN90, 0.0); // Math.120
  float ogreN92 = min(ogreN91, 1.0); // Math.121
  float ogreN93 = ((ogreN92) * (ogreN92)); // Math.122
  float ogreN94 = ((2.0) * (ogreN92)); // Math.123
  float ogreN95 = ((3.0) - (ogreN94)); // Math.124
  float ogreN96 = ((ogreN93) * (ogreN95)); // Math.125
  float ogreN97 = ((0.017000000923871994) * (ogreBlink)); // Math.113
  float ogreN98 = ((-0.019999999552965164) + (ogreN97)); // Math.114
  float ogreN99 = ((ogreN98) * (ogreN85)); // Math.115
  float ogreN100 = ((0.6948168873786926) + (ogreN99)); // Math.116
  float ogreN101 = (((ogreRest).z) - (ogreN100)); // Math.126
  float ogreN102 = ((ogreN101) - (-0.0007999999797903001)); // Math.127
  float ogreN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (ogreN102) / (0.0015999999595806003)); // Math.128
  float ogreN104 = max(ogreN103, 0.0); // Math.129
  float ogreN105 = min(ogreN104, 1.0); // Math.130
  float ogreN106 = ((ogreN105) * (ogreN105)); // Math.131
  float ogreN107 = ((2.0) * (ogreN105)); // Math.132
  float ogreN108 = ((3.0) - (ogreN107)); // Math.133
  float ogreN109 = ((ogreN106) * (ogreN108)); // Math.134
  float ogreN110 = ((1.0) - (ogreN109)); // Math.135
  float ogreN111 = ((ogreN96) + (ogreN110)); // Math.136
  float ogreN112 = min(ogreN111, 1.0); // Math.137
  float ogreN113 = ((ogreBlink) * (20.0)); // Math.138
  float ogreN114 = min(ogreN113, 1.0); // Math.139
  float ogreN115 = ((ogreN112) * (ogreN114)); // Math.140
  float ogreN116 = ((ogreN79) * (ogreN115)); // Math.141
  float ogreN117 = ((ogreN58) + (ogreN116)); // Math.142
  float ogreN118 = (((ogreRest).z) - (ogreN28)); // Math.059
  float ogreN119 = abs(ogreN118); // Math.060
  float ogreN120 = ((ogreN119) - (0.001500000013038516)); // Math.061
  float ogreN121 = ((0.001500000013038516) == 0.0 ? 0.0 : (ogreN120) / (0.001500000013038516)); // Math.062
  float ogreN122 = max(ogreN121, 0.0); // Math.063
  float ogreN123 = min(ogreN122, 1.0); // Math.064
  float ogreN124 = ((ogreN123) * (ogreN123)); // Math.065
  float ogreN125 = ((2.0) * (ogreN123)); // Math.066
  float ogreN126 = ((3.0) - (ogreN125)); // Math.067
  float ogreN127 = ((ogreN124) * (ogreN126)); // Math.068
  float ogreN128 = ((1.0) - (ogreN127)); // Math.069
  float ogreN129 = abs(ogreN1); // Math.070
  float ogreN130 = ((ogreN129) - (0.8999999761581421)); // Math.071
  float ogreN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (ogreN130) / (0.10000000149011612)); // Math.072
  float ogreN132 = max(ogreN131, 0.0); // Math.073
  float ogreN133 = min(ogreN132, 1.0); // Math.074
  float ogreN134 = ((ogreN133) * (ogreN133)); // Math.075
  float ogreN135 = ((2.0) * (ogreN133)); // Math.076
  float ogreN136 = ((3.0) - (ogreN135)); // Math.077
  float ogreN137 = ((ogreN134) * (ogreN136)); // Math.078
  float ogreN138 = ((1.0) - (ogreN137)); // Math.079
  float ogreN139 = ((ogreN128) * (ogreN138)); // Math.080
  float ogreN140 = ((ogreN139) * (ogreN55)); // Math.081
  float ogreN141 = ((ogreN20) * (ogreN140)); // Math.082
  float ogreN142 = ((0.0) + (ogreN141)); // Math.083
  float ogreN143 = (((ogreRest).z) - (ogreN87)); // Math.143
  float ogreN144 = abs(ogreN143); // Math.144
  float ogreN145 = ((ogreN144) - (0.001500000013038516)); // Math.145
  float ogreN146 = ((0.001500000013038516) == 0.0 ? 0.0 : (ogreN145) / (0.001500000013038516)); // Math.146
  float ogreN147 = max(ogreN146, 0.0); // Math.147
  float ogreN148 = min(ogreN147, 1.0); // Math.148
  float ogreN149 = ((ogreN148) * (ogreN148)); // Math.149
  float ogreN150 = ((2.0) * (ogreN148)); // Math.150
  float ogreN151 = ((3.0) - (ogreN150)); // Math.151
  float ogreN152 = ((ogreN149) * (ogreN151)); // Math.152
  float ogreN153 = ((1.0) - (ogreN152)); // Math.153
  float ogreN154 = abs(ogreN60); // Math.154
  float ogreN155 = ((ogreN154) - (0.8999999761581421)); // Math.155
  float ogreN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (ogreN155) / (0.10000000149011612)); // Math.156
  float ogreN157 = max(ogreN156, 0.0); // Math.157
  float ogreN158 = min(ogreN157, 1.0); // Math.158
  float ogreN159 = ((ogreN158) * (ogreN158)); // Math.159
  float ogreN160 = ((2.0) * (ogreN158)); // Math.160
  float ogreN161 = ((3.0) - (ogreN160)); // Math.161
  float ogreN162 = ((ogreN159) * (ogreN161)); // Math.162
  float ogreN163 = ((1.0) - (ogreN162)); // Math.163
  float ogreN164 = ((ogreN153) * (ogreN163)); // Math.164
  float ogreN165 = ((ogreN164) * (ogreN114)); // Math.165
  float ogreN166 = ((ogreN79) * (ogreN165)); // Math.166
  float ogreN167 = ((ogreN142) + (ogreN166)); // Math.167
  float ogreN168 = ((0.25737953186035156) * (1.0)); // Math.175
  float ogreN169 = ((0.0) + (ogreN168)); // Math.176
  float ogreN170 = (((ogreRest).x) - (-0.047364164143800735)); // Math.168
  float ogreN171 = ((0.029394665732979774) == 0.0 ? 0.0 : (ogreN170) / (0.029394665732979774)); // Math.169
  float ogreN172 = ((-0.06608282774686813) * (ogreN171)); // Math.177
  float ogreN173 = ((ogreN169) + (ogreN172)); // Math.178
  float ogreN174 = (((ogreRest).z) - (0.6948168873786926)); // Math.170
  float ogreN175 = ((0.019999999552965164) == 0.0 ? 0.0 : (ogreN174) / (0.019999999552965164)); // Math.171
  float ogreN176 = ((-0.06756192445755005) * (ogreN175)); // Math.179
  float ogreN177 = ((ogreN173) + (ogreN176)); // Math.180
  float ogreN178 = ((ogreN171) * (ogreN171)); // Math.172
  float ogreN179 = ((0.31811729073524475) * (ogreN178)); // Math.181
  float ogreN180 = ((ogreN177) + (ogreN179)); // Math.182
  float ogreN181 = ((ogreN171) * (ogreN175)); // Math.173
  float ogreN182 = ((0.04072580859065056) * (ogreN181)); // Math.183
  float ogreN183 = ((ogreN180) + (ogreN182)); // Math.184
  float ogreN184 = ((ogreN175) * (ogreN175)); // Math.174
  float ogreN185 = ((0.3312133848667145) * (ogreN184)); // Math.185
  float ogreN186 = ((ogreN183) + (ogreN185)); // Math.186
  float ogreN187 = max(ogreN186, 0.0); // Math.187
  float ogreN188 = min(ogreN187, 1.0); // Math.188
  float ogreN189 = ((0.05305422842502594) * (1.0)); // Math.189
  float ogreN190 = ((0.0) + (ogreN189)); // Math.190
  float ogreN191 = ((-0.02956322394311428) * (ogreN171)); // Math.191
  float ogreN192 = ((ogreN190) + (ogreN191)); // Math.192
  float ogreN193 = ((-0.017663083970546722) * (ogreN175)); // Math.193
  float ogreN194 = ((ogreN192) + (ogreN193)); // Math.194
  float ogreN195 = ((0.1254943460226059) * (ogreN178)); // Math.195
  float ogreN196 = ((ogreN194) + (ogreN195)); // Math.196
  float ogreN197 = ((0.037580423057079315) * (ogreN181)); // Math.197
  float ogreN198 = ((ogreN196) + (ogreN197)); // Math.198
  float ogreN199 = ((0.1303853541612625) * (ogreN184)); // Math.199
  float ogreN200 = ((ogreN198) + (ogreN199)); // Math.200
  float ogreN201 = max(ogreN200, 0.0); // Math.201
  float ogreN202 = min(ogreN201, 1.0); // Math.202
  float ogreN203 = ((0.043377820402383804) * (1.0)); // Math.203
  float ogreN204 = ((0.0) + (ogreN203)); // Math.204
  float ogreN205 = ((-0.011266990564763546) * (ogreN171)); // Math.205
  float ogreN206 = ((ogreN204) + (ogreN205)); // Math.206
  float ogreN207 = ((0.0008561635622754693) * (ogreN175)); // Math.207
  float ogreN208 = ((ogreN206) + (ogreN207)); // Math.208
  float ogreN209 = ((0.04771886393427849) * (ogreN178)); // Math.209
  float ogreN210 = ((ogreN208) + (ogreN209)); // Math.210
  float ogreN211 = ((0.023184530436992645) * (ogreN181)); // Math.211
  float ogreN212 = ((ogreN210) + (ogreN211)); // Math.212
  float ogreN213 = ((0.048266638070344925) * (ogreN184)); // Math.213
  float ogreN214 = ((ogreN212) + (ogreN213)); // Math.214
  float ogreN215 = max(ogreN214, 0.0); // Math.215
  float ogreN216 = min(ogreN215, 1.0); // Math.216
  vec3 ogreN217 = vec3(ogreN188, ogreN202, ogreN216); // Combine XYZ
  float ogreN218 = ((0.19093264639377594) * (1.0)); // Math.224
  float ogreN219 = ((0.0) + (ogreN218)); // Math.225
  float ogreN220 = (((ogreRest).x) - (0.12383236736059189)); // Math.217
  float ogreN221 = ((0.0326196551322937) == 0.0 ? 0.0 : (ogreN220) / (0.0326196551322937)); // Math.218
  float ogreN222 = ((0.04572869837284088) * (ogreN221)); // Math.226
  float ogreN223 = ((ogreN219) + (ogreN222)); // Math.227
  float ogreN224 = (((ogreRest).z) - (0.6948168873786926)); // Math.219
  float ogreN225 = ((0.019999999552965164) == 0.0 ? 0.0 : (ogreN224) / (0.019999999552965164)); // Math.220
  float ogreN226 = ((0.001552379922941327) * (ogreN225)); // Math.228
  float ogreN227 = ((ogreN223) + (ogreN226)); // Math.229
  float ogreN228 = ((ogreN221) * (ogreN221)); // Math.221
  float ogreN229 = ((0.4056514799594879) * (ogreN228)); // Math.230
  float ogreN230 = ((ogreN227) + (ogreN229)); // Math.231
  float ogreN231 = ((ogreN221) * (ogreN225)); // Math.222
  float ogreN232 = ((-0.053186528384685516) * (ogreN231)); // Math.232
  float ogreN233 = ((ogreN230) + (ogreN232)); // Math.233
  float ogreN234 = ((ogreN225) * (ogreN225)); // Math.223
  float ogreN235 = ((0.3487560451030731) * (ogreN234)); // Math.234
  float ogreN236 = ((ogreN233) + (ogreN235)); // Math.235
  float ogreN237 = max(ogreN236, 0.0); // Math.236
  float ogreN238 = min(ogreN237, 1.0); // Math.237
  float ogreN239 = ((0.03437212482094765) * (1.0)); // Math.238
  float ogreN240 = ((0.0) + (ogreN239)); // Math.239
  float ogreN241 = ((0.034596946090459824) * (ogreN221)); // Math.240
  float ogreN242 = ((ogreN240) + (ogreN241)); // Math.241
  float ogreN243 = ((0.019986135885119438) * (ogreN225)); // Math.242
  float ogreN244 = ((ogreN242) + (ogreN243)); // Math.243
  float ogreN245 = ((0.14127880334854126) * (ogreN228)); // Math.244
  float ogreN246 = ((ogreN244) + (ogreN245)); // Math.245
  float ogreN247 = ((-0.04597320407629013) * (ogreN231)); // Math.246
  float ogreN248 = ((ogreN246) + (ogreN247)); // Math.247
  float ogreN249 = ((0.13439778983592987) * (ogreN234)); // Math.248
  float ogreN250 = ((ogreN248) + (ogreN249)); // Math.249
  float ogreN251 = max(ogreN250, 0.0); // Math.250
  float ogreN252 = min(ogreN251, 1.0); // Math.251
  float ogreN253 = ((0.021125178784132004) * (1.0)); // Math.252
  float ogreN254 = ((0.0) + (ogreN253)); // Math.253
  float ogreN255 = ((0.009729075245559216) * (ogreN221)); // Math.254
  float ogreN256 = ((ogreN254) + (ogreN255)); // Math.255
  float ogreN257 = ((0.012958807870745659) * (ogreN225)); // Math.256
  float ogreN258 = ((ogreN256) + (ogreN257)); // Math.257
  float ogreN259 = ((0.0634785145521164) * (ogreN228)); // Math.258
  float ogreN260 = ((ogreN258) + (ogreN259)); // Math.259
  float ogreN261 = ((-0.01982025057077408) * (ogreN231)); // Math.260
  float ogreN262 = ((ogreN260) + (ogreN261)); // Math.261
  float ogreN263 = ((0.06122591719031334) * (ogreN234)); // Math.262
  float ogreN264 = ((ogreN262) + (ogreN263)); // Math.263
  float ogreN265 = max(ogreN264, 0.0); // Math.264
  float ogreN266 = min(ogreN265, 1.0); // Math.265
  vec3 ogreN267 = vec3(ogreN238, ogreN252, ogreN266); // Combine XYZ.001
  float ogreN268 = (((ogreRest).x) > (0.03500000014901161) ? 1.0 : 0.0); // Math.266
  vec3 ogreN269 = mix(ogreN217, ogreN267, clamp(ogreN268, 0.0, 1.0)); // Mix (Legacy).001
  return OgreBlinkData(vec2(ogreN117, ogreN167), ogreN269);
}

vec3 ogreApplyBaseColor(vec3 textureBaseColor, OgreBlinkData blinkData) {
  vec3 ogreN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 ogreN1 = mix(ogreN0, vec3(0.03500000014901161, 0.013000000268220901, 0.006000000052154064), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return ogreN1;
}

float ogreApplyRoughness(float textureRoughness, OgreBlinkData blinkData) {
  float ogreN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float ogreN1 = ((textureRoughness) * (ogreN0)); // Math.268
  float ogreN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float ogreN3 = ((ogreN1) + (ogreN2)); // Math.270
  return ogreN3;
}

float ogreNormalStrength(OgreBlinkData blinkData) {
  float ogreN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return ogreN0;
}
`;

export function sampleOgreBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Ogre blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Ogre clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installOgreMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Ogre instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Ogre_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Ogre rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Ogre requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Ogre requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Ogre_Blink_Surface material missing');
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
      shader.uniforms.ogreBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 ogreRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nogreRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 ogreRestPosition; uniform float ogreBlink;\n' + ogreBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        OgreBlinkData ogreBlinkData = ogreEvaluateBlink(ogreRestPosition, ogreBlink);
        diffuseColor.rgb = ogreApplyBaseColor(diffuseColor.rgb, ogreBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = ogreApplyRoughness(roughnessFactor, ogreBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float ogreStrength = ogreNormalStrength(ogreBlinkData);
          vec3 ogreMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          ogreMapN.xy *= normalScale * ogreStrength;
          ogreMapN.z = mix(1.0, ogreMapN.z, clamp(ogreStrength, 0.0, 1.0));
          normal = normalize(tbn * ogreMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'ogre-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Ogre material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleOgreBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Ogre blink update');
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
