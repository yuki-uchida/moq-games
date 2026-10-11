import { allRoadPaths } from './game/BattlefieldRoutes'
import { FORTIFICATIONS } from './game/Fortifications'
import {
  equipmentControls,
  equipmentEffect,
  equipmentNames,
  equipmentReplacementDetail,
  fortificationDialogs,
  fortificationIcon,
  initializeFortificationIcons,
  gateUpgradePresentation,
  roadItemControls,
  roadItemNames,
  roadItemPlacementLabel,
  roadItemStatus
} from './fortification-ui'
import { SoundPlayer } from './audio/SoundPlayer'
import { soundCatalog } from './audio/SoundCatalog'
import { loadSoundPreferences, saveSoundPreferences } from './audio/SoundPreferences'
import { validateCampaignCheckpoint } from './game/CampaignCheckpoint'
import { loadCampaignSave, saveCampaignCheckpoint, saveProfileWithoutRun } from './progression/CampaignStorage'
import { authoredDeathClips } from './rendering/DeathArt'
import { DRAGON_BREATH_MOUTHS, dragonBreathBodyClips } from './rendering/DragonBreathArt'
import { createBattleClock, type BattleClock } from './clock/BattleClock'
import { authoredEffectClips } from './rendering/AuthoredEffects'
import { GroundTapInput } from './input/GroundTapInput'
import { DEFENDER_FOOTPRINT, groundPlacementLabel } from './game/GroundPlacement'
import { getPrimaryRelayUrl, DEFAULT_LOCAL_RELAY_A_URL } from '../../../../utils/relayPresets'
import './style.css'
import { GameEngine } from './game/GameEngine'
import {
  CONFIG,
  ROAD_EFFECTS,
  ALLY_TYPES,
  DEFINITIONS,
  FIELDS,
  getField,
  fieldFor,
  stageRules,
  actionLabel,
  type AllyType,
  type UnitType,
  type FieldId,
  type LayoutRevision,
  type Placement,
  type Point,
  type Equipment,
  type RoadItemKind
} from './game/model'
import { RuleBasedAI, JevAI } from './ai/AIController'
import { GameRenderer } from './rendering/GameRenderer'
import type { ArtMode } from './rendering/BulkArtSwitch'
import { AssetStatusNotice } from './rendering/AssetStatusNotice'
import {
  loadEnvironmentArtBundle,
  newCampaignLayoutRevision,
  type EnvironmentArtBundle
} from './rendering/EnvironmentArt'
import { environmentTrialFromURL } from './rendering/EnvironmentTrial'
import { DecisionPanel } from './ui/DecisionPanel'
import { commanderSupportPresentation } from './rendering/CommanderPresentation'
import {
  UNIT_TRIAL_TYPES,
  ENEMY_TRIAL_TYPES,
  ALL_TRIAL_TYPES,
  unitTrialOwner,
  unitTrialCatalog,
  type UnitTrialType,
  type UnitTrials
} from './rendering/UnitArtTrial'
import { authoredRosterClips, authoredPortrait } from './rendering/AuthoredRoster'
import {
  freshRunFromProfile,
  resumeProgress,
  profileFromSave,
  freshProfile,
  startNewRun,
  availableAllies,
  SCOUT_COST,
  scout,
  scoutAllowed,
  scoutCandidates,
  upgrade,
  upgradeCost
} from './progression/UpgradeSystem'
import type { JevConnection } from './network/JevConnection'
import { UnitDrag } from './input/UnitDrag'
import { DefenderMoveInput } from './input/DefenderMoveInput'
import {
  STARTING_GOLD,
  DEPLOYMENT_COST,
  REDEPLOY_RADIUS,
  canSpendOnRoster,
  defenderLevel,
  findDefender,
  retainedDefenders
} from './game/DefenderRoster'
import { showOutcomeDialog } from './input/OutcomeDialog'
import { PanelDialog } from './input/PanelDialog'
import { MapPan } from './input/MapPan'
import { SandbagInput, sandbagPlacementLabel } from './input/SandbagInput'
import { enemyStrategyPresentation } from './input/EnemyStrategy'
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const loadedCampaign = loadCampaignSave(validateCampaignCheckpoint)
let pendingRun = loadedCampaign.run
let showLegacyMigration = loadedCampaign.source === 'legacy'
let replaceStoredRun = !!pendingRun || !!loadedCampaign.issue
const save = freshRunFromProfile(loadedCampaign.profile, 2, 1),
  rule = new RuleBasedAI()
let engine = new GameEngine(rule, save, undefined, undefined, undefined, DRAGON_BREATH_MOUTHS, 2, 1),
  selected: AllyType = 'soldier'
let connection: JevConnection | undefined,
  connected = false,
  connecting = false,
  started = false,
  rewarded = false,
  outcomeSaved = false,
  removing = false,
  placingSandbag = false
let dropTarget: Placement | null = null,
  selectedSlot: Placement | null = null
let keyboardPoint: Point | null = null
let keyboardUnitPicked = false
let activeTray: 'unit' | 'item' | null = null
let contextOpener: HTMLElement | null = null
let heldDefenderId: number | null = null
let selectedDefenderId: number | null = null,
  movingDefenderId: number | null = null
let selectedSandbagId: number | null = null,
  movingSandbagId: number | undefined,
  pendingSandbagRemoval: number | null = null
let placingRoadItem: RoadItemKind | null = null,
  selectedRoadItemId: number | null = null,
  movingRoadItemId: number | undefined
let pendingFortification:
  | { kind: 'remove'; id: number }
  | { kind: 'equipment'; id: number; previous: Equipment; equipment: Equipment }
  | null = null
let battleClock: BattleClock | undefined,
  clockFailed = false,
  discardedClockMs = 0,
  resumedAfterSuspension = false,
  pageSuspended = false,
  simulationDisposed = false,
  animationFrameId = 0,
  lastCheckpointAt = performance.now(),
  lastSavedCheckpoint = '',
  pendingSaveAction: 'new' | 'reset' | null = null
