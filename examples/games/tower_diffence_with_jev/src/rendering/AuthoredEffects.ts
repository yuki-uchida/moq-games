export const AUTHORED_EFFECTS: Readonly<Record<string, string>> = {
  'archer:projectile': 'effects/arrow.json',
  'ranger:projectile': 'effects/heavy-bolt.json',
  'mage:projectile': 'effects/star-bolt-runtime.json',
  'healer:projectile': 'effects/healing-wisp-runtime.json',
  'healer:heal': 'effects/healing-wisp-runtime.json',
  'frost:projectile': 'effects/ice-shard-runtime.json',
  'shaman:projectile': 'effects/spore-bolt-runtime.json',
  'cannon:projectile': 'effects/cannonball-fire.json',
  'cannon:muzzle': 'effects/cannon-muzzle-fire.json',
  'wraith:projectile': 'effects/ghost-bolt-flight-e.json',
  'dragon:projectile': 'effects/dragon-fireball-fx.json',
  'dragon:breath': 'effects/dragon-breath-fx.json',
  'brute:impact': 'effects/stone-slam-dust.json'
}

export function authoredEffectClips(base: URL): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(AUTHORED_EFFECTS).map(([key, path]) => [key, new URL(path, base).href]))
}
