# うんこ大惨事 / Lane Battle

Independent local single-player lane strategy campaign with a poop theme: 30 stages, a little under two hours. The poop army defends the うんこ塔 on the right and marches left on the enemy fort, a castle-sized toilet. The enemies are everything that wants poop flushed, cleaned or settled: 清掃員, モップのおばちゃん, 和式便器, 洋式便器 (whose water shot knocks units back), ヨーグルト, 白湯, 整腸剤 and the heavy 下痢止め. The enemy fort fires a ウォシュレット砲 at nearby poops sends a 朝の清掃 wave 12 seconds in (bigger in later restrooms) and a 大掃除 rush each time its HP passes 4/5, 3/5, 2/5 and 1/5. Both forts and the whole battlefield stay visible without scrolling.

The fun is formation (編成), growth (育成) and the world:

- **Formation.** Up to six roster units go into battle; their order is the summon-button order (keys 1–6). Two poops are owned at the start; four more are bought with 🧻 earned from victories once enough stages are cleared. Every first clear adds one random **special unit** — something bad for the stomach: 冷房, ラーメン, 夜ふかし, お酒, 二郎系ラーメン, 焼肉, ニンニク, 激辛カレー, 牛乳, 生ガキ, アイスの食べすぎ, エナジードリンク — with its own trick (slow, splash, knockback, critical hits, rapid fire). Unowned specials come first, then duplicates join as fresh copies.
- **Growth.** Every unit that damaged a fallen enemy earns its EXP; a victory adds a clear bonus to the whole formation, a defeat keeps only kill EXP. Each level rolls HP, 攻 and 速 (attack speed) against growth chances. Poops grow reliably (80/75/40%, never an empty level). Specials join stronger — scaled by how far the campaign has progressed — but grow rarely (22/20/10%), so older specials fall behind and get replaced while poops stay useful.
- **World.** Five restrooms of six stages each: 公園のトイレ, 駅ナカトイレ, 学校のトイレ, 病院のトイレ and 黄金の便器城. Each introduces new enemies; fort HP, enemy strength and spawn rate climb steadily.