const fieldIds = Object.keys(FIELDS) as FieldId[]
const artBase = new URL('../../../tower-defense-art/', document.baseURI)
const trialArts = unitTrialCatalog(artBase)
let environmentTrialEnabled = environmentTrialFromURL(new URL(document.baseURI))
let environmentTrialError: string | undefined
let environmentTrialRequest = 0
let newLayoutBundle: EnvironmentArtBundle | undefined
const newLayoutRequest = new AbortController()
const trialEnabled = Object.fromEntries(
  ALL_TRIAL_TYPES.map((type) => [type, new URL(document.baseURI).searchParams.get(`${type}-art`) === '3d'])
) as Record<UnitTrialType, boolean>
function displayPortrait(type: UnitType): string | undefined {
  return ALL_TRIAL_TYPES.some((role) => role === type) && trialEnabled[type as UnitTrialType]
    ? trialArts[type as UnitTrialType].portrait
    : authoredPortrait(type, artBase)
}
const emblems = {
  cleared:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 2 5 13 13 5-13 5-5 13-5-13L2 20l13-5Z" fill="currentColor"/></svg>',
  victory:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 29 2 10l10 7L20 4l8 13 10-7-3 19ZM7 34h26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  defeat:
    '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 34C4 24 2 17 5 10c4-7 12-5 15 1 3-6 11-8 15-1 3 7 1 14-15 24Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>'
}
function mapPreview(id: FieldId, layoutRevision: LayoutRevision = 1) {
  const field = getField(id, 2, layoutRevision),
    entry = field.entrance,
    base = field.gate
  const roads = allRoadPaths(field)
    .map((path) => `M${path.map((point) => `${point.x},${point.y}`).join(' L')}`)
    .join(' ')
  return `<svg viewBox="0 0 ${field.width} ${field.height}" aria-hidden="true"><rect width="${field.width}" height="${field.height}" fill="${field.theme.ground}"/><path d="${roads}" fill="none" stroke="${field.theme.edge}" stroke-width="84" stroke-linejoin="round"/><path d="${roads}" fill="none" stroke="${field.theme.road}" stroke-width="52" stroke-linejoin="round"/><circle cx="${entry.x}" cy="${entry.y}" r="38" fill="#c36351"/><circle cx="${base.x}" cy="${base.y}" r="45" fill="#f5e6ae"/></svg>`
}
$('app').innerHTML = `
<header class="topbar"><a class="brand" hidden href="../../../index.html"><span class="brand-emblem" aria-hidden="true">${emblems.cleared}</span><span>MOSS <i>&</i> STEEL<small>十の戦いと、小さな王国</small></span></a><div class="tools"><span class="gold-purse"><span aria-hidden="true">◈</span><b id="gold">${STARTING_GOLD} G</b></span><button id="settings-toggle" aria-controls="settings" aria-expanded="false"><span id="connection-state" class="status-dot" aria-hidden="true"></span><span id="settings-label">接続・AI</span></button></div></header>
<main class="game-layout" inert>
<section class="battle-panel" aria-label="戦場">
<div class="stage-label">Stage <span id="stage">01</span></div><span id="phase" class="sr-only" role="status"></span>
<div class="map-heading"><span><b id="field-name"></b><small id="time">00:00</small></span><span class="map-help">地図をドラッグ・スクロールして移動</span></div>
<div class="map-shell"><div id="map-scroll" tabindex="0" aria-label="戦場を移動。矢印キーで移動、Homeで入口、Endで拠点。Shiftと矢印キーで配置位置を選び、Enterで配置・移動"><div id="map-world"><div id="field"><div id="base-health" class="base-health"><progress id="player-bar" max="${CONFIG.baseHp}" value="${CONFIG.baseHp}" aria-label="拠点の残り体力" aria-describedby="player-hp"></progress><span id="player-hp" class="sr-only">100 / 100</span></div></div></div></div></div>
<p id="feedback" class="sr-only" role="status" aria-live="polite">4つのフィールドから遠征先を選ぼう。</p>
</section>
<nav class="field-controls" aria-label="戦場の操作">
<button id="deck-toggle" class="field-icon reserve-dropzone" aria-expanded="false" aria-controls="unit-tray" aria-label="仲間・控え" title="仲間・控え">${fortificationIcon('company')}<span id="reserve-count" class="icon-count" aria-hidden="true">0</span></button>
<button id="items-toggle" class="field-icon" aria-expanded="false" aria-controls="item-tray" aria-label="道の備え" title="道の備え">${fortificationIcon('sandbag')}</button>
<button id="assault" class="field-icon primary" aria-label="襲撃開始" title="襲撃開始" disabled>▶</button>
</nav><p id="control-tooltip" role="tooltip" hidden></p>
<section id="unit-tray" class="floating-tray panel" aria-label="仲間・控え" hidden><div class="tray-heading"><span id="count" class="sr-only"></span><span id="ai-mode" class="sr-only"></span><button id="scout" class="scout-button" aria-label="仲間をスカウト · 80 G" title="仲間をスカウト · 80 G">${fortificationIcon('scout')}<span>◈ ${SCOUT_COST}</span></button><button id="upgrade" aria-controls="upgrade-panel" aria-expanded="false" aria-label="旧遠征の強化" title="旧遠征の強化" hidden>↑</button><button id="unit-tray-close" class="icon-close" aria-label="仲間を閉じる">×</button></div><div class="cards" aria-label="配置できる仲間">${ALLY_TYPES.map((type, i) => `<button class="unit" id="unit-${type}" aria-label="${DEFINITIONS[type].name} をドラッグして配置" title="${DEFINITIONS[type].name} · 40 G" hidden><kbd aria-hidden="true">${(i + 1) % 10}</kbd><img src="${displayPortrait(type) ?? ''}" alt="" draggable="false"><small id="level-${type}"></small><span class="unit-check" aria-hidden="true">✓</span></button>`).join('')}</div></section>
<section id="item-tray" class="floating-tray panel" aria-label="道の備え" hidden><div class="tray-heading"><span id="sandbag-stock" class="sr-only"></span><button id="item-tray-close" class="icon-close" aria-label="道の備えを閉じる">×</button></div><div class="road-actions item-tools"><button id="sandbag-place" class="item-tool" aria-pressed="false" aria-label="土のうを配置" title="土のうを配置">${fortificationIcon('sandbag')}<small id="sandbag-place-label"></small></button>${roadItemControls}</div><p id="paid-item-status" class="sr-only" role="status" hidden></p></section>
<section id="selection-context" class="selection-context floating-tray panel" aria-labelledby="unit-action-name" hidden><div class="context-heading"><b id="unit-action-name"></b><button id="selection-close" aria-label="選択メニューを閉じる">×</button></div><p id="unit-action-status"></p><div id="defender-actions" class="context-actions"><button id="unit-upgrade" aria-label="強化" title="強化">↑</button><button id="unit-move" aria-label="キーボードで移動" title="キーボードで移動">✥</button><button id="unit-recall" aria-label="控えに戻す · 40 G返金" title="控えに戻す · 40 G返金">↩ <small>+40</small></button></div><div id="sandbag-actions" class="context-actions" hidden><button id="sandbag-move" aria-label="土のうを移動" title="土のうを移動" disabled>✥</button><button id="sandbag-remove" aria-label="土のうを撤去" title="土のうを撤去" disabled>×</button></div><div id="road-item-actions" class="context-actions" hidden><button id="road-item-move" aria-label="アイテムを移動" title="アイテムを移動">✥</button><button id="road-item-remove" aria-label="アイテムを撤去・返金なし" title="アイテムを撤去・返金なし">×</button></div>${equipmentControls}<p id="unit-action-hint" class="sr-only" role="status"></p></section>
</main>
<dialog id="settings" class="panel settings" aria-labelledby="settings-title"><div class="dialog-heading"><div><span class="eyebrow">EXPEDITION SETTINGS</span><h2 id="settings-title">接続・AI・保存</h2></div><button id="settings-close" class="close-button" aria-label="設定を閉じる">×</button></div><p class="dialog-intro">敵の指揮官と、ブラウザー保存の設定です。</p><label for="mode">敵の指揮官</label><select id="mode" aria-describedby="mode-help"><option value="rule">ルール AI · 接続なしで遊ぶ</option><option value="jev" selected>Jev · MoQ に接続して遊ぶ</option></select><p id="clock-help" class="hint">別のタブを見ている間も、現在のステージの戦闘は続きます。勝敗が決まると停止し、次へは手動です。Jev の判断・API 利用料金も継続します。端末のスリープやブラウザーの凍結・破棄中は継続を保証できません。遅延の補完は最大2秒で、それを超えた時間は進めません。</p><p id="clock-status" class="notice" role="status" hidden></p><p id="mode-help" class="hint">ルール AI は接続不要。Jev は同じ Relay・Room で Pipecat bot を起動してください。</p><label for="history-mode">戦術履歴を判断に含める</label><select id="history-mode" aria-describedby="history-help"><option value="on" selected>ON · 直近20秒と短い戦績</option><option value="off">OFF · 現在の盤面のみ</option></select><p id="history-help" class="hint">同じ盤面のまま切り替えできます。変更は次の通常判断から適用。ONでも追加のJev呼び出しはしません。</p><div id="connection-fields" class="connection-fields"><span class="section-kicker">MOQ × PIPECAT × JEV</span><label for="relay">WebTransport relay</label><input id="relay" type="url" spellcheck="false" autocomplete="off"><label for="room">Room</label><input id="room" value="mossvale" spellcheck="false" autocomplete="off"><button id="connect" class="primary">MoQ に接続</button></div><p id="notice" class="notice" role="status" aria-live="polite">Jev は MoQ への接続が必要です。</p><section class="enemy-plan" aria-labelledby="enemy-plan-title"><h3 id="enemy-plan-title">敵の作戦</h3><p id="enemy-plan-status">準備中は敵の出撃判断を行いません。</p><p id="enemy-plan-reason" hidden></p><small id="enemy-plan-progress" hidden></small><p id="enemy-plan-reconsideration" hidden></p></section><section class="commander-support-tools" aria-labelledby="commander-support-title"><h3 id="commander-support-title">Jev の支援魔法</h3><p id="commander-support-status" role="status"></p><p id="commander-support-order" class="hint"></p><p class="hint">新規遠征の Jev モードで、戦闘開始10秒後から敵1体を支援。600msの詠唱後に回復、または5秒の加速・防御・攻撃強化。発動間隔10秒、重ね掛けなし。召喚とは別の判断で、通信失敗時には発動しません。</p><small>召喚と支援は各1秒に1回まで、合計最大2回のAPIリクエスト。支援の再使用待ち中は支援を問い合わせません。ルールAIと旧遠征には追加されません。</small></section><section class="environment-art-tools"><label for="art-mode">全体の描画 · 仲間・敵・環境</label><select id="art-mode" aria-describedby="art-mode-help art-mode-status"><option value="2d">すべて2D</option><option value="3d">すべて3D試用</option><option value="mixed" disabled>個別設定（2D・3D混在）</option></select><p id="art-mode-help" class="hint">仲間10種・敵10種・環境をまとめて切り替えます。読み込み中は今の表示を保ち、準備ができたら同時に反映します。初回画面・準備中のみ変更できます。旧地形の環境は2Dのままです。3Dの歩行は試作です。</p><p id="art-mode-status" class="hint" role="status" aria-live="polite"></p><button id="art-mode-cancel" hidden>切り替えを中止</button></section><section class="environment-art-tools"><label for="environment-art">環境の描画</label><select id="environment-art" aria-describedby="environment-art-help environment-art-status"><option value="2d">元の2D</option><option value="3d">3D試用</option></select><p id="environment-art-help" class="hint">戦う場所は平らなまま、起伏は外側の景観に配置します。道・配置・戦闘ルールは同じです。旧地形は元の2Dを使用します。初回画面・準備中に変更できます。</p><p id="environment-art-status" class="hint" role="status" aria-live="polite"></p></section><section class="trial-art-tools">${UNIT_TRIAL_TYPES.map((type) => `<label for="${type}-art">${DEFINITIONS[type].name}の描画</label><select id="${type}-art" aria-describedby="soldier-art-help"><option value="2d">2D 原画</option><option value="3d">3D 試用</option></select>`).join('')}<p id="soldier-art-help" class="hint">剣士・射手・盾騎士・魔法使い・霜の術師・花の癒やし手・槍の斥候・鷹の狩人・火薬の工兵・光の守護者を個別に切り替えます。能力・速度・命中時刻は同じです。光の守護者は近接範囲攻撃で戦います。3Dの歩行の接地と死亡演出は試作です。死亡アニメは未制作のため、倒れたときは最後の全身姿勢を保持します。歩調は暫定値のため足滑りが残ります。初回画面・準備中に変更できます。</p></section><section class="enemy-trial-art-tools"><h3>敵の描画</h3>${ENEMY_TRIAL_TYPES.map((type) => `<label for="${type}-art">${DEFINITIONS[type].name}</label><select id="${type}-art" aria-describedby="enemy-art-help"><option value="2d">2D 原画</option><option value="3d">3D 試用</option></select>`).join('')}<p id="enemy-art-help" class="hint">敵の全身画像を個別に切り替えます。能力・出現条件・ボス倍率は同じです。初回画面・準備中のみ変更できます。3D死亡アニメは未制作のため最後の全身姿勢を保持します。歩行の接地には足滑りが残ります。</p></section><section class="sound-tools" aria-labelledby="sound-title"><h3 id="sound-title">効果音 · 試用</h3><label class="sound-toggle"><input id="sound-enabled" type="checkbox" checked> 攻撃・減速の効果音を鳴らす</label><label for="sound-volume">音量 <output id="sound-volume-value">20%</output></label><input id="sound-volume" type="range" min="0" max="100" step="5" value="20"><p id="sound-status" class="hint" role="status"></p><button id="sound-retry" hidden>音声の読み込みを再試行</button><p class="hint">生成音の候補です。音色は調整中。最初の操作後に読み込み、準備できた音だけを鳴らします。再開時に過去の音は再生しません。</p></section><section class="save-tools" aria-labelledby="save-title"><h3 id="save-title">このブラウザーの保存</h3><p>5秒ごと・配置や購入・ステージ終了時に自動保存。再開には最初の画面で操作が必要です。</p><p id="save-state" role="status">未開始</p><button id="save-now">今の遠征を保存</button><button id="save-reset">保存データを初期化</button><small>雇用済みの仲間は新しい遠征でも利用可能。レベル・資金・装備・道のアイテム・門の強化は遠征ごとにリセットされます。同じゲームを複数タブで開くと、最後に保存した内容が使われます。</small></section><details class="ai-details"><summary>AI の判断を見る</summary><p id="last-action">待機</p><pre id="scores"></pre></details></dialog>
<dialog id="scout-result" class="panel scout-result" aria-labelledby="scout-name"><button id="scout-close" class="icon-close" aria-label="スカウト結果を閉じる">×</button><img id="scout-portrait" alt=""><h2 id="scout-name"></h2></dialog>
<dialog id="upgrade-panel" class="panel settings shop" aria-labelledby="upgrade-title"><div class="dialog-heading"><div><span class="eyebrow">THE COMPANY LODGE</span><h2 id="upgrade-title">雇用と強化</h2></div><button id="upgrade-close" class="close-button" aria-label="雇用と強化を閉じる">×</button></div><div class="shop-balance"><span>使えるゴールド</span><b id="shop-gold">80 G</b></div><p id="shop-intro" class="dialog-intro">戦いの報酬で、新しい仲間と出会おう。雇用した仲間は次の遠征でも利用できます。強化とゴールドは今回の全10ステージ限定です。</p><div id="upgrades"></div><p id="shop-footnote" class="shop-footnote">強化は HP・攻撃力に反映されます。配置済みの仲間も、準備中に一緒に強くなります。</p></dialog>
<button id="connection-warning" class="connection-warning panel" hidden aria-label="接続の問題を確認。接続・AI設定を開く"></button>
<dialog id="launch" class="launch panel" aria-labelledby="launch-title"><div class="launch-intro"><span class="eyebrow">MOSS & STEEL · A LITTLE KINGDOM</span><div class="kingdom-crest" aria-hidden="true"><svg viewBox="0 0 120 104"><path d="M20 37Q5 30 15 14Q39 18 40 39M21 51Q1 50 6 32Q26 33 35 47M100 37Q115 30 105 14Q81 18 80 39M99 51Q119 50 114 32Q94 33 85 47" fill="#88a576"/><path d="M30 23Q60 9 90 23V54Q88 78 60 94Q32 78 30 54Z" fill="#e1b85c" stroke="#fff3ce" stroke-width="4"/><path d="M37 29Q60 19 83 29V53Q81 72 60 85Q39 72 37 53Z" fill="#365d49"/><path d="M55 62V37L60 30L65 37V62M47 58H73M60 61V74" fill="#f6ebc8" stroke="#f6ebc8" stroke-width="4" stroke-linejoin="round"/><path d="m19 70 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM101 64l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#d6ab55"/></svg></div><h1 id="launch-title">小さな仲間と、<br>大きな王国を守ろう。</h1><p>仲間を配置して、全10ステージの遠征へ。<br>最初は${STARTING_GOLD}G。1体40Gで、最大10種類の仲間を配置。</p></div><div class="choice-heading"><h2>遠征先を選ぼう</h2><span>4つのフィールド</span></div><div class="field-choice" role="group" aria-label="4つのフィールド">${fieldIds.map((id, i) => `<button class="field-card" data-field="${id}" aria-pressed="${i === 0}"><span class="field-art">${mapPreview(id)}<span class="field-check" aria-hidden="true">✓</span></span><span class="field-copy"><small>FIELD 0${i + 1}</small><b>${FIELDS[id].name}</b><em>${FIELDS[id].description}</em></span></button>`).join('')}</div><div class="launch-footer"><p id="saved-run-note" class="notice" role="status"></p><button id="resume-run" class="primary" hidden>保存した遠征を続ける</button><p id="launch-status" class="notice" role="status"></p><div class="launch-actions"><button id="start" class="primary">このフィールドで出発 →</button><button id="offline-start">接続なしで始める</button><button id="launch-settings" class="text-button" aria-controls="settings" aria-expanded="false">Jev・接続の設定</button></div><p id="battlefield-version-help" class="launch-note">新規遠征は${STARTING_GOLD}G・1体40G・各種類1体。分岐して合流する2経路の縦長マップ。新規遠征のJevには10秒ごとの支援魔法があります。保存した旧遠征は元の地形とルールで最後まで続けられます。</p><p class="launch-note">仲間をドラッグ → 地面で離す → 襲撃開始。準備中は移動無料。控えに戻すと40G返金され、再配置は40G。</p></div></dialog>
<dialog id="save-confirm" class="panel settings" aria-labelledby="save-confirm-title"><h2 id="save-confirm-title">保存中の遠征を置き換えますか？</h2><p id="save-confirm-detail"></p><div class="road-actions"><button id="save-confirm-cancel">戻る</button><button id="save-confirm-accept">確認して続ける</button></div></dialog>
<dialog id="sandbag-confirm" class="panel settings" aria-labelledby="sandbag-confirm-title"><h2 id="sandbag-confirm-title">損傷した土のうを撤去しますか？</h2><p id="sandbag-confirm-detail">この土のうは失われ、在庫には戻りません。</p><div class="road-actions"><button id="sandbag-cancel-remove">戻る</button><button id="sandbag-confirm-remove">失われることを確認して撤去</button></div></dialog>
${fortificationDialogs}
<dialog id="result" class="result" aria-labelledby="result-title" aria-describedby="reward"><div id="result-icon" class="result-icon" aria-hidden="true">${emblems.cleared}</div><span id="result-eyebrow" class="eyebrow">MOSSVALE EXPEDITION</span><h2 id="result-title"></h2><div class="result-summary"><span id="result-stage"></span><b id="result-gold"></b></div><p id="reward"></p><button id="next" class="primary">次のステージの準備へ →</button><button id="retry" class="primary">フィールドを選んで再出発</button><small class="result-note">雇用した仲間は引き継ぎ、次の遠征は全員Lv.1・${STARTING_GOLD}Gから。装備・道のアイテム・門の強化はリセット。</small></dialog>`
initializeFortificationIcons()
$<HTMLInputElement>('relay').value = getPrimaryRelayUrl(DEFAULT_LOCAL_RELAY_A_URL)
const renderer = new GameRenderer($('field'), {
  clips: { ...authoredRosterClips(artBase), ...dragonBreathBodyClips(artBase) },
  commanderBase: artBase,
  environmentTrial: environmentTrialEnabled,
  unitTrials: Object.fromEntries(
    ALL_TRIAL_TYPES.filter((type) => trialEnabled[type]).map((type) => [type, trialArts[type]])
  ) as UnitTrials,
  deathClips: authoredDeathClips(artBase),
  effectClips: authoredEffectClips(artBase)
})
// Keep the original campaign layout until every matching background is decoded and verified.
// The retained bundle also supplies later field switches without another network dependency.
void loadEnvironmentArtBundle(artBase, newLayoutRequest.signal, 2)
  .then((bundle) => {
    if (simulationDisposed) {
      bundle.dispose()
      return
    }
    newLayoutBundle = bundle
    renderer.setEnvironmentBundle(bundle)
    updateFieldChoicePreviews()
  })
  .catch(() => {
    // Missing, incomplete, stale or failed artwork leaves all new campaigns on layout 1.
  })
