/**
 * Which illustrated scene each story page shows: the world backdrop, who stands where, with which clip and which
 * small effects. Pure data (no DOM), so the Node tests can check every sheet and clip against the art contract.
 *
 * Coordinates are scene pixels of the diorama (SCENE_W × SCENE_H). `x` is the anchor column of the sprite;
 * `lift` raises the anchor above the ground line (cell props with a top-left anchor use `lift: 64`).
 */
import type { ThemeId } from '../art/contract'

export const SCENE_W = 320
export const SCENE_H = 160
/** The row the characters' feet stand on. */
export const GROUND = 136

/** How a figure moves on top of its clip. */
export type Motion =
  /** Stands still (the clip still plays). */
  | 'none'
  /** Small happy hops. */
  | 'hop'
  /** Bobs up and down in the air. */
  | 'float'
  /** Trembles on the spot. */
  | 'shake'
  /** Runs back and forth over a short track. */
  | 'pace'
  /** Drifts slowly down from above, swaying (a fall from the sky). */
  | 'fall'

export interface Figure {
  /** A sheet id of the art contract (a character, a boss or a prop). */
  sheet: string
  clip: string
  x: number
  lift?: number
  /** Face left (art faces right). */
  flip?: boolean
  motion?: Motion
  /** Clip time offset in seconds, so neighbours do not move in lockstep. */
  phase?: number
  /** Drawn in front of the other figures. */
  front?: boolean
}

export interface Mark {
  /** A clip of the `fx` sheet: zzz, alert, anger, sweat, heart, sparkle, star, dizzy, … */
  clip: string
  x: number
  /** Height of the centre above the ground. */
  lift: number
}

export interface Shot {
  theme: ThemeId
  /** Horizontal scroll into the 640 px wide backdrop. */
  scroll?: number
  figures: readonly Figure[]
  marks?: readonly Mark[]
}

export type SceneKey = 'opening' | number

const hero = (clip: string, x: number, extra: Partial<Figure> = {}): Figure => ({ sheet: 'hero', clip, x, ...extra })
const princess = (clip: string, x: number, extra: Partial<Figure> = {}): Figure => ({
  sheet: 'princess',
  clip,
  x,
  ...extra
})
const mom = (clip: string, x: number, extra: Partial<Figure> = {}): Figure => ({ sheet: 'mom', clip, x, ...extra })
/** A boss facing the hero from the right. */
const boss = (sheet: string, clip: string, x = 236, extra: Partial<Figure> = {}): Figure => ({
  sheet,
  clip,
  x,
  flip: true,
  ...extra
})
const gang = (sheet: string, clip: string, x: number, extra: Partial<Figure> = {}): Figure => ({
  sheet,
  clip,
  x,
  flip: true,
  ...extra
})
const prop = (sheet: string, clip: string, x: number, lift = 64, extra: Partial<Figure> = {}): Figure => ({
  sheet,
  clip,
  x,
  lift,
  ...extra
})

/** The opening (プロローグ), one shot per page. */
const OPENING: Shot[] = [
  {
    // 「星の丘に、ハム彦という子ハムスターがいました」: one little hamster on the hill under the stars.
    theme: 'night',
    scroll: 60,
    figures: [hero('idle', 160)],
    marks: [
      { clip: 'sparkle', x: 96, lift: 96 },
      { clip: 'sparkle', x: 232, lift: 112 },
      { clip: 'star', x: 200, lift: 84 }
    ]
  },
  {
    // 「ママと大げんかして、思いきり巣を飛び出しました」: the nest and mom behind, the hero running off.
    theme: 'meadow',
    scroll: 20,
    figures: [prop('prop:nest', 'open', 24), mom('yell', 136), hero('run', 236)],
    marks: [
      { clip: 'anger', x: 164, lift: 104 },
      { clip: 'sweat', x: 240, lift: 62 }
    ]
  },
  {
    // 「もう、かえってこなくっていいの！」: mom shouts, the hero flinches.
    theme: 'meadow',
    scroll: 200,
    figures: [hero('hurt', 100, { motion: 'shake' }), mom('yell', 220, { flip: true })],
    marks: [
      { clip: 'sweat', x: 126, lift: 58 },
      { clip: 'anger', x: 242, lift: 104 }
    ]
  },
  {
    // 「後ろでママの怒涛の足音が近づいています」: the hero runs right, mom thunders after him.
    theme: 'meadow',
    scroll: 320,
    figures: [mom('move', 78, { motion: 'pace', phase: 0.2 }), hero('run', 232, { motion: 'pace' })],
    marks: [
      { clip: 'sweat', x: 248, lift: 58 },
      { clip: 'anger', x: 100, lift: 100 }
    ]
  },
  {
    // 「あるく・ジャンプ・かじる。ギミックをぶちかまして逃げ切りましょう」: the hero bites a tree.
    theme: 'meadow',
    scroll: 80,
    figures: [hero('bite', 152), prop('prop:tree', 'shake', 248, 0)],
    marks: [{ clip: 'star', x: 206, lift: 36 }]
  }
]

