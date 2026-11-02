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

export function drawArea(ctx, effect, source, units, time, aspect) {
  const age = time - effect.releasedAt - (effect.ranged && !['cone', 'pierce'].includes(effect.areaKind) ? 0.12 : 0)
  if (age < 0 || age > 0.22 || effect.missed) return
  const progress = age / 0.22
  const type = source ?? {}
  const dir = -effect.side
  const radius = effect.attackerKey === 'curry' ? 40 : (type.radius ?? 40)
  const y = 367
  ctx.save()
  ctx.globalAlpha = 0.8 * (1 - progress)
  ctx.translate(0, y)
  ctx.scale(1, aspect)
  ctx.strokeStyle = effect.attackerKey === 'curry' ? '#ff662c' : effect.side === 1 ? '#e7aa45' : '#c2edff'
  ctx.fillStyle = effect.attackerKey === 'curry' ? '#ff793f66' : effect.side === 1 ? '#daa05255' : '#b4eaff66'
  ctx.lineWidth = 3
  const ellipse = (x, rx, ry) => {
    ctx.beginPath()
    ctx.ellipse(x, 0, Math.max(1, rx), ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (effect.areaKind === 'circle') ellipse(effect.primaryX, radius, 14)
  else if (effect.areaKind === 'ring') ellipse(effect.from, (type.range ?? 40) + 40, 18)
  else if (effect.areaKind === 'shockwave') ellipse(effect.primaryX + dir * 80 * progress, 8, 14)
  else if (['band', 'cone', 'pierce'].includes(effect.areaKind)) {
    const victims = effect.victims.map((victim) => units.find((unit) => unit.id === victim.id)).filter(Boolean)
    const length = ['cone', 'pierce'].includes(effect.areaKind)
      ? Math.max(Math.abs(effect.primaryX - effect.from), ...victims.map((victim) => Math.abs(victim.x - effect.from)))
      : (type.range ?? 40) + (type.extra ?? 0)
    const end = effect.from + dir * length
    ctx.beginPath()
    ctx.moveTo(effect.from, -3)
    ctx.lineTo(end, effect.areaKind === 'cone' ? -20 : -8)
    ctx.lineTo(end, effect.areaKind === 'cone' ? 20 : 8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  if (effect.crit) {
    ctx.fillStyle = '#ffef97'
    ctx.font = 'bold 17px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('会心!', effect.primaryX, -55 - progress * 15)
  }
  ctx.restore()
}
