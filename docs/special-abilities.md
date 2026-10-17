# Ally special abilities

In assault, click/tap a living ally, then choose a point in the white cast-range circle. The colored circle previews the exact effect radius; an invalid point shows × and spends nothing. Escape or the × control cancels. Arrow keys move the target by four world units, Enter/Space confirms. A drag of six screen pixels remains movement rather than a cast. Selecting a sandbag cancels targeting and shows its current HP; moving, placing, and removing sandbags still require preparation.

Every individual starts ready and has a 60-second cooldown, consumed when a valid target is confirmed. Remaining seconds advance only with assault simulation, including for reserves. Preparation, stopped clocks, and hidden tabs grant no cooldown time. The remaining duration survives stage clock resets and checkpoint restores. Checkpoint v18 migrates v1–17 without changing their combat/layout rules.

A confirmed cast cancels that ally's current normal action and holds movement/normal attacks through its dedicated special animation. Damage/fields begin at the authored impact time, rather than at selection. Death before an impact cancels that pending impact without refunding cooldown. Already released fields continue after the caster dies. Runner's three impacts are independent. All effects and casting poses end when the assault ends.

| Role    | Effect         | Radius | Cast range | Effect duration | Power / control                       |
| ------- | -------------- | -----: | ---------: | --------------: | ------------------------------------- |
| soldier | Circular slash |     95 |        150 |            0.8s | 4× physical                           |
| archer  | Arrow rain     |    110 |        360 |            1.2s | 4× physical                           |
| runner  | Spear flurry   |     65 |        200 | 0.8s per impact | 3 × 2× physical                       |
| tank    | Shockwave      |    115 |        170 |              1s | 2× physical, 3s stun                  |
| mage    | Fire explosion |    125 |        330 |            1.2s | 5× magic                              |
| healer  | Healing spring |    130 |        300 |              8s | Allied HP +6% max/s; no enemy damage  |
| frost   | Freezing field |    120 |        300 |              6s | Roots enemies, refreshed while inside |
| ranger  | Vine trap      |    100 |        330 |              5s | Roots enemies, refreshed while inside |
| cannon  | Bombardment    |    145 |        380 |            1.4s | 5× physical                           |
| paladin | Light pillars  |    110 |        250 |            1.2s | 4× magic, 1s stun                     |

The two rooting fields hold enemies until the field ends plus 0.25s, with a stable deadline for the forecast cache. Rooting stops movement; the tank and paladin stuns also interrupt attacks. Power snapshots the caster's attack at confirmation and uses the existing armor/damage rules. The engine owns recipients, damage, history, cooldowns, and persistent-field ticks. The renderer never changes gameplay HP. `src/game/SpecialAbilities.ts` centralizes all balance and authored impact/animation timings.

The ten Blender 4.3.2 effect GLBs total 197,620 bytes, with no textures, skins, or embedded animations. The renderer caches each source once, shares immutable geometry, clones per-instance materials, bounds active visuals to 16, and releases instances on expiry/phase changes. Final cache disposal also releases shared sources. The XZ/Y-up assets are rotated onto XY/Z-up ground, then height is projected upward without distorting the ground radius. The ten dedicated JSON clips reuse each role's existing idle rig and material/skinning adapters; no duplicate model GLBs are shipped.

Runtime hashes and source references live in `public/tower-defense-art/effects/special/manifest.json` and `motions/manifest.json`. Blender originals, generator scripts, earlier versions, and visual evidence are retained locally under `~/Codex/moq-special-abilities-20261017`; they are excluded from the public build.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run e2e -- tests/tower-special-abilities-e2e.spec.ts`. The public Pages suite also includes the desktop/touch special tests.
