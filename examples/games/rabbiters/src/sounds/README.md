# Rabbiters sound files

ウサギ・イヤ・ラビットの効果音と環境音（BGM）です。[Lumina SFX](https://github.com/LuminaBench/lumina-sfx) 1.1.0（commit `6857ab0cf3a7ba92c51291639f416d26b1d3519f`）のレシピを `scripts/remix.mjs --format wav` でオフライン描画した 44.1 kHz・16-bit・モノラルの WAV で、描画後の加工は `heartbeat.wav` の切り出しだけです。音量は `../sound-bank.ts` の目標ラウドネスで合わせています。

ライセンス: Lumina のサウンドデザインは Lumina Open Game Audio License 1.0（ゲームへの同梱・商用利用可、クレジット不要。効果音パックとしての再配布は不可）。素材録音は下記のとおりすべて CC0-1.0 です。Lumina のランタイムコードは同梱していません。

| ファイル             | Lumina レシピ                                                                 | 素材            | SHA-256（先頭16桁） |
| -------------------- | ----------------------------------------------------------------------------- | --------------- | ------------------- |
| `alarm-crow.wav`     | `crow-scolds-from-a-rooftop`                                                  | CC0 recording   | `4229eace8ba77782`  |
| `alarm-hit.wav`      | `clean-title-reveal-with-soft-hit`                                            | Lumina original | `47c9847483ef3af4`  |
| `bed-forest.wav`     | `autumn-meadow-edge-by-day-loop`                                              | CC0 recording   | `e38526c2827c82f2`  |
| `bed-house.wav`      | `late-night-workshop-window-air-loop`                                         | CC0 recording   | `5c2e07bedd61595a`  |
| `bed-town.wav`       | `rooftop-dusk-air-loop`                                                       | CC0 recording   | `a8ce7e5e090d20f5`  |
| `bed-waterway.wav`   | `eddy-in-a-rocky-culvert-gentle-laps-loop`                                    | CC0 recording   | `edc121e71d1a9ef5`  |
| `bedding.wav`        | `journal-objective-stamped-complete`                                          | CC0 recording   | `7bbc534271f422ce`  |
| `bloom.wav`          | `healing-spell-bloom`                                                         | Lumina original | `fc18eadccb038e52`  |
| `chapter.wav`        | `quest-accepted-chime`                                                        | Lumina original | `09cda667370e49ff`  |
| `chew.wav`           | `horse-chewing-a-carrot`                                                      | CC0 recording   | `df900f57882313da`  |
| `coin.wav`           | `coin-pickup-chime`                                                           | Lumina original | `8e89d1e7a091b357`  |
| `downed.wav`         | `heavy-fall-into-wet-leaves`                                                  | CC0 recording   | `933ae06bbefcb7d5`  |
| `drop.wav`           | `inventory-item-place`                                                        | Lumina original | `c5b5a6220e7a8da9`  |
| `escaped.wav`        | `short-zoom-out-whoosh`                                                       | Lumina original | `e5af7a99e6ce16f7`  |
| `grown.wav`          | `timer-complete-chime`                                                        | Lumina original | `89eb0364adffdd0d`  |
| `heartbeat.wav`      | `low-health-heartbeat-loop, first beat (0.09–0.42 s) with 2 ms / 20 ms fades` | Lumina original | `f531737ea6a80a5d`  |
| `hide.wav`           | `crouch-shift-on-leaf-litter`                                                 | CC0 recording   | `7ecffc70a5c64ad8`  |
| `hurt.wav`           | `flesh-impact`                                                                | CC0 recording   | `e237f0c2d68ca730`  |
| `jump.wav`           | `soft-grass-running-push-off`                                                 | CC0 recording   | `c5946d905fc5ac93`  |
| `kit-lost.wav`       | `owl-departs-a-low-branch`                                                    | CC0 recording   | `abd44318d5bf90c6`  |
| `land-heavy.wav`     | `soft-grass-drop-landing-and-recovery`                                        | CC0 recording   | `9adccb94ca151c66`  |
| `land.wav`           | `soft-grass-short-hop-landing`                                                | CC0 recording   | `d25673148f683e44`  |
| `lost.wav`           | `quest-completed-chime (--pitchShift=-8 --speed 0.7)`                         | Lumina original | `98ab42b169bf1ffe`  |
| `nest-broken.wav`    | `charred-wood-trestle-first-piece-gives-way`                                  | CC0 recording   | `5dd6bc9f1252a956`  |
| `pickup.wav`         | `inventory-item-lift`                                                         | Lumina original | `3533f4fdd421a0af`  |
| `query.wav`          | `phone-notification-pop`                                                      | Lumina original | `8978b14d5774f2cd`  |
| `reveal.wav`         | `card-reveal-flips-into-focus`                                                | CC0 recording   | `6c70e34af3811c1a`  |
| `rustle.wav`         | `seed-packet-rustle`                                                          | CC0 recording   | `e6af7f890fa4b829`  |
| `sparkle.wav`        | `crystal-pickup-tick`                                                         | Lumina original | `557277620caa8442`  |
| `step.wav`           | `grass-footstep`                                                              | CC0 recording   | `e5c44b00ac09d12f`  |
| `talk.wav`           | `menu-focus-tap`                                                              | Lumina original | `07f92f87f2aff9e9`  |
| `task-done.wav`      | `craft-item-complete`                                                         | Lumina original | `7f39eec3902f7eb1`  |
| `task-tick.wav`      | `slider-detent-tick`                                                          | Lumina original | `9ff56a0efc1d4d82`  |
| `tension-chase.wav`  | `rapid-wind-gusts-loop`                                                       | Lumina original | `9bede203a90fc043`  |
| `tension-search.wav` | `howling-wind-loop`                                                           | CC0 recording   | `4349577d7340c250`  |
| `ui-close.wav`       | `accordion-panel-folds-away`                                                  | CC0 recording   | `757b33ea74d78983`  |
| `ui-hover.wav`       | `settings-focus-felt-tick`                                                    | CC0 recording   | `d874163237fb9e96`  |
| `ui-open.wav`        | `accordion-panel-unfolds`                                                     | CC0 recording   | `5293b5e067cd3184`  |
| `ui-tap.wav`         | `menu-confirm-pluck`                                                          | Lumina original | `7d672ed028072023`  |
| `ui-toggle.wav`      | `settings-toggle-on`                                                          | Lumina original | `1e3eabc6352d14c3`  |
| `unhide.wav`         | `jacket-movement-rustle`                                                      | CC0 recording   | `d6d3bd3e97ac6fbc`  |
| `won.wav`            | `quest-completed-chime`                                                       | Lumina original | `ffc4fdd6d68facb3`  |

## CC0 録音

- “A paper bag filled with tea 1” — fthgurdy, <https://freesound.org/people/fthgurdy/sounds/377634/>（CC0-1.0、2026-11-21 確認）
- “Bird chirps then takes off flapping wings .wav” — Ambient-X, <https://freesound.org/people/Ambient-X/sounds/682534/>（CC0-1.0、2026-11-21 確認）
- “Bonfire CU with hiss.aif” — surrey_film, <https://freesound.org/people/surrey_film/sounds/86342/>（CC0-1.0、2026-11-21 確認）
- “buchklapp” — opriema, <https://freesound.org/people/opriema/sounds/749741/>（CC0-1.0、2026-11-21 確認）
- “Cabbage being chopped 2.wav” — MessyAcousticApocalypse666, <https://freesound.org/people/MessyAcousticApocalypse666/sounds/594781/>（CC0-1.0、2026-11-21 確認）
- “COUNTRYSIDE” — SamuelGremaud, <https://freesound.org/people/SamuelGremaud/sounds/466066/>（CC0-1.0、2026-11-21 確認）
- “cow chewing corn.wav” — soupods, <https://freesound.org/people/soupods/sounds/653727/>（CC0-1.0、2026-11-21 確認）
- “Crow Caw” — Mish7913 (recordist), qubodup (edit), <https://freesound.org/people/qubodup/sounds/813115/>（CC0-1.0、2026-11-21 確認）
- “Crows fly by” — Cinetony, <https://freesound.org/people/Cinetony/sounds/556790/>（CC0-1.0、2026-11-21 確認）
- “Cutting a Carrot” — Erbsland-Music, <https://freesound.org/people/Erbsland-Music/sounds/634119/>（CC0-1.0、2026-11-21 確認）
- “digging into mud.wav” — Stefan21100190, <https://freesound.org/people/Stefan21100190/sounds/593113/>（CC0-1.0、2026-11-21 確認）
- “Feet Landing On Ground” — elynch0901, <https://freesound.org/people/elynch0901/sounds/464489/>（CC0-1.0、2026-11-21 確認）
- “Foley_Clothes_Jacket_Whoosh_Sequence_Stereo.wav” — Nox_Sound, <https://freesound.org/people/Nox_Sound/sounds/495390/>（CC0-1.0、2026-11-21 確認）
- “Footsteps_Mountain_Boots_Grass_Mono.wav” — Nox_Sound, <https://freesound.org/people/Nox_Sound/sounds/556042/>（CC0-1.0、2026-11-21 確認）
- “horse snort.wav” — bruno.auzet, <https://freesound.org/people/bruno.auzet/sounds/538697/>（CC0-1.0、2026-11-21 確認）
- “Light Switch ON / OFF” — FillSoko, <https://freesound.org/people/FillSoko/sounds/257958/>（CC0-1.0、2026-11-21 確認）
- “Normal click” — Breviceps, <https://freesound.org/people/Breviceps/sounds/448086/>（CC0-1.0、2026-11-21 確認）
- “Old SLR film camera film advance lever and shutter button click” — khenshom, <https://freesound.org/people/khenshom/sounds/516486/>（CC0-1.0、2026-11-21 確認）
- “Page Flip” — qubodup, <https://freesound.org/people/qubodup/sounds/442858/>（CC0-1.0、2026-11-21 確認）
- “Plants or Straw hay - dried cereals” — Vrymaa, <https://freesound.org/people/Vrymaa/sounds/734643/>（CC0-1.0、2026-11-21 確認）
- “Rural farmland ambience” — billgrip, <https://freesound.org/people/billgrip/sounds/490850/>（CC0-1.0、2026-11-21 確認）
- “Rustling foliage.WAV” — DDT197, <https://freesound.org/people/DDT197/sounds/445788/>（CC0-1.0、2026-11-21 確認）
- “Rustling Leaves.wav” — FunWithSound, <https://freesound.org/people/FunWithSound/sounds/406099/>（CC0-1.0、2026-11-21 確認）
- “Small brook, stream, water sound” — SamsterBirdies, <https://freesound.org/people/SamsterBirdies/sounds/584269/>（CC0-1.0、2026-11-21 確認）
- “snd_box_smash.wav” — gristi, <https://freesound.org/people/gristi/sounds/562189/>（CC0-1.0、2026-11-21 確認）
- “Tawny owl hooting” — Patrick_Corra, <https://freesound.org/people/Patrick_Corra/sounds/745208/>（CC0-1.0、2026-11-21 確認）
- “Train Station” — Sam-Mortley, <https://freesound.org/people/Sam-Mortley/sounds/774271/>（CC0-1.0、2026-11-21 確認）
- “Walking on Dry Leaves in Puglia” — bassimat, <https://freesound.org/people/bassimat/sounds/861414/>（CC0-1.0、2026-11-21 確認）
- “Water Through Drain (No Reverb).wav” — clif_creates, <https://freesound.org/people/clif_creates/sounds/381419/>（CC0-1.0、2026-11-21 確認）
- “Waterdrop falling on water surface” — damarlo, <https://freesound.org/people/damarlo/sounds/736528/>（CC0-1.0、2026-11-21 確認）
- “Whistling wind at marina” — richwise, <https://freesound.org/people/richwise/sounds/796396/>（CC0-1.0、2026-11-21 確認）
- “Wooden Object Snapping” — CheatinSloth, <https://freesound.org/people/CheatinSloth/sounds/738787/>（CC0-1.0、2026-11-21 確認）
