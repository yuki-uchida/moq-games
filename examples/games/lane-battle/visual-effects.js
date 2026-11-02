const active = (status, time) => status?.end > time

const emptyEffect = () => {}
export const HURT_VFX = {
  katachi: emptyEffect,
  korokoro: emptyEffect,
  geri: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = 1 - age / 0.3
    ctx.strokeStyle = '#e73d27'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - 9, y - 78 * aspect)
    ctx.lineTo(x - 3, y - 72 * aspect)
    ctx.lineTo(x - 9, y - 66 * aspect)
    ctx.moveTo(x + 9, y - 78 * aspect)
    ctx.lineTo(x + 3, y - 72 * aspect)
    ctx.lineTo(x + 9, y - 66 * aspect)
    ctx.stroke()
  },
  bichi(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.4) return
    ctx.fillStyle = `rgba(125, 192, 223, ${1 - age / 0.4})`
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 1.5) * (9 + age * 35), y - (26 + 40 * age - 70 * age * age) * aspect, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  dodeka(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age > 0.3) return
    ctx.globalAlpha = 0.35 * (1 - age / 0.3)
    ctx.strokeStyle = '#c6a675'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(x, y, 20 + age * 55, (5 + age * 12) * aspect, 0, 0, Math.PI * 2)
    ctx.stroke()
  },
  daiou(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.3) return
    ctx.fillStyle = `rgba(255, 211, 75, ${1 - age / 0.3})`
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 1) * (12 + age * 35), y - (63 + age * 20) * aspect, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  aircon(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.22) return
    ctx.strokeStyle = '#fff2a0'
    ctx.lineWidth = 2
    ctx.globalAlpha = 1 - age / 0.22
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + age * 5
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(angle) * 16, y - 35 * aspect + Math.sin(angle) * 12)
      ctx.lineTo(x + Math.cos(angle) * (21 + age * 35), y - 35 * aspect + Math.sin(angle) * (17 + age * 35))
      ctx.stroke()
    }
  },
  ramen(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.3) return
    ctx.fillStyle = '#e9ae36'
    ctx.globalAlpha = 1 - age / 0.3
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(x + (i - 1) * (12 + age * 25), y - (26 + age * 25 - i * 3) * aspect, 3, 2 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  yofukashi(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.18) return
    ctx.globalAlpha = 1 - age / 0.18
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 9, y - 52 * aspect)
    ctx.lineTo(x - 2, y - 43 * aspect)
    ctx.lineTo(x - 6, y - 37 * aspect)
    ctx.lineTo(x + 8, y - 24 * aspect)
    ctx.moveTo(x - 2, y - 43 * aspect)
    ctx.lineTo(x + 9, y - 46 * aspect)
    ctx.stroke()
  },
  sake: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.38) return
    ctx.globalAlpha = 1 - age / 0.38
    ctx.strokeStyle = '#e1f8ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x - unit.side * 13, y - (55 + age * 30) * aspect, 3 + age * 5, 0, Math.PI * 2)
    ctx.stroke()
  },
  jiro: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.5) return
    ctx.globalAlpha = 1 - age / 0.5
    ctx.strokeStyle = '#f5f3d3'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - unit.side * (12 + age * 30), y - (45 - age * 50) * aspect)
    ctx.lineTo(x - unit.side * (17 + age * 30), y - (51 - age * 50) * aspect)
    ctx.stroke()
  },
  yakiniku: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.4) return
    ctx.globalAlpha = 1 - age / 0.4
    ctx.fillStyle = '#ffad36'
    for (let index = 0; index < 4; index++) {
      const angle = (index / 3) * Math.PI
      ctx.beginPath()
      ctx.arc(
        x + Math.cos(angle) * (13 + age * 40),
        y - (32 + Math.sin(angle) * (12 + age * 40)) * aspect,
        2,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  },
  garlic: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = (1 - age / 0.3) * 0.6
    ctx.fillStyle = '#c4d85a'
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(x - unit.side * (12 + i * 7 + age * 30), y - (45 + i * 5) * aspect, 3 + age * 10, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  curry: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = 1 - age / 0.3
    ctx.fillStyle = '#a8541a'
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 1) * (8 + age * 20), y - (29 + age * 38 + i * 4) * aspect, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  milk: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = 1 - age / 0.3
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(
        x + (i - 1) * (10 + age * 18),
        y - (45 + age * 22 + i * 3) * aspect,
        2.5,
        4 * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  },
  oyster: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.32) return
    ctx.globalAlpha = 1 - age / 0.32
    ctx.strokeStyle = '#dbc9e7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y - 25 * aspect, 14 + age * 12, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  },
  ice: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.45) return
    ctx.globalAlpha = 1 - age / 0.45
    ctx.fillStyle = '#bff0d4'
    ctx.beginPath()
    ctx.ellipse(x + 11, y - (26 - age * 34) * aspect, 3, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  energy: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.35) return
    ctx.globalAlpha = 1 - age / 0.35
    ctx.fillStyle = '#eaffcb'
    for (let index = 0; index < 3; index++) {
      ctx.beginPath()
      ctx.arc(x + (index - 1) * 6, y - (44 + age * 30 + index * 4) * aspect, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  cleaner(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.2) return
    ctx.globalAlpha = 1 - age / 0.2
    ctx.strokeStyle = '#e8f6ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 15, y - 55 * aspect)
    ctx.lineTo(x - 20 - age * 30, y - 62 * aspect)
    ctx.moveTo(x + 15, y - 55 * aspect)
    ctx.lineTo(x + 20 + age * 30, y - 62 * aspect)
    ctx.stroke()
  },
  yogurt(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = 1 - age / 0.3
    ctx.fillStyle = '#ffffff'
    for (let index = 0; index < 3; index++) {
      ctx.beginPath()
      ctx.ellipse(
        x + (index - 1) * (8 + age * 40),
        y - (36 + age * 30 - index * 3) * aspect,
        3,
        4 * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  },
  sayu(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.3) return
    ctx.globalAlpha = 1 - age / 0.3
    ctx.fillStyle = '#d6f4ff'
    for (let index = 0; index < 3; index++) {
      ctx.beginPath()
      ctx.ellipse(
        x + (index - 1) * (8 + age * 40),
        y - (30 + age * 30 - index * 4) * aspect,
        2.5,
        4 * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  },
  washiki(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.35) return
    ctx.globalAlpha = 1 - age / 0.35
    ctx.fillStyle = '#b7edff'
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.ellipse(
        x + (i - 1.5) * (8 + age * 24),
        y - (22 + age * 25 - i * 3) * aspect,
        3,
        4 * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  },
  mop(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.22) return
    ctx.globalAlpha = 1 - age / 0.22
    ctx.strokeStyle = '#e5f9ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x + unit.side * 8, y - 32 * aspect, 10 + age * 15, -1.1, 1.1)
    ctx.stroke()
  },
  yoshiki(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.3 || Math.floor(age * 18) % 2) return
    ctx.fillStyle = '#ff5151'
    ctx.beginPath()
    ctx.arc(x + unit.side * 4, y - 30 * aspect, 3, 0, Math.PI * 2)
    ctx.fill()
  },
  seichou(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.32) return
    ctx.fillStyle = '#fff1f7'
    ctx.globalAlpha = 1 - age / 0.32
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 2) * (5 + age * 28), y - (30 + age * (28 + i * 4)) * aspect, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  geridome(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 0.35) return
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 1 - age / 0.35
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(x + (i - 1) * (18 + age * 24), y - (65 + age * 20) * aspect, 4, 2 * aspect, i, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
export const DEATH_VFX = {
  katachi: (ctx, unit, age, layer, x, y, aspect) => {
    // The hard body cracks: six outlined brown chunks spin out in arcs and land beside it.
    if (layer !== 'above' || age < 0.12 || age > 0.8) return
    const t = (age - 0.12) / 0.68
    ctx.globalAlpha = Math.min(1, (1 - t) * 2.5)
    ctx.fillStyle = '#7f4b22'
    ctx.strokeStyle = '#3a2210'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 6; i++) {
      const out = Math.min(1, t * 1.6)
      const lift = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.4))) * (22 + (i % 3) * 9)
      const r = 4 + (i % 3)
      ctx.save()
      ctx.translate(x + (i - 2.5) * 21 * out, y - (4 + lift) * aspect)
      ctx.rotate(t * (i % 2 ? 6 : -5))
      ctx.beginPath()
      ctx.moveTo(-r, 0)
      ctx.lineTo(-r * 0.2, -r * aspect)
      ctx.lineTo(r, -r * 0.3 * aspect)
      ctx.lineTo(r * 0.4, r * 0.8 * aspect)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  },
  korokoro: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'floor' || age < 0.05 || age > 0.85) return
    const t = Math.min(1, (age - 0.05) / 0.6)
    ctx.globalAlpha = age < 0.64 ? 1 : Math.max(0, (0.85 - age) / 0.21)
    ctx.fillStyle = '#6b3c1c'
    ctx.beginPath()
    ctx.ellipse(
      x + unit.side * 26 * t,
      y - (3 + 12 * Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t)) * aspect,
      5,
      5 * aspect,
      0,
      0,
      Math.PI * 2
    )
    ctx.fill()
  },
  geri: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'floor' || age < 0.5 || age > 0.8) return
    const t = (age - 0.5) / 0.3
    ctx.fillStyle = `rgba(164, 108, 56, ${0.6 * (1 - t)})`
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(x + side * (12 + 20 * t), y - 4 * aspect, 7 + 5 * t, (3 + 2 * t) * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  bichi(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age > 0.9) return
    const spread = Math.min(1, age / 0.55)
    ctx.globalAlpha = Math.min(1, (0.9 - age) / 0.23) * 0.75
    ctx.fillStyle = '#80502e'
    ctx.beginPath()
    ctx.ellipse(x, y, 12 + 38 * spread, (3 + 6 * spread) * aspect, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#d5a777'
    for (let i = 0; i < 3; i++) {
      const bubble = Math.max(0, 1 - Math.abs(age - (0.35 + i * 0.12)) / 0.13)
      if (!bubble) continue
      ctx.beginPath()
      ctx.ellipse(x + (i - 1) * 17, y - 2 * aspect, 2 + 4 * bubble, (1 + 2 * bubble) * aspect, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  },
  dodeka(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age < 0.58 || age > 1.05) return
    const t = (age - 0.58) / 0.47
    ctx.globalAlpha = 0.65 * (1 - t)
    ctx.strokeStyle = '#b99b70'
    ctx.lineWidth = 5 * (1 - t) + 1
    ctx.beginPath()
    ctx.ellipse(x + 14 * unit.side, y, 20 + 55 * t, (5 + 10 * t) * aspect, 0, 0, Math.PI * 2)
    ctx.stroke()
  },
  daiou(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age < 0.55 || age > 1.15) return
    const t = (age - 0.55) / 0.6
    ctx.fillStyle = `rgba(255, 211, 75, ${1 - t})`
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 2.5) * (8 + 12 * t), y - (15 + (i % 3) * 8 + 25 * t) * aspect, 2.5 * (1 - t), 0, Math.PI * 2)
      ctx.fill()
    }
  },
  aircon(ctx, unit, age, layer, x, y, aspect) {
    if (age > 1.3) return
    if (age < 0.2) HURT_VFX.aircon(ctx, unit, age, layer, x, y, aspect)
    if (layer === 'floor' && age > 0.3) {
      ctx.fillStyle = '#aeeaff'
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - age / 1.3))
      ctx.beginPath()
      ctx.ellipse(x, y, 18 + age * 9, 4 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (layer === 'above' && age < 0.8) {
      ctx.fillStyle = '#44494c'
      ctx.globalAlpha = 0.55 * (1 - age / 0.8)
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(x + (i - 1) * 7 + age * 8, y - (35 + i * 7 + age * 35) * aspect, 3 + age * 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
  ramen(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age < 0.2 || age > 1.3) return
    const spread = Math.min(1, (age - 0.2) / 0.35)
    ctx.globalAlpha = 0.7 * Math.min(1, (1.3 - age) / 0.35)
    ctx.fillStyle = '#e9ae36'
    ctx.beginPath()
    ctx.ellipse(x, y, 24 * spread, 7 * aspect * spread, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff0a3'
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(x - 16 * spread, y + (i - 1) * 2 * aspect)
      ctx.bezierCurveTo(x - 6, y - 5 * aspect, x + 6, y + 5 * aspect, x + 16 * spread, y + (i - 1) * 2 * aspect)
      ctx.stroke()
    }
  },
  yofukashi(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age < 0.2 || age > 1.25) return
    ctx.globalAlpha = Math.min(1, (age - 0.2) * 4, (1.25 - age) * 3)
    ctx.fillStyle = '#aaa8f1'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText('Z', x + 10 + age * 10, y - (45 + age * 25) * aspect)
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('z', x + 22 + age * 9, y - (37 + age * 25) * aspect)
  },
  sake: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'floor' || age < 0.3 || age > 1.3) return
    ctx.globalAlpha = Math.min(0.7, (age - 0.3) * 3, (1.3 - age) * 3)
    ctx.fillStyle = '#dcf6f5'
    ctx.beginPath()
    ctx.ellipse(x + unit.side * 20, y, Math.min(30, (age - 0.3) * 65), 5 * aspect, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  jiro: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'floor' || age < 0.45 || age > 1.4) return
    ctx.globalAlpha = Math.min(1, (age - 0.45) * 5, (1.4 - age) * 4)
    ctx.fillStyle = '#d5e5a4'
    for (let index = 0; index < 5; index++) {
      ctx.beginPath()
      ctx.ellipse(x + (index - 2) * 10, y + ((index % 2) - 0.5) * 5 * aspect, 5, 2 * aspect, 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  yakiniku: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 1.1) return
    ctx.globalAlpha = Math.min(0.55, (1.1 - age) * 0.8)
    ctx.fillStyle = '#f1f1ed'
    for (let index = 0; index < 3; index++) {
      ctx.beginPath()
      ctx.arc(x + Math.sin(age * 5 + index) * 5, y - (35 + age * 35 + index * 8) * aspect, 3 + age * 4, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  garlic: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.95) return
    ctx.globalAlpha = 0.38 * (1 - age / 0.95)
    ctx.fillStyle = '#bdcf54'
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 2) * (8 + age * 18), y - (45 + (i % 2) * 10 + age * 18) * aspect, 6 + age * 10, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  curry: (ctx, unit, age, layer, x, y, aspect) => {
    if (age > 0.95) return
    ctx.globalAlpha = Math.min(1, (0.95 - age) / 0.24)
    if (layer === 'floor' && age > 0.25) {
      ctx.fillStyle = '#a8541a'
      ctx.beginPath()
      ctx.ellipse(x, y, 30 * Math.min(1, (age - 0.25) * 4), 6 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (layer === 'above' && age < 0.6) {
      ctx.fillStyle = '#ec5639'
      ctx.globalAlpha *= 0.45 * (1 - age / 0.6)
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(x + (i - 1.5) * 9, y - (34 + age * 35 + (i % 2) * 8) * aspect, 6 + age * 7, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
  milk: (ctx, unit, age, layer, x, y, aspect) => {
    if (age > 0.85) return
    ctx.globalAlpha = Math.min(1, (0.85 - age) / 0.21)
    ctx.fillStyle = '#f9ffff'
    if (layer === 'floor') {
      ctx.fillStyle = '#b8dce9'
      ctx.beginPath()
      ctx.ellipse(x, y, 27 * Math.min(1, age * 4), 6 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f9ffff'
      ctx.beginPath()
      ctx.ellipse(x, y, 23 * Math.min(1, age * 4), 4 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (layer === 'above' && age < 0.5) {
      const spoutY = y - 55 * (1 - 0.65 * Math.min(1, age / 0.4)) * aspect
      ctx.strokeStyle = '#f9ffff'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, spoutY)
      ctx.lineTo(x, spoutY - 12 * Math.sin((Math.PI * age) / 0.5) * aspect)
      ctx.stroke()
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.ellipse(
          x + (i - 1.5) * age * 30,
          y - (55 * (1 - 0.65 * Math.min(1, age / 0.4)) + Math.sin((Math.PI * age) / 0.5) * (18 + i * 4)) * aspect,
          3,
          5 * aspect,
          0,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
    }
  },
  oyster: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age < 0.1 || age > 0.95) return
    ctx.globalAlpha = Math.min(1, (age - 0.1) / 0.12, (0.95 - age) / 0.24)
    ctx.fillStyle = '#bd83cf'
    for (let index = 0; index < 4; index++) {
      const rise = (age * 35 + index * 11) % 42
      ctx.beginPath()
      ctx.arc(x + (index - 1.5) * 7, y - (12 + rise) * aspect, 2 + (index % 2), 0, Math.PI * 2)
      ctx.fill()
    }
  },
  ice: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'floor' || age > 1) return
    const spread = Math.min(1, age / 0.65)
    ctx.globalAlpha = Math.min(0.8, age * 4, (1 - age) / 0.25)
    for (const [offset, color] of [
      [-9, '#f6b6c8'],
      [9, '#bff0d4']
    ]) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(x + offset, y, 5 + 17 * spread, (2 + 4 * spread) * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  energy: (ctx, unit, age, layer, x, y, aspect) => {
    if (layer !== 'above' || age > 0.85) return
    ctx.globalAlpha = Math.min(0.85, age / 0.1, (0.85 - age) / 0.22)
    ctx.fillStyle = '#eaffcb'
    for (let index = 0; index < 5; index++) {
      ctx.beginPath()
      ctx.arc(x + (index - 2) * 5, y - (10 + ((age * 35 + index * 7) % 40)) * aspect, 2 + (index % 2), 0, Math.PI * 2)
      ctx.fill()
    }
  },
  cleaner(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age < 0.3 || age > 1.2) return
    ctx.globalAlpha = Math.min(1, (age - 0.3) * 5, (1.2 - age) * 4)
    ctx.fillStyle = '#ffe46a'
    for (let index = 0; index < 3; index++) {
      const angle = age * 7 + (index * Math.PI * 2) / 3
      ctx.beginPath()
      for (let point = 0; point < 10; point++) {
        const ray = (point * Math.PI) / 5 - Math.PI / 2
        const radius = point % 2 ? 1.5 : 4
        const px = x + Math.cos(angle) * 16 + Math.cos(ray) * radius
        const py = y - (35 + Math.sin(angle) * 5) * aspect + Math.sin(ray) * radius * aspect
        if (point) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }
  },
  yogurt(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age < 0.2 || age > 1.2) return
    const spread = Math.min(1, (age - 0.2) / 0.3)
    ctx.globalAlpha = Math.min(0.85, (1.2 - age) * 3)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(x - unit.side * 12 * spread, y, 27 * spread, 7 * aspect * spread, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  sayu(ctx, unit, age, layer, x, y, aspect) {
    if (age > 1.25) return
    if (layer === 'floor' && age > 0.2) {
      const spread = Math.min(1, (age - 0.2) / 0.3)
      ctx.globalAlpha = 0.65 * Math.min(1, (1.25 - age) * 4)
      ctx.fillStyle = '#bcecff'
      ctx.beginPath()
      ctx.ellipse(x - unit.side * 10 * spread, y, 25 * spread, 6 * aspect * spread, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (layer === 'above' && age > 0.3) {
      ctx.globalAlpha = 0.5 * Math.min(1, (1.25 - age) * 3)
      ctx.fillStyle = '#ffffff'
      for (let index = 0; index < 3; index++) {
        ctx.beginPath()
        ctx.arc(x + (index - 1) * 6, y - (20 + index * 7 + age * 20) * aspect, 3 + age * 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
  washiki(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age > 1.2) return
    ctx.globalAlpha = Math.min(0.75, age * 5, (1.2 - age) * 3)
    ctx.strokeStyle = '#8fdcff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(x, y - 4 * aspect, 12 + age * 18, (3 + age * 3) * aspect, age * 2, 0, Math.PI * 1.7)
    ctx.stroke()
  },
  mop(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age < 0.2 || age > 0.9) return
    ctx.globalAlpha = Math.min(1, (age - 0.2) * 5, (0.9 - age) * 4)
    ctx.fillStyle = '#a9e7ff'
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(x + (i - 1) * (9 + age * 8), y - (40 + i * 5 - age * 25) * aspect, 2.5, 4 * aspect, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  yoshiki(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age < 0.15 || age > 1.3) return
    const spread = Math.min(1, (age - 0.15) / 0.45)
    ctx.globalAlpha = 0.65 * Math.min(1, (1.3 - age) / 0.3)
    ctx.fillStyle = '#a9e6ff'
    ctx.beginPath()
    ctx.ellipse(x + unit.side * 8 * spread, y, 24 * spread, 6 * aspect * spread, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#effcff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(x, y - 2 * aspect, 12 * spread, 3 * aspect * spread, age * 2, 0, Math.PI * 1.7)
    ctx.stroke()
  },
  seichou(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'above' || age > 1.1) return
    ctx.fillStyle = '#fff1f7'
    ctx.globalAlpha = 0.8 * (1 - age / 1.1)
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.arc(x + (i - 3) * (4 + age * 24), y - (22 + age * (22 + (i % 3) * 12)) * aspect, 3 + age * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  geridome(ctx, unit, age, layer, x, y, aspect) {
    if (layer !== 'floor' || age < 0.25 || age > 1.4) return
    const spread = Math.min(1, (age - 0.25) / 0.45)
    ctx.globalAlpha = Math.min(1, (1.4 - age) / 0.3)
    ctx.fillStyle = '#f9f9f3'
    ctx.strokeStyle = '#a7a7a2'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.ellipse(x + (i - 2) * 14 * spread, y + (i % 2 ? 3 : -2) * aspect, 4, 2 * aspect, i * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (age < 0.7) {
      ctx.globalAlpha = 0.35 * (1 - (age - 0.25) / 0.45)
      ctx.strokeStyle = '#d5d4cb'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.ellipse(x, y, 15 + spread * 24, (4 + spread * 5) * aspect, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

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
  if (charged && unit.motion === 'walk') {
    // ゲリラ奇襲 ready: red speed lines trail behind it (its back faces its own fort) and dust kicks up.
    const back = unit.side
    ctx.strokeStyle = '#ef512c'
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const phase = (time * 3 + i / 3) % 1
      const lineY = -bodyHeight * (0.22 + i * 0.2)
      ctx.globalAlpha = 0.85 * (1 - phase)
      ctx.beginPath()
      ctx.moveTo(back * (16 + phase * 8), lineY)
      ctx.lineTo(back * (30 + phase * 16), lineY)
      ctx.stroke()
    }
    ctx.fillStyle = '#c4ae8d'
    for (let i = 0; i < (reduced ? 1 : 3); i++) {
      const phase = (time * 2.2 + i / 3) % 1
      ctx.globalAlpha = 0.6 * (1 - phase)
      ctx.beginPath()
      ctx.ellipse(
        back * (12 + phase * 18),
        -2 - phase * 6 * aspect,
        3 + phase * 4,
        (2 + phase * 3) * aspect,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  if (unit.ramp > 0) {
    // カフェイン加速: green fizz bubbles rise around the can, one more per stack.
    ctx.fillStyle = '#d6ff7a'
    for (let i = 0; i < unit.ramp; i++) {
      const phase = (time * 1.6 + i * 0.37) % 1
      ctx.globalAlpha = 0.9 * (1 - phase)
      ctx.beginPath()
      ctx.arc(Math.sin(i * 2.1 + time * 3) * 12, -bodyHeight * (0.3 + phase * 0.8), 2 + (i % 2), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
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
  const count = reduced ? 2 : 4
  for (let i = 0; i < count; i++) {
    const angle = time * 3 + (i * Math.PI * 2) / count
    const px = Math.cos(angle) * 20
    const py = -bodyHeight * 0.65 + Math.sin(angle) * 10 * aspect
    if (control === 'stun' && i < (reduced ? 2 : 3)) {
      const pillAngle = time * 3 + (i * Math.PI * 2) / (reduced ? 2 : 3)
      ctx.save()
      ctx.translate(Math.cos(pillAngle) * 20, -bodyHeight - 29 + Math.sin(pillAngle) * 4)
      ctx.rotate(pillAngle)
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (active(unit.rally, time)) {
      ctx.fillStyle = '#ffe278'
      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (unit.poison?.some((poison) => active(poison, time))) {
      ctx.strokeStyle = '#d992f1'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc((i - (count - 1) / 2) * 12, -((time * 22 + i * 13) % bodyHeight), 3 + (i % 2), 0, Math.PI * 2)
      ctx.stroke()
    }
    if (active(unit.vuln, time)) {
      ctx.fillStyle = '#d8ed75'
      ctx.beginPath()
      ctx.ellipse(
        (i - (count - 1) / 2) * 10,
        -bodyHeight * 0.65 + ((time * 20 + i * 9) % 25),
        2.5,
        5,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    if (active(unit.weak, time)) {
      ctx.strokeStyle = '#ffb0ca'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo((i - 1.5) * 9, -bodyHeight * 0.35)
      ctx.bezierCurveTo(
        (i - 1.5) * 9 - 6,
        -bodyHeight * 0.5,
        (i - 1.5) * 9 + 6,
        -bodyHeight * 0.55,
        (i - 1.5) * 9,
        -bodyHeight * 0.7
      )
      ctx.stroke()
    }
  }
  if (active(unit.weak, time)) {
    ctx.strokeStyle = '#ff9fc0'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(23, -bodyHeight * 0.65)
    ctx.lineTo(23, -bodyHeight * 0.35)
    ctx.lineTo(18, -bodyHeight * 0.43)
    ctx.moveTo(23, -bodyHeight * 0.35)
    ctx.lineTo(28, -bodyHeight * 0.43)
    ctx.stroke()
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
  ctx.save()
  ctx.translate(0, -bodyHeight - 30 * aspect)
  if (active(unit.curry, time)) {
    const remaining = Math.max(0, unit.curry.end - time)
    const pulse = 1 + 0.16 * Math.sin(12 * Math.log(remaining + 0.15))
    ctx.save()
    ctx.translate(-13, 0)
    ctx.scale(pulse, pulse)
    ctx.fillStyle = '#f34835'
    ctx.beginPath()
    ctx.moveTo(-7, -5)
    ctx.bezierCurveTo(5, -9, 10, -2, 3, 5)
    ctx.quadraticCurveTo(-2, 10, -7, 8)
    ctx.quadraticCurveTo(0, 4, -7, -5)
    ctx.fill()
    ctx.strokeStyle = '#70b341'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-6, -4)
    ctx.lineTo(-9, -9)
    ctx.stroke()
    ctx.restore()
  }
  if (control === 'confuse') {
    ctx.strokeStyle = '#ed5148'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const angle = i * 0.5 + time * 3
      const radius = i * 0.35
      if (!i) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    ctx.stroke()
  }
  if (active(unit.rally, time)) {
    ctx.fillStyle = '#ffd65d'
    ctx.beginPath()
    ctx.moveTo(8, 5)
    ctx.lineTo(6, -7)
    ctx.lineTo(12, -2)
    ctx.lineTo(16, -9)
    ctx.lineTo(20, -2)
    ctx.lineTo(26, -7)
    ctx.lineTo(24, 5)
    ctx.closePath()
    ctx.fill()
  }
  if (active(unit.drowsy, time)) {
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = '#52559a'
    ctx.fillText('Z', 24, -8)
  }
  ctx.restore()
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

  if (effect.attackerKey === 'yoshiki' && age >= 0 && age < 0.22) {
    const startX = muzzle?.x ?? effect.from
    const startY = ((muzzle?.y ?? floor - 30) - floor) / aspect
    const endY = ((effect.targetY ?? floor - 30) - floor) / aspect
    ctx.globalAlpha = Math.min(1, (0.22 - age) / 0.08)
    ctx.strokeStyle = '#4cb6ed'
    ctx.lineWidth = 10
    line(startX, startY, effect.x, endY)
    ctx.strokeStyle = '#efffff'
    ctx.lineWidth = 5
    line(startX, startY, effect.x, endY)
  }

  if (effect.attackerKey === 'korokoro' && effect.arrived && !effect.missed && effect.victims?.length) {
    const first = effect.victims[0]
    const second = effect.victims[1]
    const start = effect.victimOrigins?.find((unit) => unit.id === first.id)?.x ?? effect.primaryX
    const target = units.find((unit) => unit.id === second?.id)
    const end = target?.x ?? start + dir * 30
    const duration = second ? second.at - first.at : 0.35
    const elapsed = time - first.at
    if (elapsed >= 0 && elapsed < duration) {
      const t = Math.min(1, elapsed / duration)
      const firstUnit = units.find((unit) => unit.id === first.id)
      const ground = ((firstUnit ? laneY(firstUnit) : floor) - floor) / aspect
      const destination = target ? (laneY(target) - floor) / aspect : ground
      ctx.globalAlpha = second ? 1 : 1 - t
      ctx.fillStyle = '#804319'
      ctx.strokeStyle = '#f1c17b'
      ctx.lineWidth = 2
      ellipse(start + (end - start) * t, ground + (destination - ground) * t - 5 - Math.sin(t * Math.PI) * 8, 6, 6)
    }
  }

  const plus = (x, y, t) => {
    ctx.globalAlpha = Math.min(1, (1 - t) * 3)
    ctx.strokeStyle = '#f0fff2'
    ctx.lineWidth = 5
    line(x - 5, y - t * 30, x + 5, y - t * 30)
    line(x, y - 5 - t * 30, x, y + 5 - t * 30)
    ctx.strokeStyle = '#35bf59'
    ctx.lineWidth = 3
    line(x - 5, y - t * 30, x + 5, y - t * 30)
    line(x, y - 5 - t * 30, x, y + 5 - t * 30)
  }
  for (const healed of effect.healed ?? []) {
    const t = (time - healed.at) / 0.55
    if (t < 0 || t >= 1) continue
    const unit = units.find((candidate) => candidate.id === healed.id) ?? healed
    const y = (laneY(unit) - floor) / aspect
    plus(unit.x, y - 65, t)
    ctx.globalAlpha = 1 - t
    ctx.strokeStyle = '#ff9dcc'
    ctx.lineWidth = 2.5
    for (let index = 0; index < count; index++) {
      const x = unit.x + (index - (count - 1) / 2) * 8
      const sy = y - 75 + ((t * 50 + index * 13) % 55)
      line(x - 3, sy, x + 3, sy)
      line(x, sy - 3, x, sy + 3)
    }
  }
  if (effect.attackerKey === 'ramen' && !effect.missed) {
    const t = (time - (effect.victims?.[0]?.at ?? effect.releasedAt + 0.12)) / 0.5
    if (t >= 0 && t < 1) {
      const source = units.find((unit) => unit.id === effect.sourceId) ?? effect.source
      const victim = units.find((unit) => unit.id === effect.targetId)
      const sx = source?.x ?? effect.from
      const sy = source ? (laneY(source) - floor) / aspect - 40 : -40
      const vy = victim ? (laneY(victim) - floor) / aspect - 30 : -30
      plus(sx, sy - 25, t)
      ctx.fillStyle = '#ffd552'
      ctx.strokeStyle = '#fff4bb'
      ctx.lineWidth = 1.5
      for (let index = 0; index < (reduced ? 2 : 4); index++) {
        const p = Math.max(0, Math.min(1, t * 1.5 - index * 0.12))
        ellipse(effect.primaryX + (sx - effect.primaryX) * p, vy + (sy - vy) * p - Math.sin(p * Math.PI) * 18, 3, 4)
      }
    }
  }
  for (const collision of effect.collisions ?? []) {
    const t = (time - collision.at) / 0.3
    if (t < 0 || t >= 1) continue
    const unit = units.find((candidate) => candidate.id === collision.id)
    const y = unit ? (laneY(unit) - floor) / aspect - 25 : -25
    ctx.globalAlpha = 1 - t
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    for (let index = 0; index < count; index++) {
      const angle = (index * Math.PI * 2) / count
      line(
        collision.x + Math.cos(angle) * 7,
        y + Math.sin(angle) * 7,
        collision.x + Math.cos(angle) * (18 + t * 12),
        y + Math.sin(angle) * (18 + t * 12)
      )
    }
  }
  if (effect.attackerKey === 'daiou' && age >= 0 && age < 0.5) {
    ctx.globalAlpha = Math.min(1, (0.5 - age) / 0.12)
    ctx.strokeStyle = '#ffe16d'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.ellipse(effect.from, 0, Math.max(1, 140 * Math.min(1, age / 0.38)), 5 + age * 22, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (effect.explosion && age >= 0 && age < 0.22) {
    const t = age / 0.22
    const y = ((effect.targetY ?? floor - 30) - floor) / aspect
    ctx.globalAlpha = 1 - t * 0.65
    for (let index = 0; index < count; index++) {
      const angle = (index * Math.PI * 2) / count
      ctx.fillStyle = index % 2 ? '#ff3d19' : '#ffae24'
      ellipse(effect.x + Math.cos(angle) * 26 * t, y + Math.sin(angle) * 26 * t, 15 + 8 * t, 15 + 8 * t)
      ctx.fillStyle = '#554a49'
      ellipse(effect.x + Math.cos(angle) * 32 * t, y - 25 - t * 20 + Math.sin(angle) * 12, 5 + 7 * t, 5 + 7 * t)
    }
  }

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