Object.assign(window, {
  towerDefenseDiagnostics: () => ({
    ...renderer.diagnostics(),
    newCampaignLayoutRevision: newCampaignLayoutRevision(newLayoutBundle)
  })
})
for (const type of ALL_TRIAL_TYPES) $<HTMLSelectElement>(`${type}-art`).value = trialEnabled[type] ? '3d' : '2d'
$<HTMLSelectElement>('environment-art').value = environmentTrialEnabled ? '3d' : '2d'
function currentArtMode(): ArtMode | 'mixed' {
  const values = [environmentTrialEnabled, ...ALL_TRIAL_TYPES.map((type) => trialEnabled[type])]
  return values.every(Boolean) ? '3d' : values.some(Boolean) ? 'mixed' : '2d'
}
function updateArtModeStatus() {
  const status = renderer.artSwitchStatus,
    loading = status.status === 'loading' || status.status === 'ready',
    selector = $<HTMLSelectElement>('art-mode'),
    label = $('art-mode-status'),
    mode = currentArtMode(),
    environment = renderer.environmentStatus(),
    environmentIncomplete = mode === '3d' && engine.state.battlefieldVersion === 2 && !environment.active
  selector.disabled = started && !preparing()
  selector.value = loading ? status.target! : mode
  $('art-mode-cancel').hidden = !loading
  label.dataset.status =
    status.status === 'error' || (environmentIncomplete && !!environment.error)
      ? 'error'
      : loading || environmentIncomplete
        ? 'loading'
        : mode
  const message =
    status.status === 'error'
      ? `切り替えられませんでした。今の表示と設定を保っています。もう一度選ぶと再試行できます。${status.error ?? ''}`
      : loading
        ? `${status.target === '3d' ? '3D' : '2D'}を読み込み中。完了までは今の表示を保ちます。設定を閉じると中止します。`
        : environmentIncomplete
          ? `仲間・敵は3D試用。環境は${environment.error ? '読込失敗のため2Dで表示中。' : environment.waitingForPreparation ? '次の準備まで2Dで表示中。' : '読み込み中のため2Dで表示中。'}`
          : mode === 'mixed'
            ? '個別設定を使用中。上の選択で仲間・敵・環境をまとめて変更できます。'
            : mode === '3d' && engine.state.battlefieldVersion !== 2
              ? '仲間・敵は3D試用。旧地形の環境は元の2Dを使用します。'
              : `仲間・敵・環境を${mode === '3d' ? '3D試用' : '2D'}で表示中。`
  if (label.textContent !== message) label.textContent = message
}
function cancelArtMode() {
  renderer.cancelArtSwitch()
  updateArtModeStatus()
}
function commitArtMode() {
  const mode = renderer.commitArtSwitch(engine.state)
  if (!mode) return
  const enabled = mode === '3d',
    url = new URL(document.baseURI)
  environmentTrialEnabled = enabled
  environmentTrialError = undefined
  environmentTrialRequest++
  $<HTMLSelectElement>('environment-art').value = mode
  for (const type of ALL_TRIAL_TYPES) {
    trialEnabled[type] = enabled
    $<HTMLSelectElement>(`${type}-art`).value = mode
    if (enabled) url.searchParams.set(`${type}-art`, '3d')
    else url.searchParams.delete(`${type}-art`)
    if (unitTrialOwner(type) === 'player') {
      const portrait = $(`unit-${type}`).querySelector('img')
      if (portrait) portrait.src = displayPortrait(type) ?? ''
    }
  }
  if (enabled) url.searchParams.set('environment-art', '3d')
  else url.searchParams.delete('environment-art')
  window.history?.replaceState(window.history.state, '', url)
  if (upgradePanel.isOpen) showUpgrades()
  updateEnvironmentArtStatus()
  updateArtModeStatus()
  announce(`仲間・敵・環境をまとめて${enabled ? '3D試用' : '2D'}に切り替えました。`)
  uiTick = -Infinity
}
updateArtModeStatus()
function updateEnvironmentArtStatus() {
  const status = renderer.environmentStatus(),
    error = environmentTrialError ?? status.error,
    legacy = started && engine.state.battlefieldVersion !== 2,
    label = $('environment-art-status')
  $<HTMLSelectElement>('environment-art').disabled = started && !preparing()
  label.dataset.status = !environmentTrialEnabled
    ? 'original'
    : error
      ? 'error'
      : legacy
        ? 'legacy'
        : status.loading
          ? 'loading'
          : status.waitingForPreparation
            ? 'waiting'
            : status.active
              ? 'ready'
              : 'pending'
  const message = !environmentTrialEnabled
    ? '元の2D環境を使用中。'
    : error
      ? `3D環境を読み込めませんでした。元の2D環境で続けられます。2Dに戻してから3D試用を選ぶと再試行できます。${error}`
      : legacy
        ? '旧地形は元の2Dを使用します。3D試用の選択は、新しい地形の遠征に適用されます。'
        : status.loading
          ? '3D環境を読み込み中。完了するまでは元の2D環境で遊べます。'
          : status.waitingForPreparation
            ? '3D環境は読込済み・次の準備で切替。今の戦闘は元の2D環境で続けられます。'
            : status.active
              ? '3D環境を試用中。'
              : '3D環境の準備中。元の2D環境で続けられます。'
  if (label.textContent !== message) label.textContent = message
}
updateEnvironmentArtStatus()
const assetStatus = document.createElement('div')
assetStatus.id = 'asset-status'
assetStatus.setAttribute('role', 'status')
assetStatus.hidden = true
$('app').append(assetStatus)
const assetNotice = new AssetStatusNotice(assetStatus)
const decisionPanel = new DecisionPanel($('app'), (type) => displayPortrait(type))
const soundPreferences = loadSoundPreferences()
const soundPlayer = new SoundPlayer(
  soundCatalog(new URL('../../../tower-defense-sfx/', document.baseURI)),
  (status) => {
    $('sound-status').textContent = !status.enabled ? '効果音はミュート中' : status.message
    $('sound-retry').hidden = status.failed === 0 || !status.enabled
  }
)
soundPlayer.setVolume(soundPreferences.volume)
soundPlayer.setEnabled(soundPreferences.enabled)
$<HTMLInputElement>('sound-enabled').checked = soundPreferences.enabled
$<HTMLInputElement>('sound-volume').value = String(Math.round(soundPreferences.volume * 100))
$('sound-volume-value').textContent = `${Math.round(soundPreferences.volume * 100)}%`
const unlockSound = (event: Event) => {
  if (event.isTrusted && soundPreferences.enabled) void soundPlayer.unlock()
}
document.addEventListener('pointerdown', unlockSound, { capture: true })
document.addEventListener('keydown', unlockSound, { capture: true })
$<HTMLInputElement>('sound-enabled').onchange = () => {
  soundPreferences.enabled = $<HTMLInputElement>('sound-enabled').checked
  soundPlayer.setEnabled(soundPreferences.enabled)
  saveSoundPreferences(soundPreferences)
  if (soundPreferences.enabled) void soundPlayer.unlock()
}
$<HTMLInputElement>('sound-volume').oninput = () => {
  soundPreferences.volume = Number($<HTMLInputElement>('sound-volume').value) / 100
  soundPlayer.setVolume(soundPreferences.volume)
  $('sound-volume-value').textContent = `${Math.round(soundPreferences.volume * 100)}%`
  saveSoundPreferences(soundPreferences)
}
$('sound-retry').onclick = () => {
  void soundPlayer.unlock()
  soundPlayer.retryFailed()
}
Object.assign(window, { towerDefenseAudioDiagnostics: () => soundPlayer.diagnostics })
const viewport = $('map-scroll')
let mapScale = 1
const settingsPanel = new PanelDialog(
  $<HTMLDialogElement>('settings'),
  [$('settings-toggle'), $('launch-settings')],
  $('mode')
)
const upgradePanel = new PanelDialog($<HTMLDialogElement>('upgrade-panel'), [$('upgrade')], $('upgrade-close'))
const sandbagConfirm = new PanelDialog(
  $<HTMLDialogElement>('sandbag-confirm'),
  [$('sandbag-remove')],
  $('sandbag-cancel-remove')
)
const fortificationConfirm = new PanelDialog(
  $<HTMLDialogElement>('fortification-confirm'),
  [$('road-item-remove'), $('equipment-weapon'), $('equipment-armor')],
  $('fortification-confirm-cancel')
)
const gatePanel = new PanelDialog($<HTMLDialogElement>('gate-panel'), [$('gate-toggle')], $('gate-close'))
const saveConfirm = new PanelDialog($<HTMLDialogElement>('save-confirm'), [$('save-reset')], $('save-confirm-cancel'))
const launchDialog = $<HTMLDialogElement>('launch')
launchDialog.addEventListener('cancel', (event) => event.preventDefault())
function paidRoster() {
  return engine.state.economyVersion === 2
}
function replaceProgress(next: typeof save) {
  delete save.economyVersion
  delete save.commanderSupportVersion
  Object.assign(save, next)
}
function preparing() {
  return started && engine.state.phase === 'preparation'
}
function assaulting() {
  return started && engine.state.phase === 'assault'
}
function announce(message: string) {
  $('feedback').textContent = message
}
function panTo(x: number, y: number) {
  viewport.scrollTo({
    left: x * mapScale - viewport.clientWidth / 2,
    top: y * mapScale - viewport.clientHeight / 2,
    behavior: 'smooth'
  })
}
function entrance() {
  const field = fieldFor(engine.state),
    entry = field.slots[0] ?? field.entrance
  panTo(entry.x, entry.y)
}
function base() {
  const path = fieldFor(engine.state).path,
    point = path[path.length - 1]
  panTo(point.x, point.y + 78)
}
function updateFieldChoicePreviews() {
  if (started) return
  const layoutRevision = newCampaignLayoutRevision(newLayoutBundle)
  for (const card of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-field]'))) {
    const preview = card.querySelector('.field-art svg')
    if (preview) preview.outerHTML = mapPreview(card.dataset.field as FieldId, layoutRevision)
    card.dataset.layoutRevision = String(layoutRevision)
  }
}
function updateField() {
  updateFieldChoicePreviews()
  const field = fieldFor(engine.state)
  viewport.style.backgroundColor = field.theme.ground
  $('field').style.width = `${field.width}px`
  $('field').style.height = `${field.height}px`
  $('field').dataset.worldWidth = String(field.width)
  $('field').dataset.worldHeight = String(field.height)
  $('field').dataset.battlefieldVersion = String(engine.state.battlefieldVersion)
  $('field').dataset.layoutRevision = String(
    engine.state.layoutRevision === undefined ? 1 : engine.state.layoutRevision
  )
  $('field-name').textContent = field.name
  const base = field.path.at(-1)!
  $('base-health').style.left = `${base.x}px`
  $('base-health').style.top = `${base.y + 78}px`
  for (const card of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-field]')))
    card.setAttribute('aria-pressed', String(card.dataset.field === field.id))
  resizeBattlefield()
}
for (const card of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-field]')))
  card.onclick = () => {
    if (engine.selectField(card.dataset.field as FieldId)) {
      clearPlacementModes()
      selectedSlot = null
      updateField()
      entrance()
    }
  }
function resizeBattlefield() {
  const field = fieldFor(engine.state)
  mapScale = Math.max(0.55, viewport.clientWidth / field.width)
  $('field').style.transform = `scale(${mapScale})`
  $('map-world').style.width = `${field.width * mapScale}px`
  $('map-world').style.height = `${field.height * mapScale}px`
}
const battlefieldResize = new ResizeObserver(resizeBattlefield)
battlefieldResize.observe(viewport)
function selectedDefender() {
  return selectedDefenderId === null ? undefined : findDefender(engine.state, selectedDefenderId)
}
function deployedType(type: AllyType) {
  return engine.state.units.find((unit) => unit.owner === 'player' && unit.type === type)
}
function closeTrays(restoreFocus = false) {
  const previous = activeTray
  activeTray = null
  $('unit-tray').hidden = true
  $('item-tray').hidden = true
  $('deck-toggle').setAttribute('aria-expanded', 'false')
  $('items-toggle').setAttribute('aria-expanded', 'false')
  $('control-tooltip').hidden = true
  if (restoreFocus && previous) $(previous === 'unit' ? 'deck-toggle' : 'items-toggle').focus({ preventScroll: true })
}
function toggleTray(tray: 'unit' | 'item') {
  const opening = activeTray !== tray
  clearPlacementModes()
  closeTrays()
  if (!opening) return
  activeTray = tray
  $(`${tray}-tray`).hidden = false
  $(tray === 'unit' ? 'deck-toggle' : 'items-toggle').setAttribute('aria-expanded', 'true')
  updateRosterControls()
  const first =
    Array.from($(`${tray}-tray`).querySelectorAll<HTMLButtonElement>(tray === 'unit' ? '.unit' : '.item-tool')).find(
      (button) => !button.disabled && !button.hidden
    ) ?? $(`${tray}-tray-close`)
  first.focus({ preventScroll: true })
}
function openContext(opener?: HTMLElement) {
  closeTrays()
  contextOpener = opener ?? $('deck-toggle')
  updateSelectionContext()
  $('selection-close').focus({ preventScroll: true })
}
function closeContext() {
  const opener = contextOpener
  clearPlacementModes()
  if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
  else $('deck-toggle').focus({ preventScroll: true })
}
function rosterEligible(type: AllyType): boolean {
  if (!preparing() || !availableAllies(save, engine.state.stage).includes(type)) return false
  const unit = retainedDefenders(engine.state).find((unit) => unit.type === type)
  if (unit && (unit.hp <= 0 || unit.slotId !== undefined)) return false
  return !paidRoster() || save.gold >= DEPLOYMENT_COST
}

function selectDefender(id: number, reveal = true) {
  const unit = findDefender(engine.state, id)
  if ((!preparing() && !assaulting()) || !unit || unit.hp <= 0 || (assaulting() && unit.slotId === undefined)) return
  clearPlacementModes()
  selected = unit.type as AllyType
  selectedDefenderId = id
  selectedSlot = unit.slotId === undefined ? null : { slotId: unit.slotId }
  closeTrays()
  if (reveal) openContext($('field').querySelector<HTMLElement>(`button[data-unit-id="${id}"]`) ?? undefined)
  else updateSelectionContext()
}
function deploy(type: AllyType, target: Placement) {
  if (!preparing()) return
  const active = paidRoster() && deployedType(type)
  if (active) return
  if (!rosterEligible(type)) return
  if (engine.place(type, 'slotId' in target ? target.slotId : target)) {
    closeTrays()
    keyboardUnitPicked = false
    persist()
    updateRosterControls()
    const unit = engine.state.units.at(-1)!
    selectedSlot = null
    selectedDefenderId = null
    movingDefenderId = null
    dropTarget = null
    updateSelectionContext()
    const result = engine.previewPlacement(type, { x: unit.homeX, y: unit.homeY }, unit.slotId)
    announce(
      `${DEFINITIONS[type].name}を配置しました。${paidRoster() ? '40Gを使いました。' : ''}${result.reachesRoad ? '破線は戦闘中の移動上限、実線は射程です。' : '移動しても道に攻撃が届きません。'}`
    )
  } else
    announce(
      'slotId' in target ? 'この仲間は配置できません。' : groundPlacementLabel(engine.previewPlacement(type, target))
    )
}
function moveDefender(id: number, point: Point) {
  const unit = findDefender(engine.state, id)
  if (!unit || (!preparing() && !assaulting())) return
  const reserve = unit.slotId === undefined
  const preview = assaulting()
    ? engine.previewBattleRelocation(id, point)
    : reserve
      ? engine.previewPlacement(unit.type as AllyType, point)
      : engine.previewRedeployment(id, point)
  if (!preview.valid) {
    announce(groundPlacementLabel(preview))
    return
  }
  const changed = assaulting()
    ? engine.relocateDefender(id, point)
    : reserve
      ? engine.place(unit.type as AllyType, point)
      : engine.moveDefender(id, point)
  if (!changed) return
  persist()
  selectDefender(id, false)
  announce(
    assaulting()
      ? `${DEFINITIONS[unit.type].name}が移動します。残り0回。`
      : `${DEFINITIONS[unit.type].name}を${reserve ? '40Gで再配置' : '無料で移動'}しました。HPとレベルは変わりません。`
  )
}
function placeOrMove(point: Point) {
  if (movingDefenderId !== null) moveDefender(movingDefenderId, point)
  else if (keyboardUnitPicked) deploy(selected, point)
}
function select(type: AllyType) {
  if (!rosterEligible(type)) return
  clearPlacementModes()
  selected = type
  selectedSlot = null
  updateSelectionContext()
}
function pickKeyboardUnit(type: AllyType) {
  if (!rosterEligible(type)) return
  select(type)
  keyboardUnitPicked = true
  closeTrays()
  viewport.focus({ preventScroll: true })
  announce(`${DEFINITIONS[type].name}。Shiftと矢印で位置を選び、Enterで配置。`)
}

