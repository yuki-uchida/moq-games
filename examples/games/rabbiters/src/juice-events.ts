/**
 * Game-feel ("juice") events: moments worth a sound, a particle burst or a screen effect.
 * `detectJuice` (src/juice.ts) derives them by diffing consecutive GameState snapshots on every client, so
 * hosts and guests get the same feedback without anything new on the wire.
 */
export interface JuicePoint {
  x: number
  y: number
  z: number
}

export type JuiceEvent =
  // The local rabbit's own actions.
  | { type: 'step'; at: JuicePoint; sprint: boolean; crouch: boolean }
  | { type: 'jump'; at: JuicePoint }
  | { type: 'land'; at: JuicePoint; impact: number } // impact 0..1 from the fall height
  | { type: 'hide'; at: JuicePoint }
  | { type: 'unhide'; at: JuicePoint }
  | { type: 'eat'; at: JuicePoint; kind?: string; streak: number } // streak: eats within a few seconds, from 1
  | { type: 'pickup'; at: JuicePoint }
  | { type: 'drop'; at: JuicePoint }
  | { type: 'taskTick'; at: JuicePoint; progress: number } // a hold-E job crossed another 10%
  | { type: 'taskDone'; at: JuicePoint }
  | { type: 'hurt'; at: JuicePoint; amount: number }
  | { type: 'downed'; at: JuicePoint }
  | { type: 'revived'; at: JuicePoint }
  | { type: 'grown'; at: JuicePoint }
  | { type: 'pregnant'; at: JuicePoint }
  // Threats around the local rabbit.
  | { type: 'suspicious'; at: JuicePoint } // a predator's "?" aimed at you
  | { type: 'spotted'; at: JuicePoint; you: boolean } // a predator broke into a chase
  | { type: 'escaped'; at: JuicePoint } // the last predator chasing you gave up
  // Shared progress.
  | { type: 'talk'; at?: JuicePoint }
  | { type: 'nestBroken'; at: JuicePoint }
  | { type: 'bedding'; at?: JuicePoint }
  | { type: 'kitSafe'; at?: JuicePoint }
  | { type: 'kitLost'; at?: JuicePoint }
  | { type: 'objective'; at?: JuicePoint }
  | { type: 'chapter' }
  | { type: 'won' }
  | { type: 'lost' }

export type JuiceType = JuiceEvent['type']