/** Each stage's intro, one shot per page (the last shot repeats for longer stories). */
const STAGE_SHOTS: Record<number, Shot[]> = {
  1: [
    {
      theme: 'meadow',
      scroll: 200,
      figures: [mom('yell', 92), hero('hurt', 210, { flip: true, motion: 'shake' })],
      marks: [
        { clip: 'alert', x: 202, lift: 64 },
        { clip: 'anger', x: 112, lift: 104 }
      ]
    },
    {
      theme: 'meadow',
      scroll: 260,
      // 「木を倒し、蜂の巣を怒らせて…」: a hive on one side, the hero biting a tree on the other.
      figures: [prop('prop:hive', 'idle', 36), hero('bite', 130, { phase: 0.1 }), prop('prop:tree', 'shake', 244, 0)],
      marks: [{ clip: 'star', x: 170, lift: 44 }]
    },
    {
      theme: 'meadow',
      scroll: 360,
      figures: [mom('tired', 72), hero('run', 210, { motion: 'pace' })],
      marks: [{ clip: 'sweat', x: 92, lift: 92 }]
    }
  ],
  2: [
    {
      theme: 'meadow',
      scroll: 100,
      figures: [princess('wave', 190, { motion: 'fall' }), hero('idle', 110)],
      marks: [
        { clip: 'sparkle', x: 170, lift: 120 },
        { clip: 'alert', x: 112, lift: 64 }
      ]
    },
    {
      theme: 'meadow',
      scroll: 140,
      figures: [
        princess('sad', 108, { motion: 'shake' }),
        // The rat stands guard on his hind legs, the look-out pose that is his signature.
        gang('walker', 'idle', 214),
        gang('flyer', 'move', 262, { lift: 70, motion: 'float' })
      ],
      marks: [{ clip: 'sweat', x: 124, lift: 56 }]
    },
    {
      theme: 'meadow',
      scroll: 180,
      figures: [princess('idle', 70), hero('bite', 140), boss('crowBoss', 'idle', 248, { motion: 'float', lift: 8 })],
      marks: [{ clip: 'anger', x: 262, lift: 112 }]
    }
  ],
  3: [
    {
      theme: 'night',
      scroll: 60,
      // 「ボスにさらわれてしまった！」: the weasel bolts away to the right holding the princess up over his head, the
      // hero left behind. She hovers clear of the weasel's crown-line, so every figure reads on its own.
      figures: [
        hero('hurt', 80),
        gang('weaselBoss', 'attack', 232, { flip: false }),
        princess('sad', 226, { lift: 68, motion: 'float' })
      ],
      marks: [{ clip: 'alert', x: 84, lift: 70 }]
    },
    {
      theme: 'night',
      scroll: 200,
      figures: [hero('run', 150, { motion: 'pace' })],
      marks: [{ clip: 'sparkle', x: 230, lift: 90 }]
    },
    {
      theme: 'night',
      scroll: 280,
      figures: [prop('prop:animal', 'sleep', 186), hero('idle', 120)],
      marks: [{ clip: 'zzz', x: 226, lift: 64 }]
    }
  ],
  4: [
    {
      theme: 'cave',
      scroll: 80,
      figures: [prop('prop:cage', 'back', 186, 28), princess('sad', 218), prop('prop:cage', 'front', 186, 28)],
      marks: [{ clip: 'sweat', x: 236, lift: 58 }]
    },
    {
      theme: 'cave',
      scroll: 220,
      figures: [hero('idle', 90), boss('boarBoss', 'idle', 232)],
      marks: [{ clip: 'anger', x: 250, lift: 110 }]
    },
    {
      theme: 'cave',
      scroll: 300,
      // 「かじってスイッチを押し、門をひらこう」: the hero bites the switch; the gate stands beyond it.
      figures: [
        hero('bite', 100),
        prop('prop:switch1', 'flip', 150),
        prop('prop:door1', 'bottom', 232),
        prop('prop:door1', 'top', 232, 128)
      ],
      marks: [{ clip: 'shine', x: 176, lift: 60 }]
    },
    {
      theme: 'cave',
      scroll: 360,
      // 「配管に穴をあけると水が噴出すぞ」: the pipe bursts beside the hero.
      figures: [hero('bite', 108), prop('prop:pipe', 'burst', 188)],
      marks: [{ clip: 'alert', x: 112, lift: 82 }]
    }
  ],
  5: [
    {
      theme: 'forest',
      scroll: 40,
      figures: [princess('idle', 120, { phase: 0.3 }), hero('run', 180, { motion: 'pace' })]
    },
    {
      theme: 'forest',
      scroll: 160,
      // 「追っ手がすぐ後ろ！」: the wolf is right behind, the hero runs away from him.
      figures: [gang('wolfBoss', 'windup', 82, { flip: false }), hero('run', 232, { motion: 'pace' })],
      marks: [{ clip: 'sweat', x: 250, lift: 58 }]
    },
    {
      theme: 'forest',
      scroll: 260,
      figures: [hero('bite', 128), prop('prop:rock', 'cracked', 188)],
      marks: [{ clip: 'star', x: 172, lift: 40 }]
    }
  ],
  6: [
    {
      theme: 'forest',
      scroll: 320,
      figures: [hero('idle', 84), prop('prop:nest', 'locked', 146), princess('wave', 262, { flip: true })]
    },
    {
      theme: 'forest',
      scroll: 360,
      figures: [
        prop('prop:twig', 'idle', 142, 24),
        prop('prop:berry', 'idle', 176, 24),
        prop('prop:fruit', 'idle', 210, 24),
        hero('cheer', 92, { motion: 'hop' })
      ]
    },
    {
      theme: 'forest',
      scroll: 420,
      // 「木を倒しても、土を掘っても材料は見つかるはず」: a tree to bite and the first twig and berry to show for it.
      figures: [
        hero('bite', 108),
        prop('prop:tree', 'cut', 214, 0),
        prop('prop:twig', 'idle', 296, 24),
        prop('prop:berry', 'idle', 52, 24)
      ],
      marks: [{ clip: 'sparkle', x: 296, lift: 60 }]
    }
  ],
  7: [
    {
      theme: 'fortress',
      scroll: 60,
      // 「本隊が巣を囲みました」: the gang closes in on the nest from both sides.
      figures: [
        gang('jumper', 'idle', 30, { flip: false }),
        // The mole captain stands with the frog on the near side of the nest.
        gang('tough', 'idle', 80, { flip: false }),
        prop('prop:nest', 'open', 124),
        gang('walker', 'move', 264, { motion: 'pace' }),
        gang('flyer', 'move', 214, { lift: 84, motion: 'float' })
      ],
      marks: [{ clip: 'anger', x: 246, lift: 60 }]
    },
    {
      theme: 'fortress',
      scroll: 200,
      // 「蜂の巣や動物たちを味方につけて」: a hive and a sleeping animal at the hero's side, the fox ahead.
      figures: [
        prop('prop:hive', 'idle', 30),
        hero('idle', 122),
        prop('prop:animal', 'sleep', 166),
        boss('foxBoss', 'windup', 270)
      ],
      marks: [{ clip: 'anger', x: 286, lift: 112 }]
    }
  ],
  8: [
    {
      theme: 'fortress',
      scroll: 260,
      // 「ハム姫が再びさらわれてしまいました」: she is already behind iron bars, the hero gasps.
      figures: [
        hero('hurt', 80, { motion: 'shake' }),
        prop('prop:cage', 'back', 184, 28),
        princess('sad', 216),
        prop('prop:cage', 'front', 184, 28)
      ],
      marks: [
        { clip: 'alert', x: 84, lift: 70 },
        { clip: 'sweat', x: 234, lift: 58 }
      ]
    },
    {
      theme: 'fortress',
      scroll: 320,
      figures: [hero('idle', 90), boss('apeBoss', 'idle', 232)],
      marks: [{ clip: 'alert', x: 92, lift: 64 }]
    },
    {
      theme: 'fortress',
      scroll: 400,
      figures: [prop('prop:switch2', 'on', 66), hero('cheer', 158, { motion: 'hop' }), prop('prop:pipe', 'burst', 230)]
    }
  ],
  9: [
    {
      theme: 'castle',
      scroll: 100,
      figures: [princess('idle', 100, { phase: 0.4 }), hero('idle', 160)],
      marks: [{ clip: 'shine', x: 230, lift: 100 }]
    },
    {
      theme: 'castle',
      scroll: 220,
      figures: [hero('idle', 92), boss('beeBoss', 'idle', 232, { motion: 'float', lift: 6 })],
      marks: [{ clip: 'anger', x: 252, lift: 112 }]
    },
    {
      theme: 'castle',
      scroll: 320,
      figures: [prop('prop:hive', 'idle', 160), hero('bite', 130)],
      marks: [{ clip: 'star', x: 200, lift: 40 }]
    }
  ],
  10: [
    {
      theme: 'star',
      scroll: 200,
      figures: [boss('king', 'intro', 220)],
      marks: [
        { clip: 'sparkle', x: 120, lift: 100 },
        { clip: 'sparkle', x: 290, lift: 120 }
      ]
    },
    {
      theme: 'star',
      scroll: 300,
      figures: [
        prop('prop:cage', 'back', 220, 28),
        princess('sad', 252, { flip: true }),
        prop('prop:cage', 'front', 220, 28),
        hero('idle', 96)
      ],
      marks: [{ clip: 'sweat', x: 270, lift: 58 }]
    },
    {
      theme: 'star',
      scroll: 400,
      figures: [hero('bite', 98), boss('king', 'rage', 230)],
      marks: [{ clip: 'anger', x: 250, lift: 118 }]
    }
  ]
}

