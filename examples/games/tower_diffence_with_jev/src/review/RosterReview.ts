import { unitTrialsFromURL } from '../rendering/UnitArtTrial'
import type { Mesh, MeshBasicMaterial, Scene } from 'three'
import { GameEngine } from '../game/GameEngine'
import { DEFINITIONS } from '../game/model'
import { GameRenderer } from '../rendering/GameRenderer'
import {
  AUTHORED_ROSTER,
  DIRECTIONS,
  MOTIONS,
  authoredRosterClips,
  type AuthoredSpriteRole
} from '../rendering/AuthoredRoster'
import type { SpriteDirection } from '../rendering/UnitSprites'

const base = new URL('../../../tower-defense-art/', document.baseURI)
let renderer: GameRenderer | undefined

async function prepare(direction: SpriteDirection, motion: (typeof MOTIONS)[number]) {
  if (!DIRECTIONS.includes(direction) || !MOTIONS.includes(motion)) throw new Error('Invalid roster review')
  const host = document.getElementById('field')!
  renderer ??= new GameRenderer(host, {
    clips: authoredRosterClips(base),
    unitTrials: unitTrialsFromURL(base, new URL(document.baseURI))
  })
  const engine = new GameEngine({ decide: async () => null })
  engine.place('soldier', 0)
  const template = engine.state.units[0]
  const angle = ((DIRECTIONS.indexOf(direction) - 2) * Math.PI) / 4
  engine.state.units = (Object.keys(AUTHORED_ROSTER) as AuthoredSpriteRole[]).map((type, index) => ({
    ...template,
    ...DEFINITIONS[type],
    id: index + 1,
    type,
    owner: AUTHORED_ROSTER[type].owner,
    x: 140 + (index % 5) * 240,
    y: 160 + Math.floor(index / 5) * 210,
    facingX: Math.cos(angle),
    facingY: Math.sin(angle),
    moving: motion === 'walk',
    travelled: 12,
    attackSequence: motion === 'attack' ? 1 : 0,
    attackStartedAt: 0
  }))
  engine.state.phase = motion === 'idle' ? 'preparation' : 'assault'
  engine.state.time = 0.12
  const deadline = performance.now() + 60_000
  while (!renderer.assetsReady(engine.state)) {
    if (renderer.assetStatus === 'error') throw new Error(JSON.stringify(renderer.assetErrors))
    if (performance.now() > deadline) throw new Error('Roster atlas readiness timed out')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  renderer.render(engine.state)
  const scene = (renderer as unknown as { scene: Scene }).scene
  const bodies = scene.children
    .filter((child) => child.type === 'Group')
    .map((group) => {
      const body = group.children[1] as Mesh<any, MeshBasicMaterial>
      return {
        visible: body.visible,
        hasTexture: !!body.material.map,
        texture: body.material.map?.name ?? null,
        meshSize: { width: body.geometry.parameters.width, height: body.geometry.parameters.height },
        position: body.position.toArray(),
        scale: body.scale.toArray()
      }
    })
  const labels = Array.from(host.querySelectorAll<HTMLElement>('.unit-health')).map((label) => ({ ...label.dataset }))
  document.getElementById('frame-label')!.textContent = `All 20 roles / ${direction} / ${motion}`
  return { bodies, labels, errors: renderer.assetErrors, diagnostics: renderer.diagnostics() }
}

Object.assign(window, { rosterReview: { prepare } })