function placementPreview(type: AllyType, point: Point) {
  const unit = assaulting() ? selectedDefender() : paidRoster() && deployedType(type)
  return unit
    ? assaulting()
      ? engine.previewBattleRelocation(unit.id, point)
      : engine.previewRedeployment(unit.id, point)
    : engine.previewPlacement(type, point)
}
const drag = new UnitDrag({
  canDeploy: (type) => rosterEligible(type) && !document.querySelector('dialog[open]'),
  select,
  targetAt: (x, y) => (document.elementFromPoint(x, y)?.closest('#field') ? renderer.worldPointAt(x, y) : null),
  deploy,
  active: (active) => {
    if (active) $('control-tooltip').hidden = true
    $('app').classList.toggle('unit-dragging', active)
  },
  status: (type, target) => {
    if ('slotId' in target) return { valid: true, label: '仲間を入れ替え' }
    const result = placementPreview(type, target)
    return { valid: result.valid, label: groundPlacementLabel(result) }
  },
  preview: (target) => {
    dropTarget = target
  }
})
const defenderMoveInput = new DefenderMoveInput($('field'), {
  enabled: (id) =>
    ((preparing() && paidRoster()) || (assaulting() && engine.canRelocateDefender(id))) &&
    !removing &&
    !placingSandbag &&
    !placingRoadItem &&
    !document.querySelector('dialog[open]') &&
    !!engine.state.units.find((unit) => unit.id === id && unit.owner === 'player' && unit.hp > 0),
  select: (id) => selectDefender(id, false),
  activate: selectDefender,
  pointAt: (x, y) => (document.elementFromPoint(x, y)?.closest('#field') ? renderer.worldPointAt(x, y) : null),
  preview: (_id, point) => {
    dropTarget = point
  },
  move: moveDefender,
  reserveAt: (x, y) => preparing() && !!document.elementFromPoint(x, y)?.closest('#deck-toggle'),
  recall: recallDefender,
  held: (id, overReserve) => {
    const changed = heldDefenderId !== id
    heldDefenderId = id
    if (changed) updateRosterControls()
    if (id !== null) closeTrays()
    $('selection-context').classList.toggle('drag-suspended', id !== null)
    $('deck-toggle').classList.toggle('drop-ready', id !== null && preparing())
    $('deck-toggle').classList.toggle('drop-over', overReserve)
  }
})
function stopSandbagPlacement() {
  placingSandbag = false
  movingSandbagId = undefined
  sandbagInput.cancel()
  $('sandbag-place').setAttribute('aria-pressed', 'false')
  $('sandbag-move').setAttribute('aria-pressed', 'false')
  viewport.classList.remove('placing-sandbag')
}
function cancelPlacementGestures() {
  defenderMoveInput.cancel()
  drag.cancel()
  mapPan.cancel()
  roadItemInput.cancel()
  dropTarget = null
  keyboardPoint = null
  keyboardUnitPicked = false
}
function clearPlacementModes() {
  cancelPlacementGestures()
  stopSandbagPlacement()
  stopRoadItemPlacement()
  pendingFortification = null
  fortificationConfirm.close(false)
  gatePanel.close(false)
  renderer.setGateSelected(false)
  removing = false
  selectedSlot = null
  movingDefenderId = null
  selectedDefenderId = null
  selectedSandbagId = null
  selectedRoadItemId = null
  renderer.setRoadItemSelection(null)
  renderer.setDefenderPlacementPreview(null)
  $('selection-context').hidden = true
  contextOpener = null
  renderer.setSandbagSelection(null)
}
const sandbagInput = new SandbagInput(viewport, {
  enabled: () => placingSandbag && preparing() && !document.querySelector('dialog[open]'),
  pointAt: (x, y) => renderer.worldPointAt(x, y),
  preview: (point) => {
    const preview = point && placingSandbag && preparing() ? engine.previewSandbag(point, movingSandbagId) : null
    renderer.setSandbagPreview(preview, preview ? sandbagPlacementLabel(preview) : '')
  },
  place: (point) => {
    const moving = movingSandbagId !== undefined,
      result = engine.placeSandbag(point, movingSandbagId)
    if (result.valid) {
      persist()
      selectedSandbagId = movingSandbagId ?? engine.state.sandbags.at(-1)!.id
      renderer.setSandbagSelection(selectedSandbagId)
      stopSandbagPlacement()
      updateSelectionContext()
      announce(
        `土のうを${moving ? '残りHPを保って移動' : '配置'}しました。壊れるまで残り、次のステージへ引き継ぎます。`
      )
    } else {
      renderer.setSandbagPreview(result, sandbagPlacementLabel(result))
      announce(sandbagPlacementLabel(result))
    }
  }
})
function stopRoadItemPlacement() {
  placingRoadItem = null
  movingRoadItemId = undefined
  roadItemInput.cancel()
  for (const kind of ['spike', 'mud']) $(`item-${kind}`).setAttribute('aria-pressed', 'false')
  $('road-item-move').setAttribute('aria-pressed', 'false')
  viewport.classList.remove('placing-road-item')
}
function roadPlacementPreview(point: Point) {
  if (!placingRoadItem) return
  const result = engine.previewRoadItem(placingRoadItem, point, movingRoadItemId),
    label = roadItemPlacementLabel(result, placingRoadItem, spendingReason(FORTIFICATIONS[placingRoadItem].cost))
  renderer.setRoadItemPreview(result, label, placingRoadItem)
  return { result, label }
}
function placeRoadItem(point: Point) {
  if (!preparing() || !paidRoster() || !placingRoadItem) return
  const kind = placingRoadItem,
    moving = movingRoadItemId !== undefined,
    result = engine.placeRoadItem(kind, point, movingRoadItemId)
  if (!result.valid) {
    const label = roadItemPlacementLabel(result, kind, spendingReason(FORTIFICATIONS[kind].cost))
    renderer.setRoadItemPreview(result, label, kind)
    announce(label)
    return
  }
  selectedRoadItemId = movingRoadItemId ?? engine.state.fortifications!.items.at(-1)!.id
  stopRoadItemPlacement()
  renderer.setRoadItemSelection(selectedRoadItemId)
  persist()
  updateSelectionContext()
  updateFortificationControls()
  announce(
    `${roadItemNames[kind]}を${moving ? '残り耐久を保って無料で移動' : `${FORTIFICATIONS[kind].cost}Gで配置`}しました。次のステージへ引き継ぎます。`
  )
}
const roadItemInput = new GroundTapInput(viewport, {
  enabled: () => !!placingRoadItem && preparing() && paidRoster() && !document.querySelector('dialog[open]'),
  pointAt: (x, y) => renderer.worldPointAt(x, y),
  preview: (point) => {
    if (point && placingRoadItem && preparing()) roadPlacementPreview(point)
    else renderer.setRoadItemPreview(null, '')
  },
  place: placeRoadItem
})
function beginRoadItemPlacement(kind: RoadItemKind, movingId?: number) {
  if (!preparing() || !paidRoster()) return
  if (
    movingId === undefined &&
    (!canSpendOnRoster(save, FORTIFICATIONS[kind].cost, engine.state) ||
      engine.state.fortifications!.items.length >= FORTIFICATIONS.maxItems)
  )
    return
  const activate = placingRoadItem !== kind || movingRoadItemId !== movingId
  clearPlacementModes()
  placingRoadItem = activate ? kind : null
  movingRoadItemId = activate ? movingId : undefined
  selectedRoadItemId = movingId ?? null
  renderer.setRoadItemSelection(selectedRoadItemId)
  viewport.classList.toggle('placing-road-item', activate)
  updateSelectionContext()
  updateFortificationControls()
  if (activate) {
    closeTrays()
    viewport.focus({ preventScroll: true })
  }
  announce(
    activate
      ? `${roadItemNames[kind]}を置く道の上をタップ。ドラッグは地図移動。配置成功時だけ支払い、1個で終了します。Escで取消。`
      : 'アイテムの配置を取り消しました。'
  )
}
for (const kind of ['spike', 'mud'] as const) $(`item-${kind}`).onclick = () => beginRoadItemPlacement(kind)
$('road-item-move').onclick = () => {
  const item = engine.state.fortifications?.items.find((item) => item.id === selectedRoadItemId)
  if (item) beginRoadItemPlacement(item.kind, item.id)
}
$('road-item-remove').onclick = () => {
  if (!preparing() || !paidRoster()) return
  const item = engine.state.fortifications?.items.find((item) => item.id === selectedRoadItemId)
  if (!item) return
  cancelPlacementGestures()
  stopRoadItemPlacement()
  pendingFortification = { kind: 'remove', id: item.id }
  $('fortification-confirm-title').textContent = `${roadItemNames[item.kind]}を撤去しますか？`
  $('fortification-confirm-detail').textContent =
    `${roadItemStatus(item)}。撤去するとこのアイテムは失われ、返金されません。`
  $('fortification-confirm-accept').textContent = '返金されないことを確認して撤去'
  fortificationConfirm.open($('road-item-remove'))
}
const mapPan = new MapPan(viewport)
$('deck-toggle').onclick = () => toggleTray('unit')
$('items-toggle').onclick = () => toggleTray('item')
for (const tray of ['unit', 'item'])
  $(`${tray}-tray-close`).onclick = () => {
    cancelPlacementGestures()
    closeTrays(true)
  }
document.addEventListener('pointerdown', (event) => {
  const target = event.target as HTMLElement
  if (target.closest('.floating-tray, .field-controls, dialog')) return
  closeTrays()
  if (!target.closest('[data-unit-id]') && !target.closest('.sandbag-handle') && !target.closest('.road-item-handle')) {
    $('selection-context').hidden = true
    selectedDefenderId = null
    selectedSandbagId = null
    selectedRoadItemId = null
  }
})