/** The ending, one shot per page: the star world first, then the warm nest in the meadow. */
const ENDING: Shot[] = [
  {
    theme: 'star',
    scroll: 300,
    figures: [hero('cheer', 120, { motion: 'hop' }), princess('cheer', 196, { flip: true, motion: 'hop', phase: 0.3 })],
    marks: [
      { clip: 'sparkle', x: 80, lift: 110 },
      { clip: 'sparkle', x: 160, lift: 124 },
      { clip: 'sparkle', x: 250, lift: 104 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 120,
    figures: [prop('prop:nest', 'open', 160), hero('idle', 120), princess('idle', 198, { flip: true })],
    marks: [{ clip: 'heart', x: 160, lift: 70 }]
  },
  {
    theme: 'meadow',
    scroll: 120,
    figures: [
      prop('prop:nest', 'open', 140),
      hero('idle', 96),
      princess('idle', 176, { flip: true }),
      mom('idle', 262, { flip: true })
    ],
    marks: [{ clip: 'alert', x: 98, lift: 64 }]
  },
  {
    theme: 'meadow',
    scroll: 120,
    figures: [
      prop('prop:nest', 'open', 140),
      hero('idle', 120),
      princess('wave', 176, { flip: true }),
      mom('idle', 248, { flip: true })
    ],
    marks: [
      { clip: 'heart', x: 140, lift: 66 },
      { clip: 'heart', x: 236, lift: 100 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 120,
    figures: [
      prop('prop:nest', 'open', 140),
      hero('cheer', 100, { motion: 'hop' }),
      princess('cheer', 168, { motion: 'hop', phase: 0.25 }),
      mom('idle', 248, { flip: true })
    ],
    marks: [
      { clip: 'heart', x: 130, lift: 80 },
      { clip: 'sparkle', x: 210, lift: 110 }
    ]
  },
  {
    theme: 'night',
    scroll: 120,
    figures: [
      prop('prop:nest', 'open', 140),
      hero('cheer', 100, { motion: 'hop' }),
      princess('cheer', 168, { motion: 'hop', phase: 0.25 }),
      mom('idle', 248, { flip: true })
    ],
    marks: [
      { clip: 'sparkle', x: 60, lift: 120 },
      { clip: 'sparkle', x: 280, lift: 110 }
    ]
  }
]

export const STORY_SCENES: Readonly<Record<string, readonly Shot[]>> = {
  opening: OPENING,
  ...Object.fromEntries(Object.entries(STAGE_SHOTS).map(([no, shots]) => [no, shots]))
}

export const ENDING_SCENES: readonly Shot[] = ENDING

/** The shot for a page of a story (stories longer than their shot list keep the last shot). */
export function shotFor(scene: SceneKey, page: number): Shot {
  const shots = STORY_SCENES[String(scene)] ?? OPENING
  return shots[Math.max(0, Math.min(shots.length - 1, page))]
}

/** The ending shot for a page. */
export function endingShot(page: number): Shot {
  return ENDING[Math.max(0, Math.min(ENDING.length - 1, page))]
}

/** The ending's final picture under the credits: everyone cheering at the nest under the stars. */
export const CREDITS_SHOT: Shot = ENDING[ENDING.length - 1]

/** The result screen's backdrop: the stage's empty world (no one on it), a different stretch for each stage. */
export function resultShot(theme: ThemeId, stageNo: number): Shot {
  return { theme, scroll: (stageNo * 97) % 400, figures: [] }
}
