const active = (status, time) => status?.end > time

export function statusBadges(unit, time) {
  return [
    active(unit.control, time) && unit.control.kind,
    unit.poison?.some((status) => active(status, time)) && 'poison',
    active(unit.burn, time) && 'burn',
    active(unit.curry, time) && 'curry',
    active(unit.vuln, time) && 'vuln',
    active(unit.weak, time) && 'weak',
    active(unit.drowsy, time) && 'drowsy',
    active(unit.slow, time) && 'slow',
    active(unit.rally, time) && 'rally'
  ]
    .filter(Boolean)
    .slice(0, 3)
}

const BADGES = {
  freeze: ['#8edcff', '氷'],
  stun: ['#ffffff', '錠'],
  launch: ['#fff4cb', '↑'],
  confuse: ['#ff7777', '渦'],
  poison: ['#cf91ee', '毒'],
  burn: ['#ffad55', '炎'],
  curry: ['#ff6661', '辛'],
  vuln: ['#c1dc70', '盾'],
  weak: ['#ffabc1', '↓'],
  drowsy: ['#aaa8f1', 'Z'],
  slow: ['#8edcff', ''],
  rally: ['#ffe07a', '王']
}

export function drawZones(ctx, zones, time, aspect, reduced) {
  for (const zone of zones) {
    const age = time - (zone.start ?? zone.end - 3)
    const alpha = Math.min(1, Math.max(0, age / 0.25), Math.max(0, (zone.end - time) / 0.35))
    const radius = zone.radius ?? (zone.kind === 'mud' ? 50 : zone.kind === 'wet' ? 45 : 60)
    ctx.save()
    ctx.globalAlpha = alpha * 0.7
    ctx.translate(zone.x, 377)
    ctx.scale(1, aspect)
    ctx.fillStyle = zone.kind === 'mud' ? '#80502e' : zone.kind === 'wet' ? '#8bd9f2' : '#b5c24c'
    ctx.beginPath()
    ctx.ellipse(0, 0, radius, 13, 0, 0, Math.PI * 2)
    ctx.fill()
    if (zone.kind === 'stench') {
      ctx.globalAlpha = alpha * 0.3
      for (let i = 0; i < (reduced ? 3 : 6); i++) {
        ctx.beginPath()
        ctx.ellipse(-radius + ((i * 31 + time * 9) % (radius * 2)), -8 - (i % 2) * 5, 15, 9, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = alpha * 0.7
    }
    ctx.strokeStyle = zone.kind === 'wet' ? '#e8fbff' : '#ffffff80'
    ctx.lineWidth = 2
    for (let i = 0; i < (reduced ? 2 : 5); i++) {
      const x = ((i * 37 + time * (zone.kind === 'stench' ? 8 : 2)) % (radius * 2)) - radius
      ctx.beginPath()
      ctx.arc(x, Math.sin(time * 2 + i) * 5, 2 + (i % 2), 0, Math.PI * 2)
      ctx.stroke()
    }
    if (zone.kind === 'wet') {
      ctx.translate(radius * 0.65, 0)
      ctx.fillStyle = '#f7dc50'
      ctx.beginPath()
      ctx.moveTo(-14, -30)
      ctx.lineTo(-19, -3)
      ctx.lineTo(19, -3)
      ctx.lineTo(14, -30)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#543f13'
      ctx.font = 'bold 7px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('すべります', 0, -15)
    }
    ctx.restore()
  }
}

export function drawStatus(ctx, unit, x, y, top, time, aspect, reduced) {
  const control = active(unit.control, time) ? unit.control.kind : null
  const status = statusBadges(unit, time)
  const bodyHeight = y - top
  ctx.save()
  ctx.translate(x, y)
  const charged =
    unit.ambush && (unit.lastStrikeDistance === undefined || unit.walkDistance - unit.lastStrikeDistance >= 40)
  if ((charged && unit.motion === 'walk') || unit.ramp > 0) {
    ctx.fillStyle = charged ? '#ef512c55' : `rgba(228, 232, 65, ${unit.ramp * 0.07})`
    ctx.beginPath()
    ctx.ellipse(0, -bodyHeight * 0.4, 28, bodyHeight * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (active(unit.slow, time)) {
    ctx.fillStyle = '#a9e5ff99'
    ctx.beginPath()
    ctx.ellipse(0, 0, 24, 6 * aspect, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (control === 'freeze') {
    ctx.fillStyle = '#a8e7ff55'
    ctx.strokeStyle = '#dffaff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-22, 0)
    ctx.lineTo(-22, -bodyHeight * 0.65)
    ctx.lineTo(-11, -bodyHeight * 0.8)
    ctx.lineTo(11, -bodyHeight * 0.8)
    ctx.lineTo(22, -bodyHeight * 0.65)
    ctx.lineTo(22, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  if (active(unit.vuln, time) || active(unit.weak, time)) {
    ctx.strokeStyle = active(unit.vuln, time) ? '#eaffc5' : '#fff2f3'
    ctx.lineWidth = 2
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 12, -bodyHeight * 0.65)
      ctx.quadraticCurveTo(i * 12 + 4, -bodyHeight * 0.45, i * 12, -bodyHeight * 0.3)
      ctx.stroke()
    }
  }
  const count = reduced ? 2 : 4
  for (let i = 0; i < count; i++) {
    const angle = time * 3 + (i * Math.PI * 2) / count
    const px = Math.cos(angle) * 20
    const py = -bodyHeight * 0.65 + Math.sin(angle) * 10 * aspect
    if (control === 'stun' || active(unit.rally, time) || active(unit.poison?.[0], time)) {
      ctx.fillStyle = control === 'stun' ? '#fff' : active(unit.poison?.[0], time) ? '#bd73de' : '#ffe278'
      ctx.beginPath()
      ctx.arc(px, py, control === 'stun' ? 3 : 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (active(unit.burn, time)) {
    ctx.fillStyle = '#ff9d36bb'
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 13 - 5, -5)
      ctx.quadraticCurveTo(i * 13 - 5, -15, i * 13 + Math.sin(time * 8 + i) * 4, -22)
      ctx.quadraticCurveTo(i * 13 + 8, -10, i * 13 + 5, -5)
      ctx.fill()
    }
  }
  if (unit.tick && time - unit.tick.at < 0.15) {
    ctx.fillStyle = unit.tick.kind === 'burn' ? '#ff9b4677' : unit.tick.kind === 'poison' ? '#b35bdc77' : '#c4d54f77'
    ctx.beginPath()
    ctx.ellipse(0, -bodyHeight * 0.4, 24, bodyHeight * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (unit.key === 'katachi' && unit.hurt && time - unit.hurt.at < 0.16) {
    ctx.strokeStyle = '#fff6ae'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * 13, -bodyHeight * 0.45 + Math.sin(angle) * 13)
      ctx.lineTo(Math.cos(angle) * 25, -bodyHeight * 0.45 + Math.sin(angle) * 25)
      ctx.stroke()
    }
  }
  if (active(unit.drowsy, time) || control === 'confuse' || active(unit.curry, time) || active(unit.rally, time)) {
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = active(unit.curry, time)
      ? '#f34835'
      : control === 'confuse'
        ? '#e34d45'
        : active(unit.rally, time)
          ? '#edbd38'
          : '#52559a'
    ctx.fillText(
      active(unit.curry, time) ? '♨' : control === 'confuse' ? '◎' : active(unit.rally, time) ? '♛' : 'Z',
      0,
      -bodyHeight - 8
    )
  }
  ctx.restore()
  ctx.save()
  ctx.translate(x, top - 9 * aspect)
  ctx.scale(1, aspect)
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  status.forEach((kind, index) => {
    const [color, label] = BADGES[kind]
    const offset = (index - (status.length - 1) / 2) * 15
    ctx.fillStyle = '#302a2be8'
    ctx.beginPath()
    ctx.arc(offset, 0, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = color
    if (kind === 'slow') {
      for (let spoke = 0; spoke < 3; spoke++) {
        const angle = (spoke * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(offset - Math.cos(angle) * 4, -Math.sin(angle) * 4)
        ctx.lineTo(offset + Math.cos(angle) * 4, Math.sin(angle) * 4)
        ctx.stroke()
      }
    } else
      ctx.fillText(kind === 'poison' ? String(unit.poison.filter((p) => active(p, time)).length) : label, offset, 0)
  })
  ctx.restore()
}

export const IMPACT_STYLES = {
  katachi: ['#ffe76d', '#ffffff', 'star'],
  korokoro: ['#844619', '#d6a36a', 'splat'],
  geri: ['#a35b2a', '#ffffff', 'ring'],
  bichi: ['#905124', '#d6a36a', 'splat'],
  dodeka: ['#b77937', '#f5cf8e', 'dust'],
  daiou: ['#ffd34b', '#fff5bd', 'star'],
  aircon: ['#aeeaff', '#ffffff', 'dust'],
  ramen: ['#e9ae36', '#fff4c1', 'lines'],
  yofukashi: ['#ffffff', '#fff3cf', 'arc'],
  sake: ['#d9f8ff', '#ffffff', 'splat'],
  jiro: ['#fff5ab', '#ffffff', 'sticks'],
  yakiniku: ['#f48b2b', '#ffe676', 'splat'],
  garlic: ['#b4cc48', '#e7f5a6', 'waves'],
  curry: ['#f34b2e', '#ffe1bd', 'star'],
  milk: ['#ffffff', '#d6efff', 'lines'],
  oyster: ['#b882cf', '#f7dfff', 'arc'],
  ice: ['#8beaff', '#ffffff', 'shards'],
  energy: ['#d9ef57', '#ffffff', 'bubbles'],
  cleaner: ['#a6a6a0', '#eef8ff', 'dust'],
  yogurt: ['#ffffff', '#c4e8ff', 'splat'],
  sayu: ['#d6f4ff', '#ffffff', 'dust'],
  washiki: ['#82d2f5', '#effbff', 'splat'],
  mop: ['#91dafa', '#ffffff', 'splat'],
  yoshiki: ['#78c9f5', '#ffffff', 'splat'],
  seichou: ['#ef9fc2', '#fff3fa', 'star'],
  geridome: ['#ffffff', '#c8e4f4', 'shards']
}

export function activeVictims(effect, units, time) {
  return (effect.victims ?? [])
    .filter((victim) => time >= victim.at && time - victim.at < 0.22)
    .map((victim) => ({ ...victim, unit: units.find((unit) => unit.id === victim.id) }))
}

export function drawArea(ctx, effect, type, units, time, aspect, reduced, muzzle, laneY) {
  const style = IMPACT_STYLES[effect.attackerKey]
  if (!style) return
  const [color, light, shape] = style
  const dir = -effect.side
  const age = time - effect.releasedAt
  const hitAge = age - (effect.ranged && !['cone', 'pierce'].includes(effect.areaKind) ? 0.12 : 0)
  const progress = Math.max(0, Math.min(1, hitAge / 0.22))
  const victims = activeVictims(effect, units, time)
  const allVictims = (effect.victims ?? [])
    .map(
      (victim) =>
        effect.victimOrigins?.find((unit) => unit.id === victim.id) ?? units.find((unit) => unit.id === victim.id)
    )
    .filter(Boolean)
  const farthest = Math.max(
    Math.abs(effect.primaryX - effect.from),
    ...allVictims.map((unit) => Math.abs(unit.x - effect.from))
  )
  const floor = 367
  const count = reduced ? 3 : 7
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  const ellipse = (x, y, rx, ry) => {
    ctx.beginPath()
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(0, floor)
  ctx.scale(1, aspect)
  ctx.strokeStyle = light
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'round'

  if (age >= 0 && age < 0.22 && ['cone', 'pierce'].includes(effect.areaKind)) {
    const startX = muzzle?.x ?? effect.from
    const startY = ((muzzle?.y ?? floor - 30) - floor) / aspect
    const end = effect.from + dir * farthest * Math.min(1, age / 0.12)
    ctx.globalAlpha = 0.3 * (1 - age / 0.3)
    ctx.beginPath()
    ctx.moveTo(startX, startY - 5)
    ctx.lineTo(end, startY - (effect.areaKind === 'cone' ? 32 : 9))
    ctx.lineTo(end, startY + (effect.areaKind === 'cone' ? 32 : 9))
    ctx.lineTo(startX, startY + 5)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 0.8 * (1 - age / 0.22)
    for (let index = 0; index < count; index++) {
      const fraction = ((index / count + age * 4) % 1) * Math.min(1, age / 0.12)
      const x = startX + (effect.from + dir * farthest - startX) * fraction
      const y = startY + (index - (count - 1) / 2) * (effect.areaKind === 'cone' ? fraction * 8 : 2)
      line(x - dir * 10, y, x + dir * 8, y)
    }
  }

  if (hitAge >= 0 && hitAge < 0.22 && !effect.missed) {
    ctx.globalAlpha = 0.8 * (1 - progress)
    if (effect.areaKind === 'circle' || effect.areaKind === 'ring') {
      const radius = effect.areaKind === 'ring' ? (type?.range ?? 40) + 40 : (type?.radius ?? 40)
      const center = effect.areaKind === 'ring' ? effect.from : effect.x
      const width = radius * Math.min(1, 0.4 + progress * 3)
      if (effect.areaKind === 'ring' || effect.attackerKey === 'geridome') {
        ctx.beginPath()
        ctx.ellipse(center, 0, width, 11 + progress * 5, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else ellipse(center, 0, width, 11 + progress * 5)
      if (['jiro', 'geridome', 'bichi', 'yakiniku', 'seichou'].includes(effect.attackerKey)) {
        for (let index = 0; index < count; index++) {
          const offset = ((index / Math.max(1, count - 1)) * 2 - 1) * width
          const height = 6 + (index % 3) * 5 + progress * 12
          if (['bichi', 'yakiniku'].includes(effect.attackerKey)) {
            ellipse(center + offset, -height, 3, 4)
            if (effect.attackerKey === 'yakiniku')
              line(center + offset - 3, -height - 5, center + offset + 3, -height - 9)
          } else line(center + offset, -3, center + offset + (index % 2 ? 4 : -4), -height)
        }
      }
    }
    if (effect.attackerKey === 'daiou') {
      const crest = effect.primaryX + dir * Math.min(80, age * 600)
      ctx.beginPath()
      ctx.moveTo(crest - dir * 12, 0)
      ctx.lineTo(crest - dir * 5, -8)
      ctx.lineTo(crest, -22)
      ctx.lineTo(crest + dir * 6, -8)
      ctx.lineTo(crest + dir * 12, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      for (let index = 0; index < count; index++) ellipse(crest - dir * (index * 6), -4 - (index % 3) * 5, 2, 2)
      ellipse(effect.primaryX, 0, 12 + progress * 20, 6)
    }
    if (effect.attackerKey === 'geri') {
      ctx.lineWidth = 7
      line(effect.from + dir * 10, -24, effect.from - dir * (35 + progress * 25), -24)
    }
    if (['dodeka', 'mop'].includes(effect.attackerKey)) {
      const length = (type?.range ?? 40) + (type?.extra ?? 0)
      const width = length * Math.min(1, 0.35 + progress * 4)
      ctx.lineWidth = effect.attackerKey === 'mop' ? 5 : 9
      ctx.beginPath()
      ctx.ellipse(
        effect.from + dir * width * 0.5,
        -3,
        width * 0.5,
        effect.attackerKey === 'mop' ? 9 : 20,
        0,
        Math.PI,
        Math.PI * 2
      )
      ctx.stroke()
    }
  }

  const points =
    effect.missed && !['cone', 'pierce', 'shockwave'].includes(effect.areaKind)
      ? []
      : victims.length
        ? victims.map(({ id, unit, at }) => ({
            x: unit?.x ?? effect.victimOrigins?.find((origin) => origin.id === id)?.x ?? effect.x,
            y: unit ? laneY(unit) - 30 * aspect : (effect.targetY ?? floor - 30 * aspect),
            age: time - at
          }))
        : effect.targetId == null && hitAge >= 0 && !effect.missed
          ? [{ x: effect.x, y: effect.targetY ?? floor - 30 * aspect, age: hitAge }]
          : []
  for (const point of points) {
    const t = Math.min(1, point.age / 0.22)
    const x = point.x
    const y = (point.y - floor) / aspect
    const burstColor =
      effect.attackerKey === 'geri' && effect.source?.charged
        ? '#ff6534'
        : effect.attackerKey === 'sake' && effect.crit
          ? '#ff9fca'
          : color
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = burstColor
    ctx.strokeStyle = light
    ctx.lineWidth = 2.5
    if (shape === 'ring') {
      ctx.beginPath()
      ctx.arc(x, y, 5 + t * (effect.source?.charged ? 32 : 22), 0, Math.PI * 2)
      ctx.stroke()
      if (effect.source?.charged) {
        ctx.fillStyle = burstColor
        ellipse(x, y, 12 * (1 - t) + 2, 12 * (1 - t) + 2)
      }
    } else if (shape === 'arc') {
      ctx.beginPath()
      const flip = (effect.source?.strikes ?? 0) % 2 ? Math.PI : 0
      ctx.arc(x, y, 12 + t * 12, flip - 1.2, flip + 1.2)
      ctx.stroke()
    } else if (shape === 'star') {
      ctx.beginPath()
      for (let index = 0; index < 10; index++) {
        const angle = (index * Math.PI) / 5 - Math.PI / 2
        const radius = (index % 2 ? 5 : 14) * (1 - t * 0.5)
        if (index === 0) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
        else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else ellipse(x, y, 5 + (1 - t) * 7, 5 + (1 - t) * 7)
    const hitParticles = effect.attackerKey === 'yofukashi' ? 3 : count
    for (let index = 0; index < hitParticles; index++) {
      const angle = (index * Math.PI * 2) / hitParticles + (effect.attackerKey === 'sake' && effect.crit ? t * 4 : 0)
      const distance = 10 + t * (shape === 'star' ? 25 : 18)
      const px = x + Math.cos(angle) * distance
      const py = y + Math.sin(angle) * distance
      if (shape === 'waves') {
        ctx.beginPath()
        ctx.moveTo(px, py + 4)
        ctx.bezierCurveTo(px - 5, py, px + 5, py - 4, px, py - 8)
        ctx.stroke()
      } else if (shape === 'shards') {
        ctx.beginPath()
        ctx.moveTo(px, py - 6)
        ctx.lineTo(px + 3, py + 4)
        ctx.lineTo(px - 3, py + 2)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else if (effect.attackerKey === 'oyster') {
        ctx.beginPath()
        ctx.arc(px, py, 2 + (index % 3), 0, Math.PI * 2)
        ctx.stroke()
      } else if (['star', 'lines', 'sticks', 'arc'].includes(shape)) {
        line(px, py, px + Math.cos(angle) * 7, py + Math.sin(angle) * 7)
      } else ellipse(px, py, shape === 'dust' ? 5 : 3, shape === 'dust' ? 4 : 3)
    }
    if (['curry', 'sayu', 'ice'].includes(effect.attackerKey)) {
      for (let index = 0; index < (reduced ? 2 : 3); index++) {
        ctx.beginPath()
        ctx.arc(x + (index - 1) * 10, y - 20 - t * 16, 4 + t * 4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (effect.attackerKey === 'ramen') {
      line(x - dir * 30, y - 5, x, y - 5)
      line(x - dir * 30, y + 1, x, y + 1)
    }
    if (['cleaner', 'milk'].includes(effect.attackerKey)) {
      const direction = effect.attackerKey === 'cleaner' ? -dir : dir
      for (let index = 0; index < 3; index++) line(x - direction * 22, y + index * 6, x - direction * 10, y + index * 6)
    }
    if (effect.attackerKey === 'sake' && effect.crit) {
      ctx.strokeStyle = '#ff9fca'
      ctx.beginPath()
      ctx.arc(x, y, 8 + t * 14, t * 5, t * 5 + Math.PI * 1.5)
      ctx.stroke()
    }
    if (effect.attackerKey === 'katachi') {
      ctx.fillStyle = '#9e6b39'
      for (let index = 0; index < (reduced ? 2 : 4); index++) ellipse(x + (index - 1.5) * 7, 0, 4, 3)
    }
  }
  if (effect.crit && hitAge >= 0 && hitAge < 0.22) {
    ctx.globalAlpha = 1 - progress
    ctx.fillStyle = '#ffef97'
    ctx.font = 'bold 17px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('会心!', effect.x, -65 - progress * 15)
  }
  ctx.restore()
}