function showControlTooltip(target: HTMLElement) {
  $('control-tooltip').hidden = true
  const control = target.closest<HTMLButtonElement>('button')
  if (!control || !control.title || (!control.closest('.field-controls') && !control.closest('.floating-tray'))) return
  $('control-tooltip').textContent = control.title
  $('control-tooltip').hidden = false
}
document.addEventListener('focusin', (event) => {
  if (event.target instanceof HTMLElement) showControlTooltip(event.target)
})
document.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch' && event.target instanceof HTMLElement && !defenderMoveInput.dragging)
    showControlTooltip(event.target)
})
function beginSandbagPlacement(movingId?: number) {
  if (!preparing() || (movingId === undefined && engine.state.sandbagStock < 1)) return
  const activate = !placingSandbag || movingSandbagId !== movingId
  clearPlacementModes()
  placingSandbag = activate
  if (activate) closeTrays()
  movingSandbagId = activate ? movingId : undefined
  selectedSandbagId = movingId ?? null
  renderer.setSandbagSelection(selectedSandbagId)
  $('sandbag-place').setAttribute('aria-pressed', String(activate && movingId === undefined))
  $('sandbag-move').setAttribute('aria-pressed', String(activate && movingId !== undefined))
  viewport.classList.toggle('placing-sandbag', activate)
  announce(
    activate
      ? '土のうを置く道の上をクリック・タップしてください。ドラッグは地図移動、Escで取消。'
      : '土のうの配置を取り消しました。'
  )
}
$('sandbag-place').onclick = () => beginSandbagPlacement()
$('sandbag-move').onclick = () => {
  if (selectedSandbagId !== null) beginSandbagPlacement(selectedSandbagId)
}
function removeSelectedSandbag(id: number) {
  if (!preparing()) return
  const bag = engine.state.sandbags.find((bag) => bag.id === id)
  if (!bag) return
  const refund = bag.hp === bag.maxHp
  if (!engine.removeSandbag(id)) return
  persist()
  clearPlacementModes()
  announce(refund ? '無傷の土のうを撤去し、在庫へ戻しました。' : '損傷した土のうを撤去しました。在庫には戻りません。')
}
$('sandbag-remove').onclick = () => {
  if (!preparing()) return
  const bag = engine.state.sandbags.find((bag) => bag.id === selectedSandbagId)
  if (!bag) return
  if (bag.hp === bag.maxHp) removeSelectedSandbag(bag.id)
  else {
    pendingSandbagRemoval = bag.id
    $('sandbag-confirm-detail').textContent =
      `残りHP ${Math.ceil(bag.hp)} / ${bag.maxHp}。撤去するとこの土のうは失われ、在庫には戻りません。`
    sandbagConfirm.open($('sandbag-remove'))
  }
}
$('sandbag-confirm').addEventListener('cancel', () => {
  pendingSandbagRemoval = null
})
$('sandbag-confirm').addEventListener('close', () => {
  pendingSandbagRemoval = null
})
$('sandbag-cancel-remove').onclick = () => {
  pendingSandbagRemoval = null
  sandbagConfirm.close()
}
$('sandbag-confirm-remove').onclick = () => {
  if (pendingSandbagRemoval !== null) removeSelectedSandbag(pendingSandbagRemoval)
  pendingSandbagRemoval = null
  sandbagConfirm.close()
}
for (const type of ALLY_TYPES) {
  const card = $<HTMLButtonElement>(`unit-${type}`)
  card.onclick = () => {
    if (rosterEligible(type)) announce(`${DEFINITIONS[type].name} · ${DEPLOYMENT_COST} G。ドラッグして配置。`)
  }
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    pickKeyboardUnit(type)
  })
  drag.bind(card, type)
}
$('field').onclick = (event) => {
  if (defenderMoveInput.consumeClick()) {
    event.preventDefault()
    return
  }
  if (assaulting()) {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-unit-id]')
    if (button) selectDefender(Number(button.dataset.unitId))
    return
  }
  if (!preparing() || placingSandbag || placingRoadItem) return
  const gateButton = (event.target as HTMLElement).closest<HTMLElement>('[data-gate]')
  if (gateButton) {
    event.stopPropagation()
    openGatePanel(gateButton)
    return
  }
  const itemButton = (event.target as HTMLElement).closest<HTMLElement>('.road-item-handle')
  if (itemButton) {
    event.stopPropagation()
    clearPlacementModes()
    selectedRoadItemId = Number(itemButton.dataset.roadItemId)
    renderer.setRoadItemSelection(selectedRoadItemId)
    openContext(itemButton)
    announce('道のアイテムを選択しました。移動は残り耐久を保ち、撤去は返金されません。')
    return
  }
  const unitButton = (event.target as HTMLElement).closest<HTMLElement>('[data-unit-id]')
  if (unitButton) {
    event.stopPropagation()
    const id = Number(unitButton.dataset.unitId)
    if (removing) recallDefender(id)
    else selectDefender(id)
    return
  }
  const bagButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.sandbag-handle')
  if (bagButton) {
    event.stopPropagation()
    clearPlacementModes()
    selectedSandbagId = Number(bagButton.dataset.sandbag)
    renderer.setSandbagSelection(selectedSandbagId)
    openContext(bagButton)
    announce('土のうを選択しました。移動は残りHPを保ちます。損傷した土のうの撤去は在庫に戻りません。')
    return
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.placement')
  if (!button) return
  event.stopPropagation()
  const target = { slotId: Number(button.dataset.slot) }
  const occupant = engine.state.units.find((unit) => unit.owner === 'player' && unit.slotId === target.slotId)
  if (occupant && !removing) {
    selectDefender(occupant.id)
    return
  }
  if (removing && paidRoster() && occupant) return recallDefender(occupant.id)
  if (removing) {
    engine.remove(target.slotId)
    persist()
    announce('仲間を撤去しました。')
    selectedSlot = null
  }
}
$('field').addEventListener('pointerover', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.placement')
  if (button) dropTarget = { slotId: Number(button.dataset.slot) }
})
$('field').addEventListener('pointerout', (event) => {
  if ((event.target as HTMLElement).closest('.placement')) dropTarget = null
})
$('field').addEventListener('focusin', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.placement')
  if (button) selectedSlot = { slotId: Number(button.dataset.slot) }
})
window.addEventListener('keydown', (event) => {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName) ||
    (event.target as HTMLElement).isContentEditable ||
    document.querySelector('dialog[open]')
  )
    return
  if (event.key === 'Escape') {
    selectedSlot = null
    if (!$('selection-context').hidden) closeContext()
    else clearPlacementModes()
    closeTrays(true)
    return
  }
  if (/^[0-9]$/.test(event.key) && preparing()) pickKeyboardUnit(ALLY_TYPES[(Number(event.key) + 9) % 10])
  if (!viewport.contains(event.target as Node)) return
  const pans: Record<string, number[]> = {
    ArrowLeft: [-160, 0],
    ArrowRight: [160, 0],
    ArrowUp: [0, -160],
    ArrowDown: [0, 160]
  }
  if (preparing() && placingRoadItem && event.shiftKey && pans[event.key]) {
    event.preventDefault()
    keyboardPoint ??= {
      x: (viewport.scrollLeft + viewport.clientWidth / 2) / mapScale,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / mapScale
    }
    const [dx, dy] = pans[event.key],
      field = fieldFor(engine.state)
    keyboardPoint = {
      x: Math.max(0, Math.min(field.width, keyboardPoint.x + dx / 10)),
      y: Math.max(0, Math.min(field.height, keyboardPoint.y + dy / 10))
    }
    const preview = roadPlacementPreview(keyboardPoint)
    if (preview) announce(`${preview.label} Enterで決定、Escで取消。`)
    return
  }
  if (event.key === 'Enter' && event.target === viewport && preparing() && placingRoadItem) {
    event.preventDefault()
    placeRoadItem(
      keyboardPoint ?? {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / mapScale,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / mapScale
      }
    )
    return
  }
  if (
    (preparing() || (assaulting() && movingDefenderId !== null)) &&
    (keyboardUnitPicked || movingDefenderId !== null) &&
    !placingSandbag &&
    !placingRoadItem &&
    !removing &&
    event.shiftKey &&
    pans[event.key]
  ) {
    event.preventDefault()
    keyboardPoint ??= {
      x: (viewport.scrollLeft + viewport.clientWidth / 2) / mapScale,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / mapScale
    }
    const [dx, dy] = pans[event.key],
      divisor = assaulting() ? 40 : 10
    keyboardPoint = {
      x: Math.max(48, Math.min(fieldFor(engine.state).width - 48, keyboardPoint.x + dx / divisor)),
      y: Math.max(94, Math.min(fieldFor(engine.state).height - DEFENDER_FOOTPRINT, keyboardPoint.y + dy / divisor))
    }
    dropTarget = selectedSlot = keyboardPoint
    announce(
      `${Math.round(keyboardPoint.x)}, ${Math.round(keyboardPoint.y)} · ${groundPlacementLabel(movingDefenderId !== null ? placementPreview(selected, keyboardPoint) : engine.previewPlacement(selected, keyboardPoint))} Enterで${movingDefenderId !== null ? '移動' : '配置'}。`
    )
    return
  }
  if (
    event.key === 'Enter' &&
    event.target === viewport &&
    (preparing() || (assaulting() && movingDefenderId !== null)) &&
    (keyboardUnitPicked || movingDefenderId !== null) &&
    !placingSandbag &&
    !placingRoadItem &&
    !removing
  ) {
    event.preventDefault()
    placeOrMove(
      keyboardPoint ?? {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / mapScale,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / mapScale
      }
    )
    return
  }
  if (pans[event.key]) {
    event.preventDefault()
    const [left, top] = pans[event.key]
    viewport.scrollBy({ left, top, behavior: 'smooth' })
  } else if (event.key === 'Home') {
    event.preventDefault()
    entrance()
  } else if (event.key === 'End') {
    event.preventDefault()
    base()
  }
})
function settings(open: boolean, opener?: HTMLElement) {
  if (open) {
    clearPlacementModes()
    closeTrays()
    upgradePanel.close(false)
    settingsPanel.open(opener)
  } else {
    cancelArtMode()
    settingsPanel.close()
  }
}
$('settings-toggle').onclick = () => settings(!settingsPanel.isOpen, $('settings-toggle'))
$('settings-close').onclick = () => settings(false)
$('launch-settings').onclick = () => settings(true, $('launch-settings'))
$('connection-warning').onclick = () => settings(true, $('connection-warning'))
function updateStart() {
  const offline = engine.ai === rule,
    ready = offline || connected
  $('connection-state').dataset.status = offline ? 'offline' : connected ? 'connected' : 'pending'
  $('connection-fields').hidden = offline
  $('notice').hidden = offline
  $('offline-start').hidden = offline
  $('resume-run').hidden = !pendingRun
  $<HTMLButtonElement>('resume-run').disabled = !pendingRun
  $('resume-run').textContent =
    !offline && (connected || pendingRun?.engine.state.cooldownHold)
      ? 'Jev と保存した遠征を続ける'
      : '保存した遠征をルール AI で続ける'
  $('saved-run-note').textContent = pendingRun
    ? `${FIELDS[pendingRun.engine.state.fieldId].name} · Stage ${String(pendingRun.engine.state.stage).padStart(2, '0')} の遠征を保存しています。閉じていた間の時間は進みません。${pendingRun.progress.economyVersion === 2 ? ' 1体40G・個別強化の遠征です。' : ' この遠征は旧経済ルール（無料配置・ステージごとの上限・種類単位の強化）を維持します。'}${pendingRun.engine.state.battlefieldVersion === 1 ? ' この遠征は旧地形・旧戦闘ルールで継続します。分岐した新しい戦場は新規遠征から利用できます。' : ' 分岐した縦長マップの遠征を続けます。'}${pendingRun.progress.commanderSupportVersion === 1 ? ' Jevモードでは指揮官の支援魔法を利用します。' : ' この保存遠征には新しい指揮官支援を追加しません。'}${pendingRun.engine.state.waveBossPolicy === 1 && stageRules(pendingRun.engine.state.stage, 1).bossType !== stageRules(pendingRun.engine.state.stage, 2).bossType ? ' この進行中ステージのボス枠は保存時の構成を引き継ぎ、次のステージから新しい構成になります。' : ''}`
    : loadedCampaign.issue && replaceStoredRun
      ? '保存した遠征を読み込めませんでした。元データは変更していません。新しく始めると置き換えます。'
      : showLegacyMigration
        ? `以前に加入した仲間を引き継ぎました。旧版は遠征を保存していないため、Lv.1・${STARTING_GOLD}Gから出発します。`
        : '雇用済みの仲間と遠征を、このブラウザーに保存します。'
  $('start').textContent = offline ? 'このフィールドで出発 →' : 'Jev と遠征に出発 →'
  $('launch-status').dataset.status = ready ? 'ready' : 'pending'
  $<HTMLButtonElement>('start').disabled = !ready
  $('launch-status').textContent =
    engine.ai === rule
      ? 'ルール AI · 接続不要ですぐに遊べます'
      : connected
        ? 'Jev · MoQ 接続済み。Pipecat botの起動も確認してください'
        : 'Jev を使うには MoQ に接続してください。ルール AI なら接続不要です'
}
function startFreshCampaign() {
  const layoutRevision = newCampaignLayoutRevision(newLayoutBundle)
  if ((engine.state.layoutRevision === undefined ? 1 : engine.state.layoutRevision) !== layoutRevision) {
    const fieldId = engine.state.fieldId,
      historyEnabled = engine.state.historyEnabled
    engine.invalidateAI()
    connection?.cancelPending()
    engine = new GameEngine(engine.ai, save, undefined, undefined, undefined, DRAGON_BREATH_MOUTHS, 2, layoutRevision)
    engine.setHistoryEnabled(historyEnabled)
    engine.selectField(fieldId)
    renderer.cancelArtSwitch()
    clearPlacementModes()
    renderer.render(engine.state, null, false, selected)
    updateField()
  }
  showLegacyMigration = false
  pendingRun = null
  replaceStoredRun = false
  started = true
  document.querySelector('.game-layout')!.removeAttribute('inert')
  settingsPanel.close(false)
  launchDialog.close()
  entrance()
  viewport.focus({ preventScroll: true })
  announce(`${STARTING_GOLD}Gから出発。仲間をドラッグして配置。1体40G。`)
  persist()
}
$('start').onclick = () => {
  if (engine.ai !== rule && !connected) return
  if (replaceStoredRun) {
    pendingSaveAction = 'new'
    $('save-confirm-title').textContent = '保存中の遠征を置き換えますか？'
    $('save-confirm-detail').textContent =
      `加入済みの仲間は残ります。保存中の遠征の配置・レベル・資金・装備・道のアイテム・門の強化・土のうは失われ、全員Lv.1・${STARTING_GOLD}Gから始めます。`
    saveConfirm.open($('start'))
  } else startFreshCampaign()
}
$('resume-run').onclick = () => {
  if (!pendingRun) return
  if (engine.ai !== rule && !connected && !pendingRun.engine.state.cooldownHold) {
    $<HTMLSelectElement>('mode').value = 'rule'
    configureAI()
  }
  const previous = structuredClone(save)
  replaceProgress(resumeProgress(loadedCampaign.profile, pendingRun.progress))
  const restored = GameEngine.fromCheckpoint(pendingRun.engine, engine.ai, save, undefined, DRAGON_BREATH_MOUTHS)
  if (!restored) {
    replaceProgress(previous)
    $('saved-run-note').textContent = 'この遠征は再開できません。元の保存は変更していません。'
    return
  }
  battleClock?.stop()
  engine.invalidateAI()
  connection?.cancelPending()
  engine = restored
  showLegacyMigration = false
  pendingRun = null
  replaceStoredRun = false
  started = true
  rewarded = false
  outcomeSaved = !!engine.state.result
  discardedClockMs = 0
  resumedAfterSuspension = false
  clearPlacementModes()
  selectedSlot = null
  $<HTMLSelectElement>('history-mode').value = engine.state.historyEnabled ? 'on' : 'off'
  document.querySelector('.game-layout')!.removeAttribute('inert')
  settingsPanel.close(false)
  launchDialog.close()
  updateField()
  updateStart()
  uiTick = -Infinity
  entrance()
  viewport.focus({ preventScroll: true })
  persist()
  if (engine.state.phase === 'assault') battleClock?.start()
}
$('offline-start').onclick = () => {
  $<HTMLSelectElement>('mode').value = 'rule'
  configureAI()
  $('start').click()
}

