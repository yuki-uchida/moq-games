// Shaman_Blink_Surface only. Derived assets; no gameplay-clock or authoring edits.
// Requires Three.js MeshStandard/Physical shader chunks using vNormalMapUv and tbn.
// Custom glTF _BLINKRESTPOSITION arrives as _blinkrestposition through GLTFLoader.
export const shamanBlinkGLSL = `// Generated only from Shaman_Blink_Surface. Input coordinates stay in Blender rest space.
struct ShamanBlinkData { vec2 masks; vec3 lidColor; };

ShamanBlinkData shamanEvaluateBlink(vec3 shamanRest, float shamanBlink) {
  float shamanN0 = (((shamanRest).x) - (-0.2770102620124817)); // Math
  float shamanN1 = ((0.0803515762090683) == 0.0 ? 0.0 : (shamanN0) / (0.0803515762090683)); // Math.001
  float shamanN2 = ((shamanN1) * (shamanN1)); // Math.004
  float shamanN3 = (((shamanRest).z) - (0.08759529888629913)); // Math.002
  float shamanN4 = ((0.09338021278381348) == 0.0 ? 0.0 : (shamanN3) / (0.09338021278381348)); // Math.003
  float shamanN5 = ((shamanN4) * (shamanN4)); // Math.005
  float shamanN6 = ((shamanN2) + (shamanN5)); // Math.006
  float shamanN7 = sqrt(max(shamanN6, 0.0)); // Math.007
  float shamanN8 = ((shamanN7) - (0.9599999785423279)); // Math.008
  float shamanN9 = ((0.05999999865889549) == 0.0 ? 0.0 : (shamanN8) / (0.05999999865889549)); // Math.009
  float shamanN10 = max(shamanN9, 0.0); // Math.010
  float shamanN11 = min(shamanN10, 1.0); // Math.011
  float shamanN12 = ((shamanN11) * (shamanN11)); // Math.012
  float shamanN13 = ((2.0) * (shamanN11)); // Math.013
  float shamanN14 = ((3.0) - (shamanN13)); // Math.014
  float shamanN15 = ((shamanN12) * (shamanN14)); // Math.015
  float shamanN16 = ((1.0) - (shamanN15)); // Math.016
  float shamanN17 = (((shamanRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.017
  float shamanN18 = (((shamanRest).y) > (-0.5) ? 1.0 : 0.0); // Math.018
  float shamanN19 = ((shamanN17) * (shamanN18)); // Math.019
  float shamanN20 = ((shamanN16) * (shamanN19)); // Math.020
  float shamanN21 = ((0.11838021874427795) * (shamanBlink)); // Math.025
  float shamanN22 = ((0.09338021278381348) - (shamanN21)); // Math.026
  float shamanN23 = ((shamanN1) * (shamanN1)); // Math.021
  float shamanN24 = ((1.0) - (shamanN23)); // Math.022
  float shamanN25 = max(shamanN24, 0.0); // Math.023
  float shamanN26 = sqrt(max(shamanN25, 0.0)); // Math.024
  float shamanN27 = ((shamanN22) * (shamanN26)); // Math.027
  float shamanN28 = ((0.08759529888629913) + (shamanN27)); // Math.028
  float shamanN29 = (((shamanRest).z) - (shamanN28)); // Math.033
  float shamanN30 = ((shamanN29) - (-0.0007999999797903001)); // Math.034
  float shamanN31 = ((0.0015999999595806003) == 0.0 ? 0.0 : (shamanN30) / (0.0015999999595806003)); // Math.035
  float shamanN32 = max(shamanN31, 0.0); // Math.036
  float shamanN33 = min(shamanN32, 1.0); // Math.037
  float shamanN34 = ((shamanN33) * (shamanN33)); // Math.038
  float shamanN35 = ((2.0) * (shamanN33)); // Math.039
  float shamanN36 = ((3.0) - (shamanN35)); // Math.040
  float shamanN37 = ((shamanN34) * (shamanN36)); // Math.041
  float shamanN38 = ((0.0683802142739296) * (shamanBlink)); // Math.029
  float shamanN39 = ((-0.09338021278381348) + (shamanN38)); // Math.030
  float shamanN40 = ((shamanN39) * (shamanN26)); // Math.031
  float shamanN41 = ((0.08759529888629913) + (shamanN40)); // Math.032
  float shamanN42 = (((shamanRest).z) - (shamanN41)); // Math.042
  float shamanN43 = ((shamanN42) - (-0.0007999999797903001)); // Math.043
  float shamanN44 = ((0.0015999999595806003) == 0.0 ? 0.0 : (shamanN43) / (0.0015999999595806003)); // Math.044
  float shamanN45 = max(shamanN44, 0.0); // Math.045
  float shamanN46 = min(shamanN45, 1.0); // Math.046
  float shamanN47 = ((shamanN46) * (shamanN46)); // Math.047
  float shamanN48 = ((2.0) * (shamanN46)); // Math.048
  float shamanN49 = ((3.0) - (shamanN48)); // Math.049
  float shamanN50 = ((shamanN47) * (shamanN49)); // Math.050
  float shamanN51 = ((1.0) - (shamanN50)); // Math.051
  float shamanN52 = ((shamanN37) + (shamanN51)); // Math.052
  float shamanN53 = min(shamanN52, 1.0); // Math.053
  float shamanN54 = ((shamanBlink) * (20.0)); // Math.054
  float shamanN55 = min(shamanN54, 1.0); // Math.055
  float shamanN56 = ((shamanN53) * (shamanN55)); // Math.056
  float shamanN57 = ((shamanN20) * (shamanN56)); // Math.057
  float shamanN58 = ((0.0) + (shamanN57)); // Math.058
  float shamanN59 = (((shamanRest).x) - (0.07318923622369766)); // Math.084
  float shamanN60 = ((0.08324970304965973) == 0.0 ? 0.0 : (shamanN59) / (0.08324970304965973)); // Math.085
  float shamanN61 = ((shamanN60) * (shamanN60)); // Math.088
  float shamanN62 = (((shamanRest).z) - (0.08759529888629913)); // Math.086
  float shamanN63 = ((0.09338021278381348) == 0.0 ? 0.0 : (shamanN62) / (0.09338021278381348)); // Math.087
  float shamanN64 = ((shamanN63) * (shamanN63)); // Math.089
  float shamanN65 = ((shamanN61) + (shamanN64)); // Math.090
  float shamanN66 = sqrt(max(shamanN65, 0.0)); // Math.091
  float shamanN67 = ((shamanN66) - (0.9599999785423279)); // Math.092
  float shamanN68 = ((0.05999999865889549) == 0.0 ? 0.0 : (shamanN67) / (0.05999999865889549)); // Math.093
  float shamanN69 = max(shamanN68, 0.0); // Math.094
  float shamanN70 = min(shamanN69, 1.0); // Math.095
  float shamanN71 = ((shamanN70) * (shamanN70)); // Math.096
  float shamanN72 = ((2.0) * (shamanN70)); // Math.097
  float shamanN73 = ((3.0) - (shamanN72)); // Math.098
  float shamanN74 = ((shamanN71) * (shamanN73)); // Math.099
  float shamanN75 = ((1.0) - (shamanN74)); // Math.100
  float shamanN76 = (((shamanRest).y) < (-0.20000000298023224) ? 1.0 : 0.0); // Math.101
  float shamanN77 = (((shamanRest).y) > (-0.5) ? 1.0 : 0.0); // Math.102
  float shamanN78 = ((shamanN76) * (shamanN77)); // Math.103
  float shamanN79 = ((shamanN75) * (shamanN78)); // Math.104
  float shamanN80 = ((0.11838021874427795) * (shamanBlink)); // Math.109
  float shamanN81 = ((0.09338021278381348) - (shamanN80)); // Math.110
  float shamanN82 = ((shamanN60) * (shamanN60)); // Math.105
  float shamanN83 = ((1.0) - (shamanN82)); // Math.106
  float shamanN84 = max(shamanN83, 0.0); // Math.107
  float shamanN85 = sqrt(max(shamanN84, 0.0)); // Math.108
  float shamanN86 = ((shamanN81) * (shamanN85)); // Math.111
  float shamanN87 = ((0.08759529888629913) + (shamanN86)); // Math.112
  float shamanN88 = (((shamanRest).z) - (shamanN87)); // Math.117
  float shamanN89 = ((shamanN88) - (-0.0007999999797903001)); // Math.118
  float shamanN90 = ((0.0015999999595806003) == 0.0 ? 0.0 : (shamanN89) / (0.0015999999595806003)); // Math.119
  float shamanN91 = max(shamanN90, 0.0); // Math.120
  float shamanN92 = min(shamanN91, 1.0); // Math.121
  float shamanN93 = ((shamanN92) * (shamanN92)); // Math.122
  float shamanN94 = ((2.0) * (shamanN92)); // Math.123
  float shamanN95 = ((3.0) - (shamanN94)); // Math.124
  float shamanN96 = ((shamanN93) * (shamanN95)); // Math.125
  float shamanN97 = ((0.0683802142739296) * (shamanBlink)); // Math.113
  float shamanN98 = ((-0.09338021278381348) + (shamanN97)); // Math.114
  float shamanN99 = ((shamanN98) * (shamanN85)); // Math.115
  float shamanN100 = ((0.08759529888629913) + (shamanN99)); // Math.116
  float shamanN101 = (((shamanRest).z) - (shamanN100)); // Math.126
  float shamanN102 = ((shamanN101) - (-0.0007999999797903001)); // Math.127
  float shamanN103 = ((0.0015999999595806003) == 0.0 ? 0.0 : (shamanN102) / (0.0015999999595806003)); // Math.128
  float shamanN104 = max(shamanN103, 0.0); // Math.129
  float shamanN105 = min(shamanN104, 1.0); // Math.130
  float shamanN106 = ((shamanN105) * (shamanN105)); // Math.131
  float shamanN107 = ((2.0) * (shamanN105)); // Math.132
  float shamanN108 = ((3.0) - (shamanN107)); // Math.133
  float shamanN109 = ((shamanN106) * (shamanN108)); // Math.134
  float shamanN110 = ((1.0) - (shamanN109)); // Math.135
  float shamanN111 = ((shamanN96) + (shamanN110)); // Math.136
  float shamanN112 = min(shamanN111, 1.0); // Math.137
  float shamanN113 = ((shamanBlink) * (20.0)); // Math.138
  float shamanN114 = min(shamanN113, 1.0); // Math.139
  float shamanN115 = ((shamanN112) * (shamanN114)); // Math.140
  float shamanN116 = ((shamanN79) * (shamanN115)); // Math.141
  float shamanN117 = ((shamanN58) + (shamanN116)); // Math.142
  float shamanN118 = (((shamanRest).z) - (shamanN28)); // Math.059
  float shamanN119 = abs(shamanN118); // Math.060
  float shamanN120 = ((shamanN119) - (0.0044999998062849045)); // Math.061
  float shamanN121 = ((0.0044999998062849045) == 0.0 ? 0.0 : (shamanN120) / (0.0044999998062849045)); // Math.062
  float shamanN122 = max(shamanN121, 0.0); // Math.063
  float shamanN123 = min(shamanN122, 1.0); // Math.064
  float shamanN124 = ((shamanN123) * (shamanN123)); // Math.065
  float shamanN125 = ((2.0) * (shamanN123)); // Math.066
  float shamanN126 = ((3.0) - (shamanN125)); // Math.067
  float shamanN127 = ((shamanN124) * (shamanN126)); // Math.068
  float shamanN128 = ((1.0) - (shamanN127)); // Math.069
  float shamanN129 = abs(shamanN1); // Math.070
  float shamanN130 = ((shamanN129) - (0.8999999761581421)); // Math.071
  float shamanN131 = ((0.10000000149011612) == 0.0 ? 0.0 : (shamanN130) / (0.10000000149011612)); // Math.072
  float shamanN132 = max(shamanN131, 0.0); // Math.073
  float shamanN133 = min(shamanN132, 1.0); // Math.074
  float shamanN134 = ((shamanN133) * (shamanN133)); // Math.075
  float shamanN135 = ((2.0) * (shamanN133)); // Math.076
  float shamanN136 = ((3.0) - (shamanN135)); // Math.077
  float shamanN137 = ((shamanN134) * (shamanN136)); // Math.078
  float shamanN138 = ((1.0) - (shamanN137)); // Math.079
  float shamanN139 = ((shamanN128) * (shamanN138)); // Math.080
  float shamanN140 = ((shamanN139) * (shamanN55)); // Math.081
  float shamanN141 = ((shamanN20) * (shamanN140)); // Math.082
  float shamanN142 = ((0.0) + (shamanN141)); // Math.083
  float shamanN143 = (((shamanRest).z) - (shamanN87)); // Math.143
  float shamanN144 = abs(shamanN143); // Math.144
  float shamanN145 = ((shamanN144) - (0.0044999998062849045)); // Math.145
  float shamanN146 = ((0.0044999998062849045) == 0.0 ? 0.0 : (shamanN145) / (0.0044999998062849045)); // Math.146
  float shamanN147 = max(shamanN146, 0.0); // Math.147
  float shamanN148 = min(shamanN147, 1.0); // Math.148
  float shamanN149 = ((shamanN148) * (shamanN148)); // Math.149
  float shamanN150 = ((2.0) * (shamanN148)); // Math.150
  float shamanN151 = ((3.0) - (shamanN150)); // Math.151
  float shamanN152 = ((shamanN149) * (shamanN151)); // Math.152
  float shamanN153 = ((1.0) - (shamanN152)); // Math.153
  float shamanN154 = abs(shamanN60); // Math.154
  float shamanN155 = ((shamanN154) - (0.8999999761581421)); // Math.155
  float shamanN156 = ((0.10000000149011612) == 0.0 ? 0.0 : (shamanN155) / (0.10000000149011612)); // Math.156
  float shamanN157 = max(shamanN156, 0.0); // Math.157
  float shamanN158 = min(shamanN157, 1.0); // Math.158
  float shamanN159 = ((shamanN158) * (shamanN158)); // Math.159
  float shamanN160 = ((2.0) * (shamanN158)); // Math.160
  float shamanN161 = ((3.0) - (shamanN160)); // Math.161
  float shamanN162 = ((shamanN159) * (shamanN161)); // Math.162
  float shamanN163 = ((1.0) - (shamanN162)); // Math.163
  float shamanN164 = ((shamanN153) * (shamanN163)); // Math.164
  float shamanN165 = ((shamanN164) * (shamanN114)); // Math.165
  float shamanN166 = ((shamanN79) * (shamanN165)); // Math.166
  float shamanN167 = ((shamanN142) + (shamanN166)); // Math.167
  float shamanN168 = ((0.9890544414520264) * (1.0)); // Math.175
  float shamanN169 = ((0.0) + (shamanN168)); // Math.176
  float shamanN170 = (((shamanRest).x) - (-0.2770102620124817)); // Math.168
  float shamanN171 = ((0.0803515762090683) == 0.0 ? 0.0 : (shamanN170) / (0.0803515762090683)); // Math.169
  float shamanN172 = ((0.00688780564814806) * (shamanN171)); // Math.177
  float shamanN173 = ((shamanN169) + (shamanN172)); // Math.178
  float shamanN174 = (((shamanRest).z) - (0.08759529888629913)); // Math.170
  float shamanN175 = ((0.09338021278381348) == 0.0 ? 0.0 : (shamanN174) / (0.09338021278381348)); // Math.171
  float shamanN176 = ((-0.009221898391842842) * (shamanN175)); // Math.179
  float shamanN177 = ((shamanN173) + (shamanN176)); // Math.180
  float shamanN178 = ((shamanN171) * (shamanN171)); // Math.172
  float shamanN179 = ((-0.01131351012736559) * (shamanN178)); // Math.181
  float shamanN180 = ((shamanN177) + (shamanN179)); // Math.182
  float shamanN181 = ((shamanN171) * (shamanN175)); // Math.173
  float shamanN182 = ((0.009426487609744072) * (shamanN181)); // Math.183
  float shamanN183 = ((shamanN180) + (shamanN182)); // Math.184
  float shamanN184 = ((shamanN175) * (shamanN175)); // Math.174
  float shamanN185 = ((-0.014743844047188759) * (shamanN184)); // Math.185
  float shamanN186 = ((shamanN183) + (shamanN185)); // Math.186
  float shamanN187 = max(shamanN186, 0.0); // Math.187
  float shamanN188 = min(shamanN187, 1.0); // Math.188
  float shamanN189 = ((0.8365253806114197) * (1.0)); // Math.189
  float shamanN190 = ((0.0) + (shamanN189)); // Math.190
  float shamanN191 = ((0.0082744425162673) * (shamanN171)); // Math.191
  float shamanN192 = ((shamanN190) + (shamanN191)); // Math.192
  float shamanN193 = ((-0.013901039026677608) * (shamanN175)); // Math.193
  float shamanN194 = ((shamanN192) + (shamanN193)); // Math.194
  float shamanN195 = ((-0.011660479009151459) * (shamanN178)); // Math.195
  float shamanN196 = ((shamanN194) + (shamanN195)); // Math.196
  float shamanN197 = ((0.014345101080834866) * (shamanN181)); // Math.197
  float shamanN198 = ((shamanN196) + (shamanN197)); // Math.198
  float shamanN199 = ((-0.01719766855239868) * (shamanN184)); // Math.199
  float shamanN200 = ((shamanN198) + (shamanN199)); // Math.200
  float shamanN201 = max(shamanN200, 0.0); // Math.201
  float shamanN202 = min(shamanN201, 1.0); // Math.202
  float shamanN203 = ((0.658349871635437) * (1.0)); // Math.203
  float shamanN204 = ((0.0) + (shamanN203)); // Math.204
  float shamanN205 = ((0.008802714757621288) * (shamanN171)); // Math.205
  float shamanN206 = ((shamanN204) + (shamanN205)); // Math.206
  float shamanN207 = ((-0.01743827573955059) * (shamanN175)); // Math.207
  float shamanN208 = ((shamanN206) + (shamanN207)); // Math.208
  float shamanN209 = ((-0.007999029941856861) * (shamanN178)); // Math.209
  float shamanN210 = ((shamanN208) + (shamanN209)); // Math.210
  float shamanN211 = ((0.0157884880900383) * (shamanN181)); // Math.211
  float shamanN212 = ((shamanN210) + (shamanN211)); // Math.212
  float shamanN213 = ((-0.011864714324474335) * (shamanN184)); // Math.213
  float shamanN214 = ((shamanN212) + (shamanN213)); // Math.214
  float shamanN215 = max(shamanN214, 0.0); // Math.215
  float shamanN216 = min(shamanN215, 1.0); // Math.216
  vec3 shamanN217 = vec3(shamanN188, shamanN202, shamanN216); // Combine XYZ
  float shamanN218 = ((0.9712278842926025) * (1.0)); // Math.224
  float shamanN219 = ((0.0) + (shamanN218)); // Math.225
  float shamanN220 = (((shamanRest).x) - (0.07318923622369766)); // Math.217
  float shamanN221 = ((0.08324970304965973) == 0.0 ? 0.0 : (shamanN220) / (0.08324970304965973)); // Math.218
  float shamanN222 = ((-0.003315409878268838) * (shamanN221)); // Math.226
  float shamanN223 = ((shamanN219) + (shamanN222)); // Math.227
  float shamanN224 = (((shamanRest).z) - (0.08759529888629913)); // Math.219
  float shamanN225 = ((0.09338021278381348) == 0.0 ? 0.0 : (shamanN224) / (0.09338021278381348)); // Math.220
  float shamanN226 = ((-0.006279353518038988) * (shamanN225)); // Math.228
  float shamanN227 = ((shamanN223) + (shamanN226)); // Math.229
  float shamanN228 = ((shamanN221) * (shamanN221)); // Math.221
  float shamanN229 = ((0.00017313113494310528) * (shamanN228)); // Math.230
  float shamanN230 = ((shamanN227) + (shamanN229)); // Math.231
  float shamanN231 = ((shamanN221) * (shamanN225)); // Math.222
  float shamanN232 = ((-0.006022346206009388) * (shamanN231)); // Math.232
  float shamanN233 = ((shamanN230) + (shamanN232)); // Math.233
  float shamanN234 = ((shamanN225) * (shamanN225)); // Math.223
  float shamanN235 = ((0.002730507403612137) * (shamanN234)); // Math.234
  float shamanN236 = ((shamanN233) + (shamanN235)); // Math.235
  float shamanN237 = max(shamanN236, 0.0); // Math.236
  float shamanN238 = min(shamanN237, 1.0); // Math.237
  float shamanN239 = ((0.8299298882484436) * (1.0)); // Math.238
  float shamanN240 = ((0.0) + (shamanN239)); // Math.239
  float shamanN241 = ((-0.003331694984808564) * (shamanN221)); // Math.240
  float shamanN242 = ((shamanN240) + (shamanN241)); // Math.241
  float shamanN243 = ((-0.011935260146856308) * (shamanN225)); // Math.242
  float shamanN244 = ((shamanN242) + (shamanN243)); // Math.243
  float shamanN245 = ((-0.006402487866580486) * (shamanN228)); // Math.244
  float shamanN246 = ((shamanN244) + (shamanN245)); // Math.245
  float shamanN247 = ((-0.012893986888229847) * (shamanN231)); // Math.246
  float shamanN248 = ((shamanN246) + (shamanN247)); // Math.247
  float shamanN249 = ((-0.009600612334907055) * (shamanN234)); // Math.248
  float shamanN250 = ((shamanN248) + (shamanN249)); // Math.249
  float shamanN251 = max(shamanN250, 0.0); // Math.250
  float shamanN252 = min(shamanN251, 1.0); // Math.251
  float shamanN253 = ((0.6610807776451111) * (1.0)); // Math.252
  float shamanN254 = ((0.0) + (shamanN253)); // Math.253
  float shamanN255 = ((-0.0038405004888772964) * (shamanN221)); // Math.254
  float shamanN256 = ((shamanN254) + (shamanN255)); // Math.255
  float shamanN257 = ((-0.015210547484457493) * (shamanN225)); // Math.256
  float shamanN258 = ((shamanN256) + (shamanN257)); // Math.257
  float shamanN259 = ((-0.008737483993172646) * (shamanN228)); // Math.258
  float shamanN260 = ((shamanN258) + (shamanN259)); // Math.259
  float shamanN261 = ((-0.014169806614518166) * (shamanN231)); // Math.260
  float shamanN262 = ((shamanN260) + (shamanN261)); // Math.261
  float shamanN263 = ((-0.012215414084494114) * (shamanN234)); // Math.262
  float shamanN264 = ((shamanN262) + (shamanN263)); // Math.263
  float shamanN265 = max(shamanN264, 0.0); // Math.264
  float shamanN266 = min(shamanN265, 1.0); // Math.265
  vec3 shamanN267 = vec3(shamanN238, shamanN252, shamanN266); // Combine XYZ.001
  float shamanN268 = (((shamanRest).x) > (-0.10000000149011612) ? 1.0 : 0.0); // Math.266
  vec3 shamanN269 = mix(shamanN217, shamanN267, clamp(shamanN268, 0.0, 1.0)); // Mix (Legacy).001
  return ShamanBlinkData(vec2(shamanN117, shamanN167), shamanN269);
}

vec3 shamanApplyBaseColor(vec3 textureBaseColor, ShamanBlinkData blinkData) {
  vec3 shamanN0 = mix(textureBaseColor, blinkData.lidColor, clamp(blinkData.masks.x, 0.0, 1.0)); // Mix (Legacy)
  vec3 shamanN1 = mix(shamanN0, vec3(0.02500000037252903, 0.017999999225139618, 0.008999999612569809), clamp(blinkData.masks.y, 0.0, 1.0)); // Mix (Legacy).002
  return shamanN1;
}

float shamanApplyRoughness(float textureRoughness, ShamanBlinkData blinkData) {
  float shamanN0 = ((1.0) - (blinkData.masks.x)); // Math.267
  float shamanN1 = ((textureRoughness) * (shamanN0)); // Math.268
  float shamanN2 = ((0.6800000071525574) * (blinkData.masks.x)); // Math.269
  float shamanN3 = ((shamanN1) + (shamanN2)); // Math.270
  return shamanN3;
}

float shamanNormalStrength(ShamanBlinkData blinkData) {
  float shamanN0 = ((1.0) - (blinkData.masks.x)); // Math.271
  return shamanN0;
}
`;