In battle: summon cards cost 💩 and recharge, 腸活 (U) raises 💩 income up to Lv.5 for 100/250/450/700 💩, but each level makes enemies spawn 7% faster — rushing it to MAX before defending loses to 朝の清掃, so a modest investment is usually best; 大放屁 hurts and pushes back enemies in the home half every 24 seconds, Space pauses. Progress (cleared stages, 🧻, roster, formation and best times) is saved locally under `unko-daisanji-campaign-v1`; storage failure does not prevent play. 作戦室 between battles shows the result report (EXP, level-ups with their stat gains, the new special), formation and shop; its button leads to the full-screen ステージ選択 map. The map winds through the five restrooms and shows only reached stages, each with its boss (the newest enemy, the strongest with a crown on each restroom's last stage) standing on a numbered pedestal, plus the next stage as a silhouette. Tap a stage to select it, then ブリッと出撃; 編成・購入 returns to the 作戦室.

Play length is checked with `bot.js`, a reference player with two modes. The **human-paced** mode taps once per second on a random ready card, invests in 腸活 only to Lv.2 and uses 大放屁 late; each battle adds 45 seconds in the 作戦室 (`MENU_SECONDS`). Playing the campaign in order and retrying on defeat (grinding EXP), it clears all 30 stages in a little under two hours: 97–114 minutes over six seeds, mean ≈105. The **greedy** mode (every 50ms, everything affordable) averages ≈95 minutes. Summon recharge is the listed `cooldown` × `COOLDOWN_SCALE` (1.8), so cards cannot be spammed. Wins last about one and a half to two and a half minutes: the march (`WALK_PACE`), fort HP and four 大掃除 rushes set the length of each siege. The tables live in `simulation.js` (units, enemies, stage curves) and `campaign.js` (EXP, growth, rewards).

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

Browser checks use installed Chrome headlessly and need the development server. Controls: tap/click cards, 1–6 to summon, U to upgrade, Space to pause (keyboard only; there is no on-screen pause button). The ♪ button toggles all sound. An original quiet 16-step Web Audio melody and bass accompany combat. Oscillator envelopes distinguish summon, production upgrade, pellet release, impact, burst and results; no sound files or network service are required. Sound begins after a user gesture. Mute cancels current voices as well as future notes; pause, results and hidden tabs stop the music. Resume continues without a catch-up burst. When audio is unavailable, play continues silently. Buttons also give quiet synthesized hover/tap/select/confirm cues (`examples/games/shared/UiSound.ts`), a press scale, and a short pop on a successful summon, upgrade or burst; they follow the same mute. The first `AudioContext` is warmed while idle so the first tap does not wait for the audio device.

## Visuals

Everything is drawn in code; the game loads no image or model files. `models.js` builds all 26 characters from three.js primitives with eyes and mouths: six poops (revolved swirl bodies with helmets, headbands, scarves, crowns), twelve specials (an air conditioner, ramen bowls, a sleepy smartphone, a sake bottle, a grill, garlic, curry, a milk carton, an oyster, ice cream, an energy drink) and eight angry enemies (cleaners, toilets, a yogurt cup, a teacup, a capsule, a medicine bottle). Menu portraits use the same models. A single offscreen WebGL renderer draws them with an orthographic camera in the lane's 1000×450 space; the 2D canvas composites that image above the restroom backdrop, toilet-paper road and shadows, and below HP bars, pellets and splashes. Walking hops with simulated walk distance; the attack lunge peaks on the simulation hit frame, recovers, then winds up into the next hit (`animation.js`). Units face along the lane (poops left, enemies right), turned toward the viewer. Removed units squash flat while fading over 420ms. Summon cards render one standing pose of each character. Released shots travel 120ms and resolve damage (with splash, slow and knockback) on arrival.

The root landing page links to this example, and `npm run build` includes its entry. The dedicated Vite configuration outputs to `dist-lane-battle`; root typecheck targets the tower game, while this example uses JavaScript and simulation/browser checks. Dense armies can overlap. All stages use the same full-width lane, tinted per restroom; there is no multiplayer or mid-battle save.

## Verification

`node --test examples/games/lane-battle/*.test.mjs` covers the simulation (lane direction, atomic summon costs/cooldowns, production, burst, shared kill EXP, unattended defeat, 300 repeated inputs), the campaign (formation limits, shop unlocks, growth odds for poops vs specials, first-clear rewards, defeat EXP, save round-trip and corruption), a full 30-stage human-paced campaign on six seeds (each 90–150 minutes, mean 95–135), that rushing 腸活 to MAX loses to 朝の清掃 and a greedy one, that an unleveled army cannot take the final stage, plus audio lifecycle, attack-lunge timing and projectile timing. `browser-check.mjs`, `failure-check.mjs` and `campaign-check.mjs` cover desktop 1280×800, portrait 390×844 and landscape 844×390 for no overflow, summon, pause, natural defeat/retry, a stage-1 victory through real buttons with its report, unlock, record, new special, formation edit, reload persistence, shop purchase and the mute gate. `audio-browser-check.mjs` verifies no pre-gesture oscillators, continuing BGM, cancellation on pause, resume, mute and unmute in real Chrome. `projectile-browser-check.mjs` uses a deterministic real-renderer fixture to confirm that pellet arrival, death and the impact sound share a frame and that pending pellets freeze during pause. `animation-check.mjs` and `audio-capture-check.mjs` write local-only recordings under `/tmp` for manual review; `LANE_URL`, `LANE_EVIDENCE_DIR`, `LANE_AUDIO_DIR` and `FFMPEG_BIN` override their defaults.

## Background progression

An active battle continues through a shared monotonic clock. Besides animation frames, a 250ms heartbeat from a Web Worker timer (which escapes main-thread background throttling) keeps it running while the tab is hidden or the window is occluded; a plain `setInterval` is the fallback when workers are unavailable. On return, missed time is simulated in steps of at most 50ms, preserving combat rules, the 999 resource limit and terminal results. Each callback processes at most 30 seconds of simulation and schedules another batch until it catches up or the battle ends; battle inputs are blocked while reconciliation is pending. Explicit pause and results never accrue simulation debt, and starting/replaying a stage resets the clock. Hidden and reconciled combat produces no catch-up sounds.

Browsers and operating systems can throttle, freeze or discard background pages. Immediate background execution is therefore best effort; discarded pages cannot restore an unsaved battle. Long foreground stalls are reconciled in the same bounded batches. Separate tabs keep independent games. The automated background check covers skipped callbacks, explicit pause and eventual result after a long suspension, plus a real Chrome page freeze/resume and a headless tab switch; headless Chrome may keep both tabs visible, so that switch alone does not prove OS background suspension.