function spendingReason(cost: number): string {
  return save.gold < cost
    ? `あと ${cost - save.gold} G 必要です`
    : '配置中の生存者がいないため、再配置用の40Gを残してください'
}
function updateSelectionContext() {
  const unit = selectedDefender(),
    bag = engine.state.sandbags.find((bag) => bag.id === selectedSandbagId),
    item = engine.state.fortifications?.items.find((item) => item.id === selectedRoadItemId)
  const visible =
    (preparing() || (assaulting() && !!unit && unit.slotId !== undefined)) &&
    !placingSandbag &&
    !placingRoadItem &&
    ((!!unit && unit.hp > 0) || !!bag || !!item)
  $('selection-context').hidden = !visible
  for (const kind of ['weapon', 'armor'])
    $<HTMLButtonElement>(`equipment-${kind}`).disabled = !visible || !unit || !paidRoster()
  for (const action of ['move', 'remove']) $<HTMLButtonElement>(`road-item-${action}`).disabled = !visible || !item
  for (const action of ['upgrade', 'move', 'recall'])
    $<HTMLButtonElement>(`unit-${action}`).disabled = !visible || !unit
  if (!visible) return
  $('defender-actions').hidden = !unit
  $('sandbag-actions').hidden = !bag
  $('road-item-actions').hidden = !item
  $('equipment-actions').hidden = !preparing() || !unit || !paidRoster()
  if (unit) {
    const reserve = unit.slotId === undefined,
      level = defenderLevel(unit, save),
      cost = upgradeCost(level),
      canUpgrade = paidRoster() && Number.isFinite(cost) && canSpendOnRoster(save, cost, engine.state)
    $('unit-action-name').textContent = DEFINITIONS[unit.type].name
    $('unit-action-status').textContent = `↑${level} · ♥ ${Math.ceil(unit.hp)} / ${Math.ceil(unit.maxHp)}`
    if (assaulting()) {
      const remaining = engine.canRelocateDefender(unit.id) ? 1 : 0,
        relocating = !!unit.battleRelocation?.destination
      $('unit-action-status').textContent += relocating ? ' · ↝' : ` · ↦ ${remaining}`
      $('unit-upgrade').hidden = $('unit-recall').hidden = true
      $('unit-move').hidden = false
      $('unit-move').textContent = movingDefenderId === unit.id ? '×' : `↦ ${remaining}`
      $('unit-move').setAttribute('aria-pressed', String(movingDefenderId === unit.id))
      $('unit-move').setAttribute('aria-label', `戦闘移動 残り${remaining}回`)
      $<HTMLButtonElement>('unit-move').disabled = !remaining
      $('unit-action-hint').textContent =
        movingDefenderId === unit.id
          ? 'Shift＋矢印で移動先、Enterで決定、Escで取消。'
          : relocating
            ? '移動中'
            : DEFINITIONS[unit.type].leash === 0
              ? '固定'
              : remaining
                ? '範囲内へドラッグ · 1回'
                : '使用済み'
      return
    }
    $('unit-recall').hidden = false
    if (paidRoster()) {
      const equipment = unit.equipment,
        canEquip = canSpendOnRoster(save, FORTIFICATIONS.equipmentCost, engine.state)
      $('equipment-current').textContent = equipment ? equipmentNames[equipment] : ''
      for (const kind of ['weapon', 'armor'] as const) {
        const current = equipment === kind
        $<HTMLButtonElement>(`equipment-${kind}`).disabled = !canEquip || current
        $(`equipment-${kind}`).setAttribute('aria-pressed', String(current))
        $(`equipment-${kind}`).setAttribute(
          'aria-label',
          `${equipmentNames[kind]} ${equipmentEffect(kind, unit.type)} · ${current ? '装備中' : `${FORTIFICATIONS.equipmentCost} G${equipment ? 'で交換・元の装備は返金なし' : 'で購入'}`}`
        )
        $(`equipment-${kind}`).setAttribute(
          'title',
          `${equipmentNames[kind]} ${equipmentEffect(kind, unit.type)} · ${current ? '装備中' : `${FORTIFICATIONS.equipmentCost} G`}`
        )
        $(`equipment-${kind}-state`).textContent = current ? '✓' : `◈${FORTIFICATIONS.equipmentCost}`
      }
      $('equipment-hint').textContent = !canEquip
        ? spendingReason(FORTIFICATIONS.equipmentCost)
        : equipment
          ? '交換は60G。元の装備は失われ、返金されません。HPの割合を保ちます。'
          : 'この仲間だけに適用。HPの割合を保ち、回復はしません。'
    }
    $('unit-upgrade').hidden = !paidRoster()
    $<HTMLButtonElement>('unit-upgrade').disabled = !canUpgrade
    $('unit-upgrade').textContent = Number.isFinite(cost) ? `↑${level + 1} · ◈${cost}` : 'MAX'
    $('unit-upgrade').setAttribute(
      'aria-label',
      Number.isFinite(cost) ? `レベル${level + 1}へ強化 · ${cost} G` : '最大レベル'
    )
    $('unit-upgrade').title = $('unit-upgrade').getAttribute('aria-label')!
    $('unit-move').setAttribute('aria-label', '仲間を移動')
    $('unit-move').hidden = !paidRoster()
    $('unit-move').textContent = movingDefenderId === unit.id ? '×' : '✥'
    $('unit-move').setAttribute('aria-pressed', String(movingDefenderId === unit.id))
    $<HTMLButtonElement>('unit-move').disabled = reserve && save.gold < DEPLOYMENT_COST
    $<HTMLButtonElement>('unit-recall').disabled = reserve
    $('unit-recall').textContent = paidRoster() ? '↩ +40' : '×'
    const recallLabel = paidRoster() ? '控えに戻す · 40 G返金' : '仲間を撤去'
    $('unit-recall').setAttribute('aria-label', recallLabel)
    $('unit-recall').title = recallLabel
    $('unit-action-hint').textContent =
      movingDefenderId === unit.id
        ? 'Shift＋矢印で移動先を選び、Enterで決定。Escで取消。'
        : !paidRoster()
          ? 'この旧遠征の強化は「雇用・強化」で種類ごとに行います。'
          : !canUpgrade && Number.isFinite(cost)
            ? spendingReason(cost)
            : unit.hasFought
              ? '点線の紫の円内で移動できます。控えに戻しても範囲・HP・レベルは変わりません。'
              : '初めて戦うまでは自由に移動できます。強化や控えへの移動でHPは回復しません。'
  } else if (bag) {
    $('unit-action-name').textContent = '土のう'
    $('unit-action-status').textContent = `HP ${Math.ceil(bag.hp)} / ${bag.maxHp}`
    $('unit-action-hint').textContent =
      bag.hp === bag.maxHp
        ? '移動はHPを保ちます。無傷のまま撤去すると在庫へ戻ります。'
        : '移動はHPを保ちます。撤去すると失われ、在庫には戻りません。'
  } else if (item) {
    $('unit-action-name').textContent = roadItemNames[item.kind]
    $('unit-action-status').textContent = roadItemStatus(item)
    $('unit-action-hint').textContent = '準備中の移動は無料。残り耐久を保ちます。撤去すると失われ、返金されません。'
    $('road-item-move').setAttribute('aria-pressed', String(movingRoadItemId === item.id))
    $('road-item-move').textContent = movingRoadItemId === item.id ? '×' : '✥'
    $<HTMLButtonElement>('road-item-move').disabled = !preparing()
    $<HTMLButtonElement>('road-item-remove').disabled = !preparing()
  }
}
function updateFortificationControls() {
  const available = paidRoster(),
    items = engine.state.fortifications?.items ?? [],
    gate = engine.state.fortifications?.gate
  $('paid-item-status').hidden = !available
  $('gate-toggle').hidden = !available
  $<HTMLButtonElement>('gate-toggle').disabled = !preparing() || !available
  if (gate) $('gate-levels').textContent = `${gate.cannonLevel} / ${gate.armorLevel}`
  for (const kind of ['spike', 'mud'] as const) {
    const cost = FORTIFICATIONS[kind].cost,
      enough = canSpendOnRoster(save, cost, engine.state),
      full = items.length >= FORTIFICATIONS.maxItems,
      button = $<HTMLButtonElement>(`item-${kind}`),
      reason = !preparing()
        ? '準備中だけ購入できます'
        : full
          ? `道のアイテムは合計${FORTIFICATIONS.maxItems}個までです`
          : !enough
            ? spendingReason(cost)
            : kind === 'spike'
              ? 'HP40・敵を止めて接触反撃8'
              : '6回・敵の速度を65%に2秒間'
    button.hidden = !available
    button.disabled = !available || !preparing() || !enough || full
    button.setAttribute('aria-pressed', String(placingRoadItem === kind && movingRoadItemId === undefined))
    button.setAttribute('aria-label', `${roadItemNames[kind]} · ${cost} G · ${reason}`)
    button.title = reason
    button.dataset.disabledReason = button.disabled ? reason : ''
    $(`item-${kind}-count`).textContent = `◈${cost}`
  }
  $('paid-item-status').textContent = (['spike', 'mud'] as const)
    .map((kind) => {
      const reason = $(`item-${kind}`).dataset.disabledReason
      return reason ? `${roadItemNames[kind]}: ${reason}` : ''
    })
    .filter(Boolean)
    .join(' · ')
  for (const kind of ['cannon', 'armor'] as const) {
    const level = kind === 'cannon' ? (gate?.cannonLevel ?? 0) : (gate?.armorLevel ?? 0),
      details = gateUpgradePresentation(kind, level),
      reason = !available
        ? 'この旧遠征では購入できません'
        : !preparing()
          ? '準備中だけ強化できます'
          : details.cost === undefined
            ? '最大レベルです'
            : !canSpendOnRoster(save, details.cost, engine.state)
              ? spendingReason(details.cost)
              : '購入するとこのメニューを閉じます'
    $(`gate-${kind}-level`).textContent = `${details.name} Lv.${level} / 3`
    $(`gate-${kind}-effect`).textContent = details.effect
    $(`gate-${kind}-upgrade`).textContent = details.label
    $(`gate-${kind}-reason`).textContent = reason
    $<HTMLButtonElement>(`gate-${kind}-upgrade`).disabled =
      !available || !preparing() || details.cost === undefined || !canSpendOnRoster(save, details.cost, engine.state)
  }
}
function buyEquipment(id: number, equipment: Equipment) {
  if (!preparing() || !paidRoster() || !engine.equipDefender(id, equipment)) return
  persist()
  selectDefender(id, false)
  updateFortificationControls()
  announce(
    `${equipmentNames[equipment]}を60Gで装備しました。${equipmentEffect(equipment, findDefender(engine.state, id)?.type)}。残りHPの割合を保ち、回復はしません。`
  )
}
for (const equipment of ['weapon', 'armor'] as const)
  $(`equipment-${equipment}`).onclick = () => {
    const unit = selectedDefender()
    if (
      !preparing() ||
      !paidRoster() ||
      !unit ||
      unit.equipment === equipment ||
      !canSpendOnRoster(save, FORTIFICATIONS.equipmentCost, engine.state) ||
      document.querySelector('dialog[open]')
    )
      return
    if (!unit.equipment) return buyEquipment(unit.id, equipment)
    cancelPlacementGestures()
    pendingFortification = { kind: 'equipment', id: unit.id, previous: unit.equipment, equipment }
    $('fortification-confirm-title').textContent = `${DEFINITIONS[unit.type].name}の装備を交換しますか？`
    $('fortification-confirm-detail').textContent = equipmentReplacementDetail(unit.equipment, equipment, unit.type)
    $('fortification-confirm-accept').textContent = '60 Gで交換 · 元の装備は返金なし'
    fortificationConfirm.open($(`equipment-${equipment}`))
  }
for (const event of ['cancel', 'close'])
  $('fortification-confirm').addEventListener(event, () => {
    pendingFortification = null
  })
$('fortification-confirm-cancel').onclick = () => {
  pendingFortification = null
  fortificationConfirm.close()
}
$('fortification-confirm-accept').onclick = () => {
  const action = pendingFortification
  pendingFortification = null
  fortificationConfirm.close()
  if (!action || !preparing() || !paidRoster()) return
  if (action.kind === 'equipment') {
    if (findDefender(engine.state, action.id)?.equipment === action.previous) buyEquipment(action.id, action.equipment)
  } else if (engine.removeRoadItem(action.id)) {
    clearPlacementModes()
    persist()
    updateFortificationControls()
    announce('道のアイテムを撤去しました。返金はありません。')
  }
}
function openGatePanel(opener: HTMLElement) {
  if (!preparing() || !paidRoster()) return
  clearPlacementModes()
  closeTrays()
  settingsPanel.close(false)
  upgradePanel.close(false)
  updateFortificationControls()
  gatePanel.open(opener === $('gate-toggle') ? $('items-toggle') : opener)
  renderer.setGateSelected(true)
}
$('gate-toggle').onclick = () => openGatePanel($('gate-toggle'))
$('gate-close').onclick = () => {
  gatePanel.close()
  renderer.setGateSelected(false)
}
for (const event of ['cancel', 'close']) $('gate-panel').addEventListener(event, () => renderer.setGateSelected(false))
for (const kind of ['cannon', 'armor'] as const)
  $(`gate-${kind}-upgrade`).onclick = () => {
    if (!gatePanel.isOpen || !preparing() || !paidRoster() || !engine.upgradeGate(kind)) return
    gatePanel.close()
    renderer.setGateSelected(false)
    persist()
    updateFortificationControls()
    announce(
      `${kind === 'cannon' ? '門の大砲' : '門の装甲'}を強化しました。門のHPは回復しません。次のステージへ引き継ぎます。`
    )
  }
function recallDefender(id: number) {
  const unit = findDefender(engine.state, id)
  if (!preparing() || !unit) return
  if (paidRoster()) {
    if (!engine.recallDefender(id)) return
  } else {
    if (unit.slotId === undefined) return
    engine.remove(unit.slotId)
  }
  persist()
  clearPlacementModes()
  closeTrays()
  updateRosterControls()
  announce(paidRoster() ? '40Gを返金し、同じ仲間を控えへ戻しました。HPとレベルは保たれます。' : '仲間を撤去しました。')
}
$('selection-close').onclick = closeContext
$('unit-recall').onclick = () => {
  if (selectedDefenderId !== null) recallDefender(selectedDefenderId)
}
$('unit-upgrade').onclick = () => {
  if (!preparing() || selectedDefenderId === null || !engine.upgradeDefender(selectedDefenderId)) return
  persist()
  updateSelectionContext()
  announce('選択中の仲間を強化しました。残りHPの割合を保ち、回復はしません。')
}
$('unit-move').onclick = () => {
  const unit = selectedDefender()
  if (!unit || (!(preparing() && paidRoster()) && !(assaulting() && engine.canRelocateDefender(unit.id)))) return
  const activate = movingDefenderId !== unit.id
  selectDefender(unit.id)
  movingDefenderId = activate ? unit.id : null
  keyboardPoint = activate ? { x: unit.homeX, y: unit.homeY } : null
  dropTarget = keyboardPoint
  updateSelectionContext()
  if (activate) {
    closeTrays()
    viewport.focus({ preventScroll: true })
  }
  announce(activate ? 'Shift＋矢印で移動先を選び、Enterで決定。' : '移動を取り消しました。')
}
window.addEventListener('blur', () => {
  clearPlacementModes()
  selectedSlot = null
})
viewport.addEventListener('scroll', () => {
  defenderMoveInput.cancel()
  drag.cancel()
})
function setSaveFeedback(saved: boolean, message?: string) {
  $('save-state').textContent =
    message ??
    (saved
      ? `Stage ${String(engine.state.stage).padStart(2, '0')} を保存しました`
      : '保存できませんでした。現在のゲームは続けられます。ブラウザーのストレージ設定を確認してください。')
  $('settings-toggle').dataset.saveState = saved ? 'saved' : 'error'
  $('settings-label').textContent = saved ? '接続・AI' : '接続・AI · 保存エラー'
  $('settings-toggle').title = saved ? '接続・AI・保存の設定' : $('save-state').textContent!
  if (!saved) {
    announce($('save-state').textContent!)
    if (launchDialog.open)
      $('saved-run-note').textContent =
        message ?? '保存の更新に失敗しました。再読み込みすると以前の遠征に戻る場合があります。'
  }
}
function persist(): boolean {
  if (!started) return false
  const snapshot = engine.exportCheckpoint()
  const serialized = snapshot ? JSON.stringify(snapshot) : ''
  if (serialized && serialized === lastSavedCheckpoint) {
    lastCheckpointAt = performance.now()
    setSaveFeedback(true)
    return true
  }
  const saved = !!snapshot && saveCampaignCheckpoint(save, snapshot, validateCampaignCheckpoint)
  if (saved) lastSavedCheckpoint = serialized
  lastCheckpointAt = performance.now()
  setSaveFeedback(saved)
  return saved
}
function autosave() {
  if (started && performance.now() - lastCheckpointAt >= 5000) persist()
}
$('save-now').onclick = () => persist()
$('save-reset').onclick = () => {
  pendingSaveAction = 'reset'
  $('save-confirm-title').textContent = '保存データを初期化しますか？'
  $('save-confirm-detail').textContent =
    '雇用済みの仲間と保存中・進行中の遠征をすべて失います。この操作は取り消せません。接続設定やほかのアプリのデータは変更しません。'
  saveConfirm.open($('save-reset'))
}
$('save-confirm-cancel').onclick = () => {
  pendingSaveAction = null
  saveConfirm.close()
}
$('save-confirm').addEventListener('cancel', () => {
  pendingSaveAction = null
})
$('save-confirm-accept').onclick = () => {
  const action = pendingSaveAction
  pendingSaveAction = null
  if (action === 'new') {
    saveConfirm.close(false)
    startFreshCampaign()
  }
  if (action === 'reset') {
    if (!saveProfileWithoutRun(freshProfile())) {
      $('save-confirm-detail').textContent = '保存データを変更できませんでした。初期化は行っていません。'
      pendingSaveAction = 'reset'
      return
    }
    let legacyCleared = true
    try {
      localStorage.removeItem('tower-jev-v2')
    } catch {
      legacyCleared = false
    }
    showLegacyMigration = false
    lastSavedCheckpoint = ''
    battleClock?.stop()
    engine.invalidateAI()
    connection?.cancelPending()
    replaceProgress(freshRunFromProfile(freshProfile(), 2, 1))
    engine = new GameEngine(engine.ai, save, undefined, undefined, undefined, DRAGON_BREATH_MOUTHS, 2, 1)
    pendingRun = null
    replaceStoredRun = false
    started = rewarded = outcomeSaved = false
    clearPlacementModes()
    selectedSlot = null
    selected = 'soldier'
    saveConfirm.close(false)
    settingsPanel.close(false)
    upgradePanel.close(false)
    $<HTMLDialogElement>('result').close()
    document.querySelector('.game-layout')!.setAttribute('inert', '')
    if (!launchDialog.open) launchDialog.showModal()
    updateField()
    updateStart()
    document.querySelector<HTMLButtonElement>('[data-field][aria-pressed="true"]')!.focus({ preventScroll: true })
    setSaveFeedback(
      legacyCleared,
      legacyCleared ? '保存データを初期化しました' : '現在の保存は初期化しましたが、旧版の保存は削除できませんでした。'
    )
  }
}

