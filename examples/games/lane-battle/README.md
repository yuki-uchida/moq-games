# うんこ大惨事 / Lane Battle

Independent local single-player lane strategy example with a poop theme. Lead the poop army from the うんこ塔 (left) to the 便器城, a castle-sized toilet held by a foam garrison (right). Both forts and the whole battlefield stay visible without page or camera scrolling. Summon three unit types, invest in five production levels (腸活), use the defensive burst (大放屁), and advance through three stages. Victory offers next stage or replay; defeat offers retry. Every stage is also selectable from the title/result dialog, with the best clear time saved locally. The battlefield fills the screen; only resources, sound, the clock and the summon tray float over it, and forts show HP bars only.

| Unit           | Role                          | Cost |  HP | Damage | Range |
| -------------- | ----------------------------- | ---: | --: | -----: | ----: |
| カチカチうんこ | Helmet and shield; front line |   35 | 180 |     22 |    32 |
| コロコロうんこ | Lobs pellets from range       |   65 |  85 |     29 |   160 |
| ゲリラうんこ   | Fast, heavy charger           |   95 | 240 |     35 |    38 |

| Stage        | Enemy fort | Starting 💩 | Income at Lv.1 | Kill reward | Enemy focus                                          |
| ------------ | ---------: | ----------: | -------------: | ----------: | ---------------------------------------------------- |
| 公園のトイレ |       1000 |         100 |           13/s |          10 | Mostly guards, slower waves and weaker enemies       |
| 駅ナカトイレ |       1700 |         100 |           13/s |          14 | Ranged-heavy defense; chargers close the gap         |
| 黄金の便器城 |       2600 |         100 |           13/s |          20 | Early charger pressure; burst and kill income matter |

From the repository root:

```sh
npx vite --config examples/games/lane-battle/vite.config.mjs
# http://127.0.0.1:5193/examples/games/lane-battle/
node --test examples/games/lane-battle/*.test.mjs
node examples/games/lane-battle/browser-check.mjs
LANE_URL=http://127.0.0.1:5193/examples/games/lane-battle/ node examples/games/lane-battle/background-check.mjs
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

Browser checks use installed Chrome headlessly and need the development server. Controls: tap/click cards, 1–3 to summon, U to upgrade, Space to pause (keyboard only; there is no on-screen pause button). 大放屁 damages and pushes back enemies in the left half of the field, with a 24-second cooldown. The ♪ button toggles all sound. An original quiet 16-step Web Audio melody and bass accompany combat. Oscillator envelopes distinguish summon, production upgrade, pellet release, impact, burst and results; no sound files or network service are required. Sound begins after a user gesture. Mute cancels current voices as well as future notes; pause, results and hidden tabs stop the music. Resume continues without a catch-up burst. When audio is unavailable, play continues silently. Buttons also give quiet synthesized hover/tap/select/confirm cues (`examples/games/shared/UiSound.ts`), a press scale, and a short pop on a successful summon, upgrade or burst; they follow the same mute. The first `AudioContext` is warmed while idle so the first tap does not wait for the audio device.

## Visuals

Everything is drawn in code; the game loads no image or model files. `models.js` builds each character from three.js geometry: a revolved swirl body with eyes and mouth, plus a role accessory (helmet and shield, headband and pellet, scarf with a circling fly). The poop army is brown and smiling; the foam garrison is white-blue with angry brows and a soap bubble instead of the fly. A single offscreen WebGL renderer draws them with an orthographic camera in the lane's 1000×450 space; the 2D canvas composites that image above the restroom backdrop, toilet-paper road and shadows, and below HP bars, pellets and splashes. Walking hops with simulated walk distance; the attack lunge peaks on the simulation hit frame, recovers, then winds up into the next hit (`animation.js`). Units face along the lane, turned toward the viewer. Removed units squash flat while fading over 420ms. Summon cards render one standing pose of each character. Released pellets still travel 120ms and resolve damage on arrival; damage, range, attack period and stage values are unchanged from the original lane rules.

The root landing page links to this example, and `npm run build` includes its entry. The dedicated Vite configuration outputs to `dist-lane-battle`; root typecheck targets the tower game, while this example uses JavaScript and simulation/browser checks. Dense armies can overlap. All three stages use the same full-width lane; there is no multiplayer or mid-battle save. Only best stage times persist (`lane-battle-records`), and storage failure does not prevent play.

## Verification

`node --test examples/games/lane-battle/*.test.mjs` covers the simulation (atomic summon costs/cooldowns, production investment, unattended defeat, three-stage victories, 300 repeated input attempts), audio lifecycle, attack-lunge timing and projectile timing/lifecycle. `browser-check.mjs`, `failure-check.mjs` and `campaign-check.mjs` cover desktop 1280×800, portrait 390×844 and landscape 844×390 for no overflow, summon, pause, natural defeat/retry, all-stage victories through real buttons, records and the mute gate. `audio-browser-check.mjs` verifies no pre-gesture oscillators, continuing BGM, cancellation on pause, resume, mute and unmute in real Chrome. `projectile-browser-check.mjs` uses a deterministic real-renderer fixture to confirm that pellet arrival, death and the impact sound share a frame and that pending pellets freeze during pause. `animation-check.mjs` and `audio-capture-check.mjs` write local-only recordings under `/tmp` for manual review; `LANE_URL`, `LANE_EVIDENCE_DIR`, `LANE_AUDIO_DIR` and `FFMPEG_BIN` override their defaults.

## Background progression

An active battle continues through a shared monotonic clock, using a 250ms background timer when the browser permits it. On return, missed time is simulated in steps of at most 50ms, preserving combat rules, the 999 resource limit and terminal results. Each callback processes at most 30 seconds of simulation and schedules another batch until it catches up or the battle ends; battle inputs are blocked while reconciliation is pending. Explicit pause and results never accrue simulation debt, and starting/replaying a stage resets the clock. Hidden and reconciled combat produces no catch-up sounds.

Browsers and operating systems can throttle, freeze or discard background pages. Immediate background execution is therefore best effort; discarded pages cannot restore an unsaved battle. Long foreground stalls are reconciled in the same bounded batches. Separate tabs keep independent games. The automated background check covers skipped callbacks, explicit pause and eventual result after a long suspension, plus a real Chrome page freeze/resume and a headless tab switch; headless Chrome may keep both tabs visible, so that switch alone does not prove OS background suspension.
