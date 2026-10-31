# 芽吹きの境界 / Lane Battle

Independent local single-player lane strategy example. Both forts and the whole battlefield stay visible without page or camera scrolling. Summon three existing unit types, invest in five production levels, use the defensive burst, and advance through three stages. Victory offers next stage or replay; defeat offers retry. Every stage is also selectable from the title/help/result dialog, with the best clear time saved locally.

| Stage      | Enemy fort | Starting ✦ | Income at Lv.1 | Kill reward | Enemy focus                                          |
| ---------- | ---------: | ---------: | -------------: | ----------: | ---------------------------------------------------- |
| 芽吹きの道 |       1000 |        100 |           13/s |          10 | Mostly guards, slower waves and weaker enemies       |
| 弓影の峠   |       1700 |        100 |           13/s |          14 | Archer-heavy defense; wolves close the gap           |
| 黄昏の奔流 |       2600 |        100 |           13/s |          20 | Early wolf pressure; defensive burst and kill income |

From the repository root:

```sh
npx vite --config examples/games/lane-battle/vite.config.mjs
# http://127.0.0.1:5193/examples/games/lane-battle/
node --test examples/games/lane-battle/*.test.mjs
node examples/games/lane-battle/browser-check.mjs
node examples/games/lane-battle/campaign-check.mjs
node examples/games/lane-battle/failure-check.mjs
node examples/games/lane-battle/playthrough.mjs
node examples/games/lane-battle/audio-browser-check.mjs
node examples/games/lane-battle/projectile-browser-check.mjs
node examples/games/lane-battle/audio-capture-check.mjs
# Requires ffmpeg on PATH; writes local-only recordings under /tmp:
node examples/games/lane-battle/animation-check.mjs
npx prettier --check examples/games/lane-battle
npx vite build --config examples/games/lane-battle/vite.config.mjs
```

Browser checks use installed Chrome headlessly and need the development server. Controls: tap/click cards, 1–3 to summon, U to upgrade, Space to pause. Burst damages and pushes back enemies in the left half of the field, with a 24-second cooldown. The ♪ button toggles all sound. An original quiet 16-step Web Audio melody and bass accompany combat. Oscillator envelopes distinguish summon, production upgrade, arrow release, impact, burst and results; no sound files or network service are required. Sound begins after a user gesture. Mute cancels current voices as well as future notes; pause, help/results and hidden tabs stop the music. Resume continues without a catch-up burst. When audio is unavailable, play continues silently.

## Existing asset reuse

References `public/tower-defense-art/{soldier,archer,wolf}` without copying or changing original bytes. Identities are `leaf-squire`, `forest-archer`, `dusk-wolf`. For each, east/west `idle`, `walk`, and `attack` JSON atlases supply the texture URL, frame rectangles and fps. Main-field units render the original walk/attack frames, and summon cards render idle frames. Frames retain the complete body and equipment. Rendering uses each frame’s authored pivot (64,94) as its ground anchor, aligned with the shadow; transparent cell margins no longer lift feet above the road. The wolf’s authored leap is retained. Attack poses begin at the original contact/release frame on the existing simulation event, recover quickly, then prepare the next strike with an accelerating release. The bow’s prior full-draw emitter anchors a 120ms arrow flight followed by a small impact spark and sound. Ranged damage now resolves at that same arrival update, including death and fort results. Damage, range, attack period and stage difficulty values are unchanged. Released arrows survive shooter death, track their original recipient, and miss without extra rewards if that recipient is already dead. Removed units fade and fall back over 420ms. Canvas aspect compensation preserves proportions across orientations. No new unit, 3D conversion, external IP art, debug-service request, paid API or publication is included. Original provenance remains in the existing asset directories.

The root landing page links to this example, and `npm run build` includes its entry. The dedicated Vite configuration outputs to `dist-lane-battle`; root typecheck targets the tower game, while this example uses JavaScript and simulation/browser checks. Dense armies can overlap. All three stages use the same full-width lane; there is no multiplayer or mid-battle save. Only best stage times persist, and storage failure does not prevent play.

## Verification

Root typecheck, lint, 560 tower tests, and build pass in the isolated working copy. Fourteen lane tests include the six simulation tests plus audio lifecycle, attack-contact timing, per-frame original alpha-foot grounding and four projectile timing/lifecycle checks. The six simulation tests cover atomic summon costs/cooldowns, production investment, unattended defeat, three-stage victories and 300 repeated input attempts. Desktop 1280×800, portrait 390×844 and landscape 844×390 are checked for no overflow, summon, pause, help and browser errors. `campaign-check.mjs` plays all stages through real buttons, verifies next-stage navigation, records and the mute gate by observing oscillator creation. `audio-browser-check.mjs` additionally verifies no pre-gesture oscillators, continuing BGM, cancellation on pause, resume, mute and unmute in real Chrome. Audio event generation and envelopes are checked; subjective listening is not claimed.

Visual review corrected nonuniform sprite scaling and enlarged card imagery. Original walk directions, ranged stance, melee contact, full-body frames and wolf arrival were inspected across five combat captures at 18/21/24/27/30 seconds in the initial scenario. Existing sheets remain unchanged. Follow-up checks also cover natural defeat/retry, insufficient funds and cooldown spam, exact frozen income/timer/field image during pause, resume, and restored summon controls after help.

Animation follow-up browser victories on the unchanged baseline balance (stage 1 / 2 / 3): PC 58 / 92 / 67 seconds; portrait 58 / 92 / 83; landscape 58 / 91 / 66. All three viewports passed next-stage, final return, records, mute and error checks. Natural unattended defeat occurred at 59 seconds, followed by clean replay and a successful summon.

The animation follow-up recorded five 4-second, 10fps actual rendered playbacks with a fixed simulation clock: PC 18–22s and 24–28s, portrait 24–28s, landscape 28–32s, and PC 38–42s. All three unit types are summoned in sequence. The WebM videos were actually played in Chrome and checked for grounded feet, readable contact/recovery, original whole-body continuity, bow-to-target arrow motion and short death exits. A 24–28s original-code playback uses the same clock and inputs for comparison. Recordings remain local and are not added to public assets. `animation-check.mjs` reproduces the candidate captures; `LANE_URL`, `LANE_EVIDENCE_DIR` and `FFMPEG_BIN` can override its defaults. The recordings are silent; they do not establish subjective sound quality.

The synchronization follow-up re-recorded and played all five combat clips. A separate deterministic, real-renderer fixture captures 60fps arrow flight and verifies death/arrival/impact-sound timestamps on PC and both mobile orientations: release 0.016s, death and impact sound both 0.144s (the first frame after 120ms). Pending arrows freeze during pause and resolve after resume. `projectile-browser-check.mjs` reproduces these fixtures without changing runtime stage settings.

`audio-capture-check.mjs` records the actual Chrome Web Audio graph sent to the speakers into local WebM/WAV files, without microphone or OS loopback. A zero-valued capture-only source keeps the recorder clock advancing during silence. Recorded BGM RMS/peak: 0.00427/0.02176; effect mix: 0.00669/0.06080; muted: 0/0. All clips have zero samples at or beyond full scale. This verifies generated audio and headroom, not physical speaker output or subjective listening. `LANE_AUDIO_DIR` and `FFMPEG_BIN` override recording defaults.
