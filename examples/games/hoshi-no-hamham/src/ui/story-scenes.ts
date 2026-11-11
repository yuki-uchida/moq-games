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
    // A far-away omen: the black king carries the star princess off across the cosmos.
    theme: 'star',
    scroll: 120,
    figures: [
      boss('king', 'move', 196, { motion: 'pace' }),
      princess('sad', 180, { lift: 70, flip: true, motion: 'float', front: true })
    ],
    marks: [
      { clip: 'sparkle', x: 120, lift: 110 },
      { clip: 'sweat', x: 166, lift: 120 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 40,
    figures: [hero('idle', 150)],
    marks: [
      { clip: 'sparkle', x: 104, lift: 70 },
      { clip: 'heart', x: 160, lift: 66 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 200,
    figures: [hero('hurt', 116, { motion: 'shake' }), mom('yell', 214, { flip: true })],
    marks: [
      { clip: 'anger', x: 140, lift: 60 },
      { clip: 'anger', x: 236, lift: 104 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 200,
    figures: [mom('yell', 232, { flip: true }), hero('run', 92, { flip: true, motion: 'pace' })],
    marks: [{ clip: 'anger', x: 254, lift: 104 }]
  },
  {
    theme: 'meadow',
    scroll: 320,
    figures: [mom('move', 84, { motion: 'pace', phase: 0.2 }), hero('run', 214, { motion: 'pace' })],
    marks: [
      { clip: 'sweat', x: 230, lift: 58 },
      { clip: 'anger', x: 108, lift: 100 }
    ]
  },
  {
    theme: 'meadow',
    scroll: 80,
    figures: [hero('cheer', 160, { motion: 'hop' })],
    marks: [
      { clip: 'star', x: 124, lift: 76 },
      { clip: 'star', x: 196, lift: 82 }
    ]
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
      figures: [prop('prop:tree', 'shake', 210, 0), hero('bite', 170, { phase: 0.1 })],
      marks: [{ clip: 'star', x: 196, lift: 30 }]
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
        gang('walker', 'move', 214, { motion: 'pace' }),
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
      figures: [hero('hurt', 92), boss('weaselBoss', 'attack', 232), princess('sad', 214, { lift: 60, front: true })],
      marks: [{ clip: 'alert', x: 94, lift: 64 }]
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
      figures: [prop('prop:switch1', 'flip', 176), hero('bite', 150)],
      marks: [{ clip: 'shine', x: 210, lift: 40 }]
    },
    {
      theme: 'cave',
      scroll: 360,
      figures: [prop('prop:pipe', 'burst', 190), hero('hurt', 120, { motion: 'shake' })],
      marks: [{ clip: 'alert', x: 124, lift: 64 }]
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
      figures: [hero('run', 112, { motion: 'pace' }), boss('wolfBoss', 'windup', 248)],
      marks: [{ clip: 'sweat', x: 128, lift: 58 }]
    },
    {
      theme: 'forest',
      scroll: 260,
      figures: [prop('prop:rock', 'cracked', 186), hero('bite', 160)],
      marks: [{ clip: 'star', x: 196, lift: 40 }]
    }
  ],
  6: [
    {
      theme: 'forest',
      scroll: 320,
      figures: [prop('prop:nest', 'locked', 168), hero('idle', 100), princess('wave', 250, { flip: true })]
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
      figures: [hero('idle', 96), boss('bearBoss', 'idle', 230)],
      marks: [{ clip: 'alert', x: 98, lift: 64 }]
    }
  ],
  7: [
    {
      theme: 'fortress',
      scroll: 60,
      figures: [
        prop('prop:nest', 'open', 76),
        gang('walker', 'move', 200, { motion: 'pace' }),
        gang('jumper', 'idle', 252),
        gang('flyer', 'move', 290, { lift: 74, motion: 'float' })
      ],
      marks: [{ clip: 'anger', x: 220, lift: 52 }]
    },
    {
      theme: 'fortress',
      scroll: 200,
      figures: [prop('prop:hive', 'idle', 70), hero('idle', 150), boss('foxBoss', 'windup', 248)],
      marks: [{ clip: 'anger', x: 262, lift: 110 }]
    }
  ],
  8: [
    {
      theme: 'fortress',
      scroll: 260,
      figures: [prop('prop:cage', 'back', 168, 28), princess('sad', 200), prop('prop:cage', 'front', 168, 28)],
      marks: [{ clip: 'sweat', x: 218, lift: 58 }]
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
      figures: [prop('prop:switch2', 'on', 110), prop('prop:pipe', 'burst', 190), hero('cheer', 160, { motion: 'hop' })]
    }
  ],
  9: [
    {
      theme: 'castle',
      scroll: 100,
      figures: [hero('idle', 100), princess('idle', 60, { phase: 0.4 })],
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