export function sampleShamanBlink(clip, seconds) {
  const samples = clip?.userData?.blinkAmountSamples;
  if (!samples?.length) {
    throw new Error('Shaman blink samples missing: copy animation extras into clip.userData, including zero samples for attack');
  }
  if (!Number.isFinite(seconds)) throw new Error('Shaman clip-local time must be finite');
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (samples[mid][0] <= seconds) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[Math.min(lo + 1, samples.length - 1)];
  const blend = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
  return a[1] + (b[1] - a[1]) * blend;
}

export function installShamanMaterialAdapter(root) {
  const uniform = { value: 0 };
  const clones = new Map();
  const bindings = [];
  const targets = [];
  // Validate before changing materials. Shared source materials are cloned per root
  // so separately animated Shaman instances never share the blink uniform.
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of originals) {
      if (material?.name !== 'Shaman_Blink_Surface') continue;
      const attr = mesh.geometry?.getAttribute('_blinkrestposition');
      if (!attr || attr.itemSize !== 3) throw new Error('Shaman rest-position vec3 attribute missing');
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) throw new Error('Shaman requires a standard or physical PBR material');
      if (material.normalMap && material.normalMapType !== 0) throw new Error('Shaman requires a tangent-space normal map');
      targets.push([mesh, material]);
    }
  });
  if (!targets.length) throw new Error('Shaman_Blink_Surface material missing');
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
      shader.uniforms.shamanBlink = uniform;
      shader.vertexShader = 'attribute vec3 _blinkrestposition; varying vec3 shamanRestPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nshamanRestPosition = _blinkrestposition;');
      shader.fragmentShader = 'varying vec3 shamanRestPosition; uniform float shamanBlink;\n' + shamanBlinkGLSL + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        ShamanBlinkData shamanBlinkData = shamanEvaluateBlink(shamanRestPosition, shamanBlink);
        diffuseColor.rgb = shamanApplyBaseColor(diffuseColor.rgb, shamanBlinkData);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = shamanApplyRoughness(roughnessFactor, shamanBlinkData);`);
      // Blender's tangent Normal Map strength scales XY AND blends Z toward 1.
      // Keep the original Three chunk for material variants without tangent maps.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float shamanStrength = shamanNormalStrength(shamanBlinkData);
          vec3 shamanMapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          shamanMapN.xy *= normalScale * shamanStrength;
          shamanMapN.z = mix(1.0, shamanMapN.z, clamp(shamanStrength, 0.0, 1.0));
          normal = normalize(tbn * shamanMapN);
        #else
          #include <normal_fragment_maps>
        #endif`);
    };
    material.customProgramCacheKey = () => 'shaman-source-blink-gradient-v1';
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
      if (disposed) throw new Error('Shaman material adapter is disposed');
      // Use the same clip-local seconds as AnimationAction.time after mixer.update.
      // Caller owns looping/crossfades; this adapter never retimes the gameplay clock.
      uniform.value = sampleShamanBlink(clip, clipLocalSeconds);
    },
    setBlinkAmount(value) {
      if (disposed || !Number.isFinite(value)) throw new Error('Invalid Shaman blink update');
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