function updateRosterControls() {
  const defenders = engine.state.units.filter((unit) => unit.owner === 'player').length
  const reserveCount = engine.state.reserveUnits?.length ?? 0
  $('count').textContent = `${defenders} / 10`
  $('reserve-count').textContent = heldDefenderId !== null ? '+40' : String(reserveCount)
  $('reserve-count').hidden = heldDefenderId === null && reserveCount === 0
  let availableCount = 0
  for (const type of ALLY_TYPES) {
    const card = $<HTMLButtonElement>(`unit-${type}`),
      unit = retainedDefenders(engine.state).find((unit) => unit.type === type),
      eligible = rosterEligible(type),
      level = unit ? defenderLevel(unit, save) : paidRoster() ? 1 : save.unitLevels[type]
    card.hidden = !eligible
    card.disabled = !eligible
    if (eligible) availableCount++
    card.dataset.rosterState = unit?.slotId === undefined && unit ? 'reserve' : unit ? 'deployed' : 'available'
    card.classList.toggle('selected', keyboardUnitPicked && selected === type)
    card.setAttribute('aria-pressed', String(keyboardUnitPicked && selected === type))
    const label = `${DEFINITIONS[type].name} · Lv.${level} · ${paidRoster() ? DEPLOYMENT_COST : 0} G${unit ? ` · HP ${Math.ceil(unit.hp)}/${Math.ceil(unit.maxHp)}` : ''}`
    card.setAttribute('aria-label', `${label} · ドラッグして配置`)
    card.title = label
    $(`level-${type}`).textContent = `↑${level} · ◈${paidRoster() ? DEPLOYMENT_COST : 0}`
  }
  const tooltip =
    heldDefenderId !== null
      ? '控えに戻す · 40 G返金'
      : availableCount
        ? `仲間 ${availableCount} · 控え ${reserveCount}`
        : '配置できる仲間はいません'
  $('deck-toggle').title = tooltip
  $('deck-toggle').setAttribute('aria-label', heldDefenderId !== null ? tooltip : `${tooltip}。仲間・控えを開く`)
  $('unit-tray').setAttribute('aria-label', tooltip)
  const scoutButton = $<HTMLButtonElement>('scout')
  const allOwned = scoutCandidates(save).length === 0
  scoutButton.disabled = !preparing() || $<HTMLDialogElement>('scout-result').open || !scoutAllowed(save, engine.state)
  scoutButton.title = allOwned
    ? 'すべての仲間が加入済み'
    : !scoutAllowed(save, engine.state)
      ? spendingReason(SCOUT_COST)
      : `仲間をスカウト · ${SCOUT_COST} G`
  scoutButton.setAttribute('aria-label', scoutButton.title)
  $('upgrade').hidden = paidRoster()
  $<HTMLButtonElement>('upgrade').disabled = !preparing()
}
$('scout').onclick = () => {
  const dialog = $<HTMLDialogElement>('scout-result')
  if (!preparing() || dialog.open || document.querySelector('dialog[open]')) return
  const type = scout(save, Math.random, engine.state)
  if (!type) return
  clearPlacementModes()
  closeTrays()
  $('scout-name').textContent = DEFINITIONS[type].name
  $<HTMLImageElement>('scout-portrait').src = displayPortrait(type) ?? ''
  persist()
  dialog.showModal()
  $('scout-close').focus({ preventScroll: true })
  updateRosterControls()
  $('gold').textContent = `${save.gold} G`
  announce(`${DEFINITIONS[type].name}が加入しました。`)
}
function closeScoutResult() {
  $<HTMLDialogElement>('scout-result').close()
  updateRosterControls()
  $('deck-toggle').focus({ preventScroll: true })
}
$('scout-close').onclick = closeScoutResult
$('scout-result').addEventListener('cancel', (event) => {
  event.preventDefault()
  closeScoutResult()
})
function showUpgrades(focusType?: AllyType) {
  $('shop-gold').textContent = `${save.gold} G`
  $('gold').textContent = `${save.gold} G`
  $('upgrades').replaceChildren()
  $('upgrade-title').textContent = '仲間の強化'
  $('upgrade-close').setAttribute('aria-label', '強化を閉じる')
  $('shop-intro').textContent = ''
  $('shop-footnote').textContent = ''
  if (paidRoster()) return
  for (const type of availableAllies(save, engine.state.stage)) {
    const row = document.createElement('div'),
      portrait = document.createElement('img'),
      button = document.createElement('button'),
      level = save.unitLevels[type],
      cost = upgradeCost(level)
    row.className = 'upgrade-row'
    row.id = `shop-${type}`
    row.tabIndex = -1
    portrait.src = displayPortrait(type) ?? ''
    portrait.alt = DEFINITIONS[type].name
    button.textContent = Number.isFinite(cost) ? `↑${level + 1} · ◈${cost}` : 'MAX'
    button.setAttribute('aria-label', `${DEFINITIONS[type].name}を強化 ${cost} G`)
    button.disabled = !preparing() || !Number.isFinite(cost) || save.gold < cost
    button.onclick = () => {
      if (!preparing() || !upgrade(save, type, engine.state.stage)) return
      engine.refreshDefenders()
      persist()
      showUpgrades(type)
      announce(`${DEFINITIONS[type].name}を強化しました。`)
    }
    row.append(portrait, button)
    $('upgrades').append(row)
  }
  if (focusType) $(`shop-${focusType}`).focus({ preventScroll: true })
}
$('upgrade').onclick = () => {
  if (!preparing() || paidRoster()) return
  clearPlacementModes()
  closeTrays()
  settingsPanel.close(false)
  showUpgrades()
  upgradePanel.open($('deck-toggle'))
}
$('upgrade-close').onclick = () => upgradePanel.close()
$('assault').onclick = () => {
  if (!preparing()) return
  if (!battleClock || clockFailed) {
    announce('戦闘クロックを開始できません。ページを再読み込みしてください。')
    return
  }
  if (engine.ai !== rule && !connected) {
    settings(true)
    announce('Jev の接続を確認するか、ルール AI を選んでください。')
    return
  }
  clearPlacementModes()
  if (engine.startAssault()) {
    discardedClockMs = 0
    resumedAfterSuspension = false
    battleClock.start()
    persist()
    removing = false
    upgradePanel.close(false)
    announce(`ステージ${engine.state.stage}の襲撃が始まりました。地図を動かして仲間を見守ろう。`)
  }
}
$('next').onclick = () => {
  battleClock?.stop()
  connection?.cancelPending()
  if (engine.nextStage()) {
    clearPlacementModes()
    rewarded = false
    outcomeSaved = false
    selectedSlot = null
    $<HTMLDialogElement>('result').close()
    announce(
      paidRoster()
        ? `ステージ${engine.state.stage}へ。配置中・控えの仲間と拠点が全回復しました。配置40G・各種類1体、移動は無料です。`
        : `ステージ${engine.state.stage}は合計${engine.state.stage}体まで配置できます。倒れた仲間も復活し、仲間と拠点は全回復しました。`
    )
    entrance()
    viewport.focus({ preventScroll: true })
    persist()
  }
}
$('retry').onclick = () => {
  battleClock?.stop()
  discardedClockMs = 0
  resumedAfterSuspension = false
  clearPlacementModes()
  engine.invalidateAI()
  connection?.cancelPending()
  const fieldId = engine.state.fieldId
  startNewRun(save, 2, 1)
  const resetSaved = saveProfileWithoutRun(profileFromSave(save))
  showLegacyMigration = false
  lastSavedCheckpoint = ''
  pendingRun = null
  replaceStoredRun = false
  engine = new GameEngine(engine.ai, save, undefined, undefined, undefined, DRAGON_BREATH_MOUTHS, 2, 1)
  engine.setHistoryEnabled($<HTMLSelectElement>('history-mode').value === 'on')
  engine.selectField(fieldId)
  started = false
  document.querySelector('.game-layout')!.setAttribute('inert', '')
  rewarded = false
  outcomeSaved = false
  selected = 'soldier'
  selectedSlot = null
  removing = false
  $<HTMLDialogElement>('result').close()
  settingsPanel.close(false)
  upgradePanel.close(false)
  sandbagConfirm.close(false)
  launchDialog.showModal()
  updateField()
  updateStart()
  setSaveFeedback(
    resetSaved,
    resetSaved ? `新しい遠征はLv.1・${STARTING_GOLD}Gから始まります。加入済みの仲間は保存しました。` : undefined
  )
  document.querySelector<HTMLButtonElement>(`[data-field="${fieldId}"]`)!.focus()
}
async function connect() {
  if (connecting || connected) return
  connecting = true
  const button = $<HTMLButtonElement>('connect')
  button.disabled = true
  button.textContent = '接続しています…'
  $('settings').setAttribute('aria-busy', 'true')
  $<HTMLInputElement>('relay').disabled = $<HTMLInputElement>('room').disabled = true
  $('notice').textContent = 'MoQ Relay に接続しています…'
  try {
    const { JevConnection } = await import('./network/JevConnection')
    connection?.cancelPending()
    connection = new JevConnection(
      $<HTMLInputElement>('room').value.trim() || 'mossvale',
      (status) => {
        $('notice').textContent = status
        $('connection-warning').textContent = status
        $('connection-warning').hidden = engine.ai === rule || !/エラー|未接続|タイムアウト|切断/.test(status)
      },
      () => {
        connected = false
        button.textContent = '再接続には再読み込みが必要です'
        updateStart()
        $('notice').textContent = 'MoQ が切断されました。再読み込みで再接続、またはルール AI に切り替えられます。'
      }
    )
    await connection.connect($<HTMLInputElement>('relay').value)
    connected = true
    button.textContent = 'MoQ 接続済み'
    $<HTMLInputElement>('relay').disabled = $<HTMLInputElement>('room').disabled = true
  } catch (error) {
    $('notice').textContent = `接続エラー: ${String(error)}。ルール AI ではそのまま遊べます。`
    connection = undefined
    connected = false
    button.disabled = false
    button.textContent = 'もう一度接続する'
    $<HTMLInputElement>('relay').disabled = $<HTMLInputElement>('room').disabled = false
  } finally {
    connecting = false
    $('settings').setAttribute('aria-busy', 'false')
  }
  updateStart()
}
$('connect').onclick = () => void connect()
function configureAI() {
  engine.invalidateAI()
  connection?.cancelPending()
  engine.ai =
    $<HTMLSelectElement>('mode').value === 'jev'
      ? new JevAI(
          (state, context) => connection?.decide(state, context) ?? Promise.resolve(null),
          (state) => connection?.observe(state),
          (state) =>
            connection?.decideSupport(state) ??
            Promise.resolve({ type: 'unavailable', reason: 'not-configured', source: 'connection' }),
          () => connection?.cancelDeployment(),
          undefined,
          () => connection?.cancelPending()
        )
      : rule
  $('ai-mode').textContent = engine.ai === rule ? 'RULE · OFFLINE' : 'JEV 5s · RULE 1s'
  if (engine.ai === rule) $('connection-warning').hidden = true
  updateStart()
}
$<HTMLSelectElement>('art-mode').onchange = () => {
  const mode = $<HTMLSelectElement>('art-mode').value
  if ((started && !preparing()) || (mode !== '2d' && mode !== '3d')) {
    updateArtModeStatus()
    return
  }
  renderer.cancelArtSwitch()
  if (mode !== currentArtMode()) renderer.prepareArtMode(mode, engine.state, trialArts, artBase)
  updateArtModeStatus()
}
$('art-mode-cancel').onclick = cancelArtMode
for (const event of ['cancel', 'close']) $('settings').addEventListener(event, cancelArtMode)
for (const type of ALL_TRIAL_TYPES) {
  $<HTMLSelectElement>(`${type}-art`).onchange = () => {
    const selector = $<HTMLSelectElement>(`${type}-art`)
    if (started && !preparing()) {
      selector.value = trialEnabled[type] ? '3d' : '2d'
      return
    }
    renderer.cancelArtSwitch()
    trialEnabled[type] = selector.value === '3d'
    renderer.setUnitTrial(type, trialEnabled[type] ? trialArts[type] : undefined)
    if (unitTrialOwner(type) === 'player') {
      const portrait = $(`unit-${type}`).querySelector('img')
      if (portrait) portrait.src = displayPortrait(type) ?? ''
    }
    if (upgradePanel.isOpen) showUpgrades()
    const url = new URL(document.baseURI)
    if (trialEnabled[type]) url.searchParams.set(`${type}-art`, '3d')
    else url.searchParams.delete(`${type}-art`)
    window.history?.replaceState(window.history.state, '', url)
    updateArtModeStatus()
    announce(`${DEFINITIONS[type].name}を${trialEnabled[type] ? '3D試用に切り替えました。' : '2D原画に戻しました。'}`)
  }
}
$<HTMLSelectElement>('environment-art').onchange = () => {
  const selector = $<HTMLSelectElement>('environment-art')
  if (started && !preparing()) {
    selector.value = environmentTrialEnabled ? '3d' : '2d'
    return
  }
  renderer.cancelArtSwitch()
  environmentTrialEnabled = selector.value === '3d'
  environmentTrialError = undefined
  const enabled = environmentTrialEnabled,
    request = ++environmentTrialRequest,
    url = new URL(document.baseURI)
  if (enabled) url.searchParams.set('environment-art', '3d')
  else url.searchParams.delete('environment-art')
  window.history?.replaceState(window.history.state, '', url)
  const pending = renderer.setEnvironmentTrial(enabled)
  updateEnvironmentArtStatus()
  updateArtModeStatus()
  void pending.then(
    () => {
      updateEnvironmentArtStatus()
      updateArtModeStatus()
      uiTick = -Infinity
    },
    (error: unknown) => {
      if (environmentTrialRequest !== request) return
      environmentTrialError = error instanceof Error ? error.message : '読み込みに失敗しました。'
      updateEnvironmentArtStatus()
      updateArtModeStatus()
      uiTick = -Infinity
    }
  )
}
$<HTMLSelectElement>('mode').onchange = configureAI
$<HTMLSelectElement>('history-mode').onchange = () => {
  engine.setHistoryEnabled($<HTMLSelectElement>('history-mode').value === 'on')
  persist()
}
updateField()
// An active Jev cooldown hold survives an offline reload unless the user chooses RULE.
if (pendingRun?.engine.state.cooldownHold) $<HTMLSelectElement>('mode').value = 'jev'
configureAI()
launchDialog.showModal()
document.querySelector<HTMLButtonElement>('[data-field][aria-pressed="true"]')!.focus({ preventScroll: true })
function persistOutcome() {
  if (!engine.state.result || outcomeSaved) return
  outcomeSaved = true
  battleClock?.stop()
  connection?.cancelPending()
  persist()
}
function initializeClock() {
  try {
    battleClock = createBattleClock({
      step: (dt) => {
        if (!started || engine.state.phase !== 'assault') return false
        engine.update(dt, (state) => renderer.assetsReady(state))
        soundPlayer.setBattle(engine.state.battleId, engine.state.stage)
        soundPlayer.consume(engine.takeCombatSounds(), engine.state.time)
        persistOutcome()
        autosave()
        return engine.state.phase === 'assault'
      },
      discarded: (elapsedMs) => {
        discardedClockMs += elapsedMs
      },
      failed: clockFailure
    })
    clockFailed = false
  } catch {
    clockFailure()
  }
}
function clockFailure() {
  clockFailed = true
  announce('戦闘クロックが停止しました。進行は止まっています。ページを再読み込みしてください。')
}
function requestFrame() {
  if (!animationFrameId && !simulationDisposed && !pageSuspended && document.visibilityState !== 'hidden')
    animationFrameId = requestAnimationFrame(frame)
}
function cancelFrame() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
}
function visibilityChanged() {
  if (document.visibilityState === 'hidden') {
    cancelPlacementGestures()
    persist()
    cancelFrame()
  } else {
    uiTick = -Infinity
    requestFrame()
  }
}
function pageHidden(event: PageTransitionEvent) {
  cancelPlacementGestures()
  cancelArtMode()
  persist()
  pageSuspended = true
  soundPlayer.setEnabled(false)
  cancelFrame()
  battleClock?.dispose()
  battleClock = undefined
  if (!event.persisted) {
    simulationDisposed = true
    newLayoutRequest.abort()
    newLayoutBundle?.dispose()
    newLayoutBundle = undefined
    soundPlayer.destroy()
    document.removeEventListener('pointerdown', unlockSound, { capture: true })
    document.removeEventListener('keydown', unlockSound, { capture: true })
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('pagehide', pageHidden)
    window.removeEventListener('pageshow', pageShown)
  }
}
function pageShown(event: PageTransitionEvent) {
  if (!event.persisted || !pageSuspended || simulationDisposed) return
  pageSuspended = false
  soundPlayer.setEnabled(soundPreferences.enabled)
  resumedAfterSuspension = true
  initializeClock()
  if (started && engine.state.phase === 'assault') battleClock?.start()
  visibilityChanged()
}
let uiTick = 0
function updateDefenderPreview() {
  if (
    (!(paidRoster() && preparing()) && !assaulting()) ||
    placingSandbag ||
    placingRoadItem ||
    removing ||
    document.querySelector('dialog[open]')
  ) {
    renderer.setDefenderPlacementPreview(null)
    return
  }
  const target = dropTarget ?? selectedSlot,
    unit = selectedDefender(),
    type = unit ? (unit.type as AllyType) : selected
  if (assaulting() && (!unit || !engine.canRelocateDefender(unit.id))) {
    renderer.setDefenderPlacementPreview(null)
    return
  }
  const slot =
    target && 'slotId' in target
      ? engine.state.units.find((item) => item.owner === 'player' && item.slotId === target.slotId)
      : undefined
  const point = !target ? null : 'slotId' in target ? (slot ? { x: slot.homeX, y: slot.homeY } : null) : target
  renderer.setDefenderPlacementPreview(
    point
      ? {
          battle: assaulting(),
          placement:
            unit?.slotId !== undefined
              ? assaulting()
                ? engine.previewBattleRelocation(unit.id, point)
                : engine.previewRedeployment(unit.id, point)
              : engine.previewPlacement(type, point),
          type,
          redeploy:
            assaulting() && unit?.battleRelocation
              ? { anchor: unit.battleRelocation.anchor, radius: DEFINITIONS[type].leash }
              : unit?.hasFought && unit.redeployAnchor
                ? { anchor: unit.redeployAnchor, radius: REDEPLOY_RADIUS[type] }
                : undefined
        }
      : null
  )
}
function frame(now: number) {
  animationFrameId = 0
  if (simulationDisposed || pageSuspended || document.visibilityState === 'hidden') return
  persistOutcome()
  autosave()
  const state = engine.state,
    wave = stageRules(state.stage, state.waveBossPolicy)
  if (!preparing() && !assaulting()) {
    clearPlacementModes()
    closeTrays()
  } else if (document.querySelector('dialog[open]')) {
    cancelPlacementGestures()
    stopSandbagPlacement()
    stopRoadItemPlacement()
    movingDefenderId = null
  }
  updateDefenderPreview()
  commitArtMode()
  renderer.setCommanderMode(engine.ai !== rule)
  soundPlayer.setBattle(state.battleId, state.stage)
  renderer.render(
    state,
    placingSandbag || placingRoadItem || document.querySelector('dialog[open]') ? null : (dropTarget ?? selectedSlot),
    started,
    selected,
    !!placingSandbag || !!placingRoadItem
  )
  renderer.assetsReady(state)
  assetNotice.update(renderer.assetStatus, performance.now(), state.phase === 'assault')
  $('app').dataset.simulationTime = String(state.time)
  if (now - uiTick > 100) {
    uiTick = now
    const clockNotice = clockFailed
      ? '戦闘クロックが停止しました。ページを再読み込みしてください。'
      : discardedClockMs >= 1000
        ? `ブラウザーの遅延で約${Math.round(discardedClockMs / 1000)}秒分は進めていません。1回の補完は最大2秒です。`
        : resumedAfterSuspension
          ? 'ページ復帰後に再開しました。ブラウザーで停止していた時間は進めていません。'
          : ''
    $('clock-status').hidden = !clockNotice
    $('clock-status').textContent = clockNotice
    $('time').title = clockNotice || '別のタブでも現在のステージの戦闘は継続します。'
    for (const type of ALL_TRIAL_TYPES) $<HTMLSelectElement>(`${type}-art`).disabled = started && !preparing()
    updateEnvironmentArtStatus()
    updateArtModeStatus()
    $('gold').textContent = `${save.gold} G`
    $('stage').textContent = String(state.stage).padStart(2, '0')
    $('app').dataset.phase = state.phase
    $('app').dataset.economyVersion = String(state.economyVersion ?? 1)
    $('player-bar').dataset.health = state.playerBaseHp <= CONFIG.baseHp * 0.3 ? 'low' : 'healthy'
    $('phase').textContent = {
      preparation: '防衛準備',
      assault: '襲撃中',
      cleared: '防衛成功',
      defeat: '拠点陥落',
      victory: '全10ステージ制覇'
    }[state.phase]
    $('player-hp').textContent = `${Math.ceil(state.playerBaseHp)} / ${CONFIG.baseHp}`
    $<HTMLProgressElement>('player-bar').value = state.playerBaseHp
    $('time').textContent =
      `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
    const defenders = state.units.filter((unit) => unit.owner === 'player').length
    updateRosterControls()
    updateSelectionContext()
    updateFortificationControls()
    const selectedBag = state.sandbags.find((bag) => bag.id === selectedSandbagId)
    $('sandbag-stock').textContent = `土のう ${state.sandbagStock}`
    $<HTMLButtonElement>('sandbag-place').disabled = !preparing() || state.sandbagStock < 1
    $<HTMLButtonElement>('sandbag-move').disabled = !preparing() || !selectedBag
    $<HTMLButtonElement>('sandbag-remove').disabled = !preparing() || !selectedBag
    $('sandbag-place-label').textContent = `×${state.sandbagStock}`
    $('sandbag-move').textContent = placingSandbag && movingSandbagId !== undefined ? '×' : '✥'
    $('sandbag-place').setAttribute('aria-pressed', String(placingSandbag && movingSandbagId === undefined))
    $('sandbag-move').setAttribute('aria-pressed', String(placingSandbag && movingSandbagId !== undefined))
    $<HTMLButtonElement>('save-now').disabled = !started
    $<HTMLButtonElement>('assault').disabled = !preparing() || !defenders || (engine.ai !== rule && !connected)
    $('assault').textContent = state.phase === 'assault' ? '⋯' : '▶'
    const assaultLabel =
      state.phase === 'assault'
        ? '襲撃中'
        : !defenders
          ? '仲間を配置してください'
          : engine.ai !== rule && !connected
            ? '接続・AI設定を確認'
            : `ステージ${state.stage} 襲撃開始`
    $('assault').setAttribute('aria-label', assaultLabel)
    $('assault').title = assaultLabel
    const strategy = enemyStrategyPresentation(state, { started, offline: engine.ai === rule, connected })
    $('enemy-plan-status').textContent = strategy.status
    $('enemy-plan-status').setAttribute(
      'aria-label',
      state.cooldownHold?.phase === 'cooling' && connected
        ? `${DEFINITIONS[state.cooldownHold.action.unitType].name}の出撃CD あと${Math.max(0, state.cooldowns[state.cooldownHold.action.unitType]).toFixed(1)}秒`
        : strategy.status
    )
    for (const key of ['reason', 'progress', 'reconsideration'] as const) {
      const element = $(`enemy-plan-${key}`)
      element.textContent = strategy[key]
      element.hidden = !strategy[key]
    }
    const support = commanderSupportPresentation(state, engine.ai !== rule)
    $('commander-support-status').textContent = !support.enabled
      ? '旧遠征 · 支援なし'
      : engine.ai === rule
        ? 'ルール AI · 支援なし'
        : 'Jev · 召喚とは別の支援魔法'
    $('commander-support-status').dataset.status = support.status
    $('commander-support-order').textContent = support.text
    $('commander-support-order').hidden = !support.text
    $('app').dataset.commanderSupport = String(state.commanderSupportVersion === 1)
    decisionPanel.render(state, started && engine.ai !== rule && state.phase !== 'preparation')
    $('last-action').textContent =
      `${state.lastAction ? actionLabel(state.lastAction) : '待機'} · ${state.decisionTime.toFixed(1)}秒 · ${state.decisionStatus}`
    $('scores').textContent =
      engine.ai === rule
        ? rule.scores
            .slice(0, 3)
            .map((score) => `${actionLabel(score.action)} · ${score.score.toFixed(1)}`)
            .join('\n')
        : 'MoQ → Pipecat → Jev'
  }
  if (state.result && !rewarded) {
    rewarded = true
    clearPlacementModes()
    const won = state.result === 'win',
      finished = state.phase === 'victory'
    $('result-title').textContent = finished
      ? '全10ステージ、防衛成功！'
      : won
        ? `STAGE ${state.stage} 防衛成功！`
        : '王国の門が破られました'
    $('reward').textContent = finished
      ? `${FIELDS[state.fieldId].name}を守り抜きました。+${wave.reward} G。雇った仲間は次の遠征でも利用でき、レベルは1に戻ります。`
      : won
        ? paidRoster()
          ? `+${wave.reward} G。次の準備で配置中・控えの仲間と拠点が全回復します。配置は1体40G、各種類1体まで。`
          : `+${wave.reward} G。次は合計${state.stage + 1}体まで配置できます。倒れた仲間も次の準備で復活。仲間と拠点は全回復。`
        : `到達ステージ ${state.stage} / 10。曲がり角を射程に入れ、仲間の雇用と強化で再挑戦しよう。`
    settingsPanel.close(false)
    upgradePanel.close(false)
    sandbagConfirm.close(false)
    pendingSandbagRemoval = null
    mapPan.cancel()
    $('result').dataset.outcome = finished ? 'victory' : won ? 'cleared' : 'defeat'
    $('result-icon').innerHTML = emblems[finished ? 'victory' : won ? 'cleared' : 'defeat']
    $('result-eyebrow').textContent = finished
      ? 'THE KINGDOM IS SAFE'
      : won
        ? 'A LITTLE VICTORY'
        : 'ANOTHER ADVENTURE AWAITS'
    $('result-stage').textContent = `${FIELDS[state.fieldId].name} · STAGE ${String(state.stage).padStart(2, '0')}`
    $('result-gold').textContent = won ? `+${wave.reward} G` : `所持 ${save.gold} G`
    $('retry').textContent = finished ? '新しい遠征へ →' : 'フィールドを選んで再出発'
    showOutcomeDialog($<HTMLDialogElement>('result'), state.phase)
  }
  requestFrame()
}
initializeClock()
document.addEventListener('visibilitychange', visibilityChanged)
window.addEventListener('pagehide', pageHidden)
window.addEventListener('pageshow', pageShown)
requestFrame()
