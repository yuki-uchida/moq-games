/**
 * Ground and material tile painters (grass, asphalt, plaza, crystal, signs with invented text…). DOM only.
 */
import { bricks, corrugated, type Painter } from './paint-facades'
import { FONT, fitText, withAlpha, type Brush } from './paint-kit'

function grassBlades(b: Brush, count: number, colors: string[], len: [number, number]) {
  const c = b.c
  c.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = b.r() * b.S
    const y = b.r() * b.S
    const l = b.range(len[0], len[1])
    const a = -Math.PI / 2 + b.range(-0.5, 0.5)
    c.strokeStyle = b.pick(colors)
    c.lineWidth = b.range(1, 2.2)
    b.wrap(x, y, l, (px, py) => {
      c.beginPath()
      c.moveTo(px, py)
      c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l)
      c.stroke()
    })
  }
}

export const SURFACES: Record<string, Painter> = {
  tGrass(b) {
    b.fill('#76a552')
    b.blotch(22, ['#5c8e40', '#93bd63', '#a9b46a', '#6a9a48', '#8aa85a'], [18, 70], 0.55)
    grassBlades(b, 1800, ['#5f9640', '#86b85a', '#4e8436', '#9cc66c', '#a8b868'], [3, 8])
    b.blotch(6, ['#8a7a50'], [8, 20], 0.35)
    b.speckle(90, ['#f4f0d0', '#ffd0e0', '#fff4a0'], [1.5, 2.5], 0.85)
  },
  tConcrete(b) {
    const S = b.S
    b.fill('#bdb8ae')
    b.speckle(2500, ['#a8a298', '#d2cec6', '#9a958c'], [1, 2], 0.35)
    b.blotch(10, ['#8a8478', '#d8d4cc', '#7a8a6a'], [20, 60], 0.3)
    b.c.fillStyle = 'rgba(60,55,50,0.35)'
    b.c.fillRect(0, 0, S, 2)
    b.c.fillRect(0, 0, 2, S)
    b.c.fillRect(S / 2, 0, 1.5, S)
    for (let i = 0; i < 3; i++) b.crack(b.r() * S, b.r() * S, 9)
    grassBlades(b, 40, ['#6a9a4a', '#5a8a3a'], [3, 6])
  },
  tDirt(b) {
    b.fill('#9a7c5a')
    b.blotch(16, ['#86684a', '#ae9070', '#7a5e40'], [20, 60], 0.45)
    b.speckle(1800, ['#6a5038', '#c0a07a', '#8a7058'], [1, 3], 0.45)
    for (let i = 0; i < 12; i++) {
      const x = b.r() * b.S
      const y = b.r() * b.S
      b.c.fillStyle = b.pick(['#8a8478', '#a09a8e', '#6a6458'])
      b.c.beginPath()
      b.c.ellipse(x, y, b.range(2, 5), b.range(1.5, 4), b.r() * 3, 0, Math.PI * 2)
      b.c.fill()
    }
    grassBlades(b, 60, ['#7a9a4a', '#6a8a3a'], [3, 6])
  },
  tPlaza(b) {
    const S = b.S
    b.fill('#a89a88')
    const n = 4
    const s = S / n
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        b.c.fillStyle = b.pick(['#b9ac97', '#ad9f88', '#c2b5a0', '#a69780'])
        b.rr(x * s + 2, y * s + 2, s - 4, s - 4, 4)
        b.c.fill()
        if ((x + y) % 3 === 0) {
          b.c.fillStyle = 'rgba(160,120,90,0.25)'
          b.rr(x * s + 10, y * s + 10, s - 20, s - 20, 3)
          b.c.fill()
        }
      }
    b.speckle(900, ['#8a7e6c', '#e0d6c4'], [1, 2], 0.35)
    grassBlades(b, 120, ['#6a9a4a', '#7aaa5a'], [2, 5])
    for (let i = 0; i < 2; i++) b.crack(b.r() * S, b.r() * S, 6)
  },
  tDock(b) {
    const S = b.S
    b.fill('#7a6048')
    const n = 8
    for (let i = 0; i < n; i++) {
      const y = (i * S) / n
      b.c.fillStyle = b.pick(['#8a6c50', '#7a5e44', '#94765a', '#6e5440'])
      b.c.fillRect(0, y + 1, S, S / n - 2)
      b.c.fillStyle = 'rgba(0,0,0,0.4)'
      b.c.fillRect(0, y, S, 1.5)
      const seam = b.r() * S
      b.c.fillRect(seam, y, 2, S / n)
      b.c.fillStyle = '#3a3634'
      b.c.fillRect(seam - 6, y + S / n / 2 - 1, 2, 2)
      b.c.fillRect(seam + 6, y + S / n / 2 - 1, 2, 2)
    }
    b.speckle(800, ['#5a4632', '#a08060'], [1, 3], 0.35)
    b.blotch(6, ['#5a6a5a'], [20, 40], 0.3)
  },
  tCrystal(b, e) {
    const S = b.S
    b.fill('#3c2c4a')
    b.blotch(16, ['#4a3a5c', '#2a1e36', '#5a3e70'], [20, 60], 0.5)
    b.speckle(1200, ['#6a5080', '#20182a'], [1, 3], 0.4)
    for (let i = 0; i < 7; i++) {
      const x = b.r() * S
      const y = b.r() * S
      b.crack(x, y, 12, '#9a5ae0', 2.4)
      e.crack(x, y, 12, '#c070ff', 2.4)
    }
    for (let i = 0; i < 10; i++) {
      const x = b.r() * S
      const y = b.r() * S
      const r = b.range(3, 7)
      b.c.fillStyle = '#a070e0'
      b.c.beginPath()
      b.c.arc(x, y, r, 0, Math.PI * 2)
      b.c.fill()
      e.c.fillStyle = 'rgba(220,150,255,0.8)'
      e.c.beginPath()
      e.c.arc(x, y, r * 0.6, 0, Math.PI * 2)
      e.c.fill()
    }
  },
  tVirtual(b, e) {
    const S = b.S
    b.fill('#e8f0f5')
    b.vgrad(0, 0, S, S, '#eef5f9', '#e2ecf2')
    for (const brush of [b, e]) {
      brush.c.fillStyle = brush === b ? '#b8dfea' : 'rgba(40,210,255,0.85)'
      brush.c.fillRect(0, 0, S, 3)
      brush.c.fillRect(0, 0, 3, S)
      brush.c.fillStyle = brush === b ? '#d0e8f0' : 'rgba(40,210,255,0.3)'
      brush.c.fillRect(S / 2, 0, 1.5, S)
      brush.c.fillRect(0, S / 2, S, 1.5)
    }
    // Corner ticks.
    e.c.fillStyle = 'rgba(120,240,255,0.9)'
    e.c.fillRect(S / 2 - 6, S / 2 - 1, 12, 2)
    e.c.fillRect(S / 2 - 1, S / 2 - 6, 2, 12)
  },
  tWater(b) {
    const S = b.S
    b.fill('#2f6f8a')
    b.blotch(14, ['#3a86a0', '#246078', '#4a9ab0'], [20, 60], 0.5)
    b.c.strokeStyle = 'rgba(255,255,255,0.25)'
    b.c.lineWidth = 1.5
    for (let i = 0; i < 40; i++) {
      const x = b.r() * S
      const y = b.r() * S
      b.c.beginPath()
      b.c.arc(x, y, b.range(6, 14), Math.PI * 1.15, Math.PI * 1.85)
      b.c.stroke()
    }
  },
  tAsphalt(b) {
    const S = b.S
    b.fill('#4a4c50')
    b.speckle(4000, ['#3a3c40', '#5e6064', '#6a6a6a', '#2e3034'], [1, 2], 0.5)
    b.blotch(10, ['#3a3c40', '#5a5c5e', '#4a4038'], [25, 70], 0.4)
    // Repair patch.
    b.c.fillStyle = 'rgba(30,32,36,0.6)'
    b.c.fillRect(b.r() * S * 0.6, b.r() * S * 0.6, b.range(40, 80), b.range(30, 60))
    for (let i = 0; i < 6; i++) b.crack(b.r() * S, b.r() * S, 12, 'rgba(20,20,20,0.7)', 1.6)
    grassBlades(b, 50, ['#6a8a3a', '#5a7a32'], [3, 7])
  },
  tSidewalk(b) {
    const S = b.S
    b.fill('#a8a49a')
    const n = 4
    const s = S / n
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        b.c.fillStyle = b.pick(['#c4c0b6', '#bab6ac', '#ccc8be'])
        b.c.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3)
      }
    // Tactile paving strip.
    b.c.fillStyle = '#d8b84a'
    b.c.fillRect(0, s * 2 + 1.5, S, s - 3)
    b.c.fillStyle = 'rgba(0,0,0,0.12)'
    for (let x = 4; x < S; x += 8) b.c.fillRect(x, s * 2 + 4, 4, s - 8)
    b.speckle(900, ['#8a867c', '#dad6cc'], [1, 2], 0.35)
    grassBlades(b, 90, ['#6a9a4a', '#5a8a3a'], [2, 5])
  },
  tCrosswalk(b) {
    const S = b.S
    SURFACES.tAsphalt(b, b)
    b.c.fillStyle = 'rgba(240,238,228,0.92)'
    for (let x = 0; x < S; x += S / 4) b.c.fillRect(x + 6, 0, S / 8, S)
    b.speckle(700, ['#4a4c50', '#3a3c40'], [1, 3], 0.5)
  },
  tRail(b) {
    b.fill('#7a746a')
    b.speckle(3000, ['#5a564e', '#9a948a', '#6a665e', '#8a7a6a'], [1.5, 3.5], 0.7)
  },
  mConcrete(b) {
    const S = b.S
    b.fill('#c4bfb6')
    b.speckle(2000, ['#aaa59c', '#dad6ce'], [1, 2], 0.35)
    b.blotch(10, ['#9a9488', '#7a8a6a', '#d8d4cc'], [20, 50], 0.3)
    b.c.fillStyle = 'rgba(0,0,0,0.12)'
    b.c.fillRect(0, 0, S, 1.5)
    b.c.fillRect(0, 0, 1.5, S)
    for (let i = 0; i < 4; i++) b.c.fillRect(i * (S / 4) + 30, S * 0.5, 3, 3)
    for (let i = 0; i < 2; i++) b.crack(b.r() * S, b.r() * S, 7)
  },
  mBrick(b) {
    bricks(b, 0, 0, b.S, b.S, ['#a85a42', '#9a4c38', '#b46448', '#8e4434'], 24, 12)
    b.blotch(8, ['#5a6a4a', '#3a2a22'], [15, 40], 0.3)
  },
  mSandbag(b) {
    const S = b.S
    b.fill('#8a7a5a')
    for (let y = 0, r = 0; y < S; y += S / 5, r++)
      for (let x = -(r % 2) * 30; x < S; x += 60) {
        const g = b.c.createRadialGradient(x + 30, y + 18, 4, x + 30, y + 24, 36)
        g.addColorStop(0, '#c8b890')
        g.addColorStop(1, '#8a7854')
        b.c.fillStyle = g
        b.rr(x + 2, y + 2, 56, S / 5 - 4, 14)
        b.c.fill()
      }
    b.speckle(600, ['#6a5a40', '#d8c8a0'], [1, 2], 0.3)
  },
  mPlanks(b) {
    const S = b.S
    b.fill('#9a7a58')
    for (let x = 0; x < S; x += S / 6) {
      b.c.fillStyle = b.pick(['#a8885e', '#94744e', '#b09068', '#8a6a48'])
      b.c.fillRect(x + 1, 0, S / 6 - 2, S)
      b.c.strokeStyle = 'rgba(60,40,20,0.25)'
      for (let k = 0; k < 4; k++) {
        b.c.beginPath()
        const gx = x + b.range(4, S / 6 - 4)
        b.c.moveTo(gx, 0)
        b.c.bezierCurveTo(gx + 4, S * 0.3, gx - 4, S * 0.7, gx, S)
        b.c.stroke()
      }
    }
    b.c.fillStyle = '#3a3030'
    for (let x = 0; x < S; x += S / 6) {
      b.c.fillRect(x + 8, 10, 3, 3)
      b.c.fillRect(x + 8, S - 14, 3, 3)
    }
  },
  mPanel(b, e) {
    const S = b.S
    b.fill('#eef4f8')
    b.vgrad(0, 0, S, S, '#f8fbfd', '#e2ecf2')
    for (const brush of [b, e]) {
      brush.c.fillStyle = brush === b ? '#a8dcec' : 'rgba(40,210,255,0.9)'
      brush.c.fillRect(0, 0, S, 3)
      brush.c.fillRect(0, 0, 3, S)
      brush.c.fillRect(S * 0.2, S * 0.48, S * 0.6, 3)
    }
  },
  mCrystal(b, e) {
    const S = b.S
    b.fill('#9a62e0')
    b.blotch(10, ['#c89aff', '#6a34b0', '#e0c0ff'], [20, 60], 0.5)
    for (let i = 0; i < 9; i++) {
      b.c.fillStyle = withAlpha(b.pick(['#e8c8ff', '#9a5ae0', '#7a3ac0']), 0.5)
      b.c.beginPath()
      const x = b.r() * S
      b.c.moveTo(x, 0)
      b.c.lineTo(x + b.range(10, 40), 0)
      b.c.lineTo(x + b.range(-20, 20), S)
      b.c.fill()
    }
    e.c.fillStyle = 'rgba(170,90,240,0.55)'
    e.c.fillRect(0, 0, S, S)
    e.blotch(8, ['#e8b8ff'], [20, 50], 0.6)
    e.c.fillStyle = 'rgba(255,230,255,0.9)'
    for (let i = 0; i < 5; i++) e.c.fillRect(b.r() * S, 0, 2, S)
  },
  mGrating(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    b.c.fillStyle = '#7a868c'
    for (let x = 0; x < S; x += 12) b.c.fillRect(x, 0, 3, S)
    for (let y = 0; y < S; y += 30) b.c.fillRect(0, y, S, 4)
  },
  mChainlink(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    b.c.strokeStyle = '#a8b0b4'
    b.c.lineWidth = 2.2
    const s = S / 8
    for (let i = -8; i < 16; i++) {
      b.c.beginPath()
      b.c.moveTo(i * s, 0)
      b.c.lineTo(i * s + S, S)
      b.c.stroke()
      b.c.beginPath()
      b.c.moveTo(i * s, S)
      b.c.lineTo(i * s + S, 0)
      b.c.stroke()
    }
  },
  mMetal(b) {
    const S = b.S
    b.fill('#9aa2a8')
    b.vgrad(0, 0, S, S, '#aab2b8', '#8a9298')
    b.speckle(800, ['#7a8288', '#c0c8cc'], [1, 2], 0.3)
    b.blotch(6, ['#8a5a3a', '#6a4a30'], [10, 30], 0.35)
    b.c.fillStyle = 'rgba(0,0,0,0.15)'
    b.c.fillRect(0, 0, S, 2)
  },
  mRust(b) {
    b.fill('#9a6040')
    b.blotch(20, ['#7a4028', '#b8784a', '#5a3a2a', '#a08070'], [10, 50], 0.6)
    b.speckle(1500, ['#6a3a20', '#c08050'], [1, 3], 0.5)
  },
  mCrateWood(b) {
    const S = b.S
    SURFACES.mPlanks(b, b)
    b.c.fillStyle = '#6a4a30'
    b.c.fillRect(0, 0, S, 20)
    b.c.fillRect(0, S - 20, S, 20)
    b.c.fillRect(0, 0, 20, S)
    b.c.fillRect(S - 20, 0, 20, S)
    b.c.save()
    b.c.translate(S / 2, S / 2)
    b.c.rotate(Math.PI / 4)
    b.c.fillRect(-S * 0.7, -10, S * 1.4, 20)
    b.c.restore()
    b.c.fillStyle = 'rgba(40,30,20,0.6)'
    b.c.font = `900 26px ${FONT}`
    b.c.textAlign = 'center'
    b.c.fillText('取扱注意', S / 2, S * 0.28)
  },
  mCrateMetal(b) {
    const S = b.S
    b.fill('#6a7a84')
    b.c.fillStyle = '#5a6870'
    for (let y = 16; y < S; y += 28) b.c.fillRect(10, y, S - 20, 10)
    b.c.strokeStyle = '#4a565c'
    b.c.lineWidth = 8
    b.c.strokeRect(4, 4, S - 8, S - 8)
    b.blotch(6, ['#8a5a3a'], [10, 30], 0.4)
  },
  mCrateArk(b) {
    const S = b.S
    b.fill('#e8e2d6')
    b.c.fillStyle = '#ff8a2a'
    b.c.save()
    b.c.beginPath()
    b.c.rect(0, 0, S, S * 0.22)
    b.c.rect(0, S * 0.78, S, S * 0.22)
    b.c.clip()
    for (let x = -S; x < S * 2; x += 36) {
      b.c.beginPath()
      b.c.moveTo(x, 0)
      b.c.lineTo(x + 18, 0)
      b.c.lineTo(x + 18 + S, S)
      b.c.lineTo(x + S, S)
      b.c.fill()
    }
    b.c.restore()
    b.paw(S * 0.5, S * 0.5, 50, '#2a3a5a')
    b.c.fillStyle = '#2a3a5a'
    b.c.font = `900 22px ${FONT}`
    b.c.textAlign = 'center'
    b.c.fillText('ARK 補給', S / 2, S * 0.72)
    b.c.strokeStyle = '#9a9488'
    b.c.lineWidth = 6
    b.c.strokeRect(3, 3, S - 6, S - 6)
  },
  mContainer(b) {
    corrugated(b, '#e8e8e8', 14)
    b.blotch(12, ['#8a5a3a', '#6a6a6a'], [10, 40], 0.35)
    b.streaks(0, b.S, 0, b.S, '#7a5a40', 0.15, 10)
  },
  mContainerDoor(b) {
    const S = b.S
    corrugated(b, '#e4e4e4', 12)
    b.c.fillStyle = 'rgba(0,0,0,0.3)'
    b.c.fillRect(S / 2 - 2, 0, 4, S)
    b.c.fillStyle = '#8a8a8a'
    for (const x of [S * 0.3, S * 0.42, S * 0.58, S * 0.7]) b.c.fillRect(x, 8, 5, S - 16)
    b.c.fillStyle = 'rgba(40,40,40,0.75)'
    b.c.font = `800 18px ${FONT}`
    b.c.fillText('HNTU 402813', 12, 30)
    b.blotch(6, ['#8a5a3a'], [10, 30], 0.4)
  },
  mCarPaint(b) {
    b.fill('#e4e4e4')
    b.blotch(8, ['#b0b0b0', '#ffffff'], [20, 60], 0.3)
    b.blotch(6, ['#8a5a3a', '#6a4028'], [6, 24], 0.55)
    b.speckle(300, ['#9a6a4a'], [1, 3], 0.4)
  },
  mGlass(b) {
    const S = b.S
    b.vgrad(0, 0, S, S, '#6a8aa8', '#24323e')
    b.c.fillStyle = 'rgba(255,255,255,0.2)'
    b.c.beginPath()
    b.c.moveTo(S * 0.1, S)
    b.c.lineTo(S * 0.5, 0)
    b.c.lineTo(S * 0.75, 0)
    b.c.lineTo(S * 0.35, S)
    b.c.fill()
    b.c.strokeStyle = 'rgba(255,255,255,0.35)'
    b.crack(S * 0.6, S * 0.6, 8, 'rgba(255,255,255,0.4)', 1)
  },
  mTire(b) {
    b.fill('#2e2e30')
    b.speckle(600, ['#444446', '#1e1e20'], [1, 3], 0.5)
  },
  mRock(b) {
    b.fill('#9a948a')
    b.blotch(16, ['#7a746a', '#b4aea2', '#6a7a5a'], [15, 50], 0.5)
    b.speckle(1500, ['#5a564e', '#c8c2b6'], [1, 3], 0.4)
    for (let i = 0; i < 4; i++) b.crack(b.r() * b.S, b.r() * b.S, 8, 'rgba(40,36,30,0.5)')
  },
  mRubble(b) {
    b.fill('#aaa498')
    b.blotch(12, ['#8a8478', '#c8c2b6', '#9a5a44'], [10, 35], 0.6)
    b.speckle(2000, ['#6a645a', '#dad4c8'], [1, 4], 0.5)
  },
  mBark(b) {
    const S = b.S
    b.fill('#8a6a54')
    for (let x = 0; x < S; x += 6) {
      b.c.fillStyle = b.pick(['#7a5a46', '#9a7a62', '#6a4c3a', '#a88a70'])
      b.c.fillRect(x, 0, b.range(2, 5), S)
    }
    b.blotch(8, ['#5a7a3a'], [10, 30], 0.35)
  },
  mLeaves(b) {
    b.fill('#d8d8d8')
    b.blotch(20, ['#ffffff', '#a8a8a8'], [10, 30], 0.6)
    const c = b.c
    for (let i = 0; i < 260; i++) {
      const x = b.r() * b.S
      const y = b.r() * b.S
      const r = b.range(4, 9)
      c.fillStyle = b.pick(['#f4f4f4', '#c8c8c8', '#e0e0e0', '#b0b0b0'])
      b.wrap(x, y, r, (px, py) => {
        c.beginPath()
        c.ellipse(px, py, r, r * 0.55, b.r() * 3, 0, Math.PI * 2)
        c.fill()
      })
    }
  },
  mIvy(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    const c = b.c
    // Hanging vines with leaves; denser at the top.
    for (let v = 0; v < 16; v++) {
      let x = b.r() * S
      const len = S * b.range(0.5, 1)
      c.strokeStyle = '#3e5a26'
      c.lineWidth = 1.5
      c.beginPath()
      c.moveTo(x, 0)
      for (let y = 0; y < len; y += 6) {
        x += b.range(-3, 3)
        c.lineTo(x, y)
      }
      c.stroke()
      let lx = x
      for (let y = 0; y < len; y += 5) {
        lx += b.range(-3, 3)
        if (b.r() > 0.92 - (1 - y / len) * 0.3) continue
        for (const side of [-1, 1]) {
          c.save()
          c.translate(lx + side * b.range(2, 6), y)
          c.rotate(side * b.range(0.3, 1.2))
          const r = b.range(3.5, 6)
          c.fillStyle = b.pick(['#5e9c3c', '#4b8a32', '#73b04e', '#3f7a2c', '#86bc5a'])
          c.beginPath()
          c.moveTo(0, -r)
          c.quadraticCurveTo(r, 0, 0, r)
          c.quadraticCurveTo(-r, 0, 0, -r)
          c.fill()
          c.fillStyle = 'rgba(255,255,255,0.18)'
          c.fillRect(-0.5, -r * 0.6, 1, r * 1.2)
          c.restore()
        }
      }
    }
  },
  mMoss(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    for (let i = 0; i < 90; i++) {
      const x = b.r() * S
      const y = S * (0.3 + 0.7 * b.r() ** 0.6)
      const r = b.range(6, 18)
      const g = b.c.createRadialGradient(x, y, 0, x, y, r)
      const col = b.pick(['#6a9a3a', '#5a8a30', '#7aaa48'])
      g.addColorStop(0, withAlpha(col, 1))
      g.addColorStop(0.7, withAlpha(col, 0.9))
      g.addColorStop(1, withAlpha(col, 0))
      b.c.fillStyle = g
      b.c.fillRect(x - r, y - r, r * 2, r * 2)
    }
  },
  mGrass(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    const c = b.c
    c.lineCap = 'round'
    for (let i = 0; i < 70; i++) {
      const x = S * (0.1 + 0.8 * b.r())
      const h = S * b.range(0.45, 0.98)
      const bend = b.range(-30, 30)
      c.strokeStyle = b.pick(['#6aa040', '#82b850', '#5a9036', '#94c45e'])
      c.lineWidth = b.range(3, 6)
      c.beginPath()
      c.moveTo(x, S)
      c.quadraticCurveTo(x + bend * 0.3, S - h * 0.6, x + bend, S - h)
      c.stroke()
    }
  },
  mFlowers(b) {
    const S = b.S
    SURFACES.mGrass(b, b)
    const c = b.c
    for (let i = 0; i < 14; i++) {
      const x = S * (0.12 + 0.76 * b.r())
      const y = S * b.range(0.1, 0.55)
      const col = b.pick(['#ff8fb1', '#ffd54f', '#ffffff', '#b39ddb', '#ff7043'])
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        c.fillStyle = col
        c.beginPath()
        c.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 3.5, a, 0, Math.PI * 2)
        c.fill()
      }
      c.fillStyle = '#ffcc33'
      c.beginPath()
      c.arc(x, y, 3.5, 0, Math.PI * 2)
      c.fill()
    }
  },
  mSign0(b, e) {
    signBoard(b, e, 'ひだまり堂', '#2f5d8a', '#fff4dc', '日用品・雑貨')
  },
  mSign1(b, e) {
    signBoard(b, e, 'まるまる食堂', '#c4462e', '#fff8e8', '定食 ・ おむすび')
  },
  mSign2(b, e) {
    signBoard(b, e, 'こもれび書房', '#3f7a52', '#f6f0d8', '古本 買取')
  },
  mSign3(b, e) {
    // Vertical blade sign (painted tall, squeezed into the square tile).
    const S = b.S
    const tmp = document.createElement('canvas')
    tmp.width = 240
    tmp.height = 960
    const t = tmp.getContext('2d')!
    t.fillStyle = '#f4ead0'
    t.fillRect(0, 0, 240, 960)
    t.fillStyle = '#b8402c'
    t.fillRect(0, 0, 240, 40)
    t.fillRect(0, 920, 240, 40)
    t.fillStyle = '#2a2420'
    t.font = `900 170px ${FONT}`
    t.textAlign = 'center'
    t.textBaseline = 'middle'
    ;['喫', '茶', 'こ', 'と', 'り'].forEach((ch, i) => t.fillText(ch, 120, 140 + i * 165))
    b.c.drawImage(tmp, 0, 0, S, S)
    b.blotch(6, ['#8a6a4a'], [10, 30], 0.3)
    e.c.globalAlpha = 0.85
    e.c.drawImage(tmp, 0, 0, S, S)
    e.c.globalAlpha = 1
  },
  mBanner(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    b.c.fillStyle = '#1e3a64'
    b.c.beginPath()
    b.c.moveTo(0, 0)
    b.c.lineTo(S, 0)
    b.c.lineTo(S, S)
    b.c.lineTo(S / 2, S * 0.86)
    b.c.lineTo(0, S)
    b.c.fill()
    b.c.fillStyle = '#ff9a3c'
    b.c.fillRect(0, S * 0.06, S, 10)
    b.paw(S / 2, S * 0.42, 70, '#ffb45c')
    fitText(b.c, 'ARK', S * 0.2, S * 0.62, S * 0.6, 40, '#fff3d6', 900)
  },
  mVending(b, e) {
    const S = b.S
    b.fill('#e8e4dc')
    b.c.fillStyle = '#20262c'
    b.c.fillRect(S * 0.08, S * 0.06, S * 0.84, S * 0.5)
    e.c.fillStyle = 'rgba(200,230,255,0.7)'
    e.c.fillRect(S * 0.08, S * 0.06, S * 0.84, S * 0.5)
    const colors = ['#e84a3a', '#3a8ae8', '#f2c040', '#4ab86a', '#f08ab0', '#8a5ae0']
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 6; k++) {
        const x = S * 0.12 + k * S * 0.13
        const y = S * 0.1 + r * S * 0.15
        b.c.fillStyle = b.pick(colors)
        b.rr(x, y, S * 0.08, S * 0.1, 3)
        b.c.fill()
        b.c.fillStyle = '#ffffff'
        b.c.fillRect(x, y + S * 0.115, S * 0.08, 3)
      }
    b.c.fillStyle = '#3a3e44'
    b.c.fillRect(S * 0.2, S * 0.78, S * 0.6, S * 0.12)
    b.c.fillStyle = '#c84a3a'
    b.c.fillRect(S * 0.72, S * 0.6, S * 0.12, S * 0.1)
    b.blotch(8, ['#8a5a3a'], [10, 25], 0.45)
  },
  mWhite(b) {
    b.fill('#ffffff')
  },
  mPaint(b) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    b.c.fillStyle = '#ffffff'
    b.c.fillRect(0, 0, S, S)
    // Worn holes.
    b.c.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 80; i++) {
      b.c.beginPath()
      b.c.arc(b.r() * S, b.r() * S, b.range(2, 9), 0, Math.PI * 2)
      b.c.fill()
    }
    b.c.globalCompositeOperation = 'source-over'
  },
  mLantern(b) {
    const S = b.S
    b.fill('#fff0dc')
    b.c.fillStyle = 'rgba(120,60,30,0.35)'
    for (let y = 0; y < S; y += 16) b.c.fillRect(0, y, S, 2)
    fitText(b.c, '灯', S * 0.3, S * 0.3, S * 0.4, S * 0.4, 'rgba(160,40,30,0.8)')
  },
  mCloth(b) {
    const S = b.S
    b.fill('#f0f0f0')
    b.c.fillStyle = 'rgba(255,255,255,0.55)'
    for (let x = 0; x < S; x += 40) b.c.fillRect(x, 0, 20, S)
    b.speckle(600, ['#c8c8c8', '#ffffff'], [1, 2], 0.4)
  },
  mHolo(b, e) {
    const S = b.S
    b.c.clearRect(0, 0, S, S)
    for (const brush of [b, e]) {
      const c = brush.c
      c.fillStyle = brush === b ? 'rgba(120,230,255,0.55)' : 'rgba(80,220,255,0.9)'
      c.fillRect(0, 0, S, S)
      c.fillStyle = brush === b ? 'rgba(255,255,255,0.85)' : 'rgba(220,255,255,1)'
      c.fillRect(0, 0, S, 5)
      c.fillRect(0, S - 5, S, 5)
      for (let y = 0; y < S; y += 6) {
        c.fillStyle = 'rgba(0,40,60,0.18)'
        c.fillRect(0, y, S, 2)
      }
      fitText(c, 'ユメクジラ演習場', S * 0.08, S * 0.2, S * 0.84, S * 0.22, brush === b ? '#ffffff' : '#e8ffff')
      fitText(c, '区画 B ― 三つ巴', S * 0.15, S * 0.5, S * 0.7, S * 0.14, brush === b ? '#e0f8ff' : '#a0f0ff', 600)
      c.strokeStyle = brush === b ? '#ffffff' : '#c0ffff'
      c.lineWidth = 3
      c.beginPath()
      c.arc(S * 0.5, S * 0.8, S * 0.07, 0, Math.PI * 2)
      c.stroke()
    }
  },
  mFlesh(b, e) {
    const S = b.S
    b.fill('#4a2a4a')
    b.blotch(18, ['#6a3a5a', '#3a1e3a', '#7a4a6a'], [15, 50], 0.6)
    for (let i = 0; i < 6; i++) {
      const x = b.r() * S
      const y = b.r() * S
      b.crack(x, y, 12, '#d070c0', 2.5)
      e.crack(x, y, 12, '#ff70e0', 2.5)
    }
    b.speckle(500, ['#2a1a2a', '#9a6a8a'], [1, 3], 0.4)
  },
  mShutter(b) {
    const S = b.S
    b.fill('#9aa0a4')
    for (let y = 0; y < S; y += 6) {
      b.c.fillStyle = 'rgba(0,0,0,0.2)'
      b.c.fillRect(0, y, S, 1.5)
    }
    b.blotch(8, ['#7a5a3a'], [10, 30], 0.4)
  }
}

/** Wide shop sign: painted at 4:1 and squeezed into the square tile (it is stretched back on the model). */
function signBoard(b: Brush, e: Brush, name: string, bg: string, fg: string, sub: string) {
  const S = b.S
  const tmp = document.createElement('canvas')
  tmp.width = 960
  tmp.height = 240
  const t = tmp.getContext('2d')!
  t.fillStyle = bg
  t.fillRect(0, 0, 960, 240)
  t.strokeStyle = fg
  t.lineWidth = 10
  t.strokeRect(14, 14, 932, 212)
  fitText(t, name, 60, 30, 840, 140, fg, 900)
  fitText(t, sub, 260, 168, 440, 46, fg, 600)
  b.c.drawImage(tmp, 0, 0, S, S)
  b.blotch(8, ['#5a4a3a', '#ffffff'], [10, 30], 0.25)
  b.streaks(0, S, S * 0.6, S * 0.4, '#3a2a20', 0.25, 6)
  // Neon-ish outline glows at night.
  e.c.globalAlpha = 0.8
  e.c.drawImage(tmp, 0, 0, S, S)
  e.c.globalAlpha = 1
}
