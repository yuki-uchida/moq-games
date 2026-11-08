/**
 * The collapsed wolf: curled on its side with X eyes, its hat dropped behind and its weapon in front (the `down` and
 * `revive` animations share these two poses).
 */
import { R } from '../palette'
import { Raster, ball } from '../raster'
import { C } from '../palette'
import { glint, sparkle } from './body'
import { JOB_RAMP, drawHeadgear, drawWeapon, edgeShade, type JobId } from './jobs'
import { part } from './layer'
import { CR, F, earsSide, headSide, tail } from './wolf-parts'

/** `variant` 0 = just dropped (head lifted, tongue out), 1 = settled (head down, tail across). */
export function lyingFrame(job: JobId, variant: 0 | 1, reviving = false): Raster {
  const r = new Raster(64, 64)
  const ramp = JOB_RAMP[job]
  const v = variant
  // Hat dropped behind, upright on the ground.
  const hat = new Raster(64, 64)
  const hk = job === 'mage' ? 0.72 : 1
  drawHeadgear(hat, job, { x: 32, y: 30, w: 30, dir: 'down', k: hk }, 0, 0)
  const hb = hat.bounds()
  if (hb) {
    const crop = hat.crop(hb.x, hb.y, hb.w, hb.h)
    r.blit(crop, 3, 45 - crop.h + (v ? 2 : 0) + (job === 'mage' ? 4 : 0))
  }
  const hx = 45
  const hy = 49 + v * 1.5
  // Far legs.
  const far = new Raster(64, 64)
  part(far, (l) => {
    l.thick(37, 52, 46, 55, 4.2, F[1])
    l.thick(19, 52, 13, 54.5, 4.2, F[1])
    edgeShade(l, F)
  })
  r.blit(far.map((c) => (c ? R.wolfFur[c === F[1] ? 2 : 3] : c)))
  // Body.
  part(r, (l) => {
    ball(l, 27, 49.5, 14, 6.6, F, true)
    edgeShade(l, F)
    // Cream chest on the visible front and a light belly line.
    l.ellipse(36, 52.5, 4.4, 3.2, CR[1])
    for (let y = 46; y < 58; y++)
      for (let x = 30; x < 46; x++) {
        if (l.get(x, y) === CR[1] && (!l.get(x, y + 1) || !l.get(x + 1, y))) l.set(x, y, CR[2])
      }
  })
  // Near legs.
  part(r, (l) => {
    l.thick(41, 53, 50, 55.5, 4.4, F[1])
    l.ellipse(50.5, 55, 2.6, 1.9, F[1])
    l.thick(19, 53, 11, 55, 4.4, F[1])
    l.ellipse(10.5, 55, 2.6, 1.9, F[1])
    edgeShade(l, F)
    l.paint(51, 55, F[3])
    l.paint(10, 55, F[3])
  })
  // Head resting on the ground, snout pointing right and slightly down.
  const th = v ? 0.38 : 0.12
  earsSide(r, hx, hy, th, 1, { spread: 0, dy: 2.5, lean: 0.3, hole: 0, scale: 0.95 })
  headSide(r, { x: hx, y: hy, eyes: reviving ? 'half' : 'x', mouth: v ? 'frown' : 'pant', tilt: -th, open: v ? 0 : 2 })
  // Tail curled over the belly.
  tail(r, [17, 48], [6, 58 - v], [27 + v * 3, 56], 1.15)
  // Weapon dropped in front.
  const wl = new Raster(64, 64)
  const bow = job === 'archer'
  drawWeapon(
    wl,
    job,
    { x: job === 'sword' ? 22 : job === 'archer' ? 31 : 16, y: 59, ang: bow ? Math.PI / 2 : 0, dir: 'down' },
    {}
  )
  r.blit(wl)
  if (reviving) {
    sparkle(r, 52, 38, ramp, 2)
    glint(r, 14, 36, ramp)
    glint(r, 58, 46, ramp)
  }
  void C
  return r
}
