# Interception equivalence and performance validation

Run from the repository root:

```sh
node scripts/validate-interception-performance.mjs
```

The script builds an ignored `.build/interception-validation` directory. It copies
all current game source into an independent baseline tree and substitutes the
four SHA-256-pinned, exact original source fixtures in `baseline/`. The unmodified
fixtures are the production preimages from commit `3e4c375`, before interception
optimization. Baseline and optimized code use separate module instances and road
objects, so they cannot accidentally share an optimized geometry cache.

The generated test compares exact full game state on each unchanged 1/60-second
tick, ordered AI decisions, campaign save, combat sound order, interception
snapshots and forecast sample arrays. It covers the original battlefield and v2
layout revisions 1–4, all four terrain maps, five ground defenders including a
tank, five initial enemies, legacy sandbags, paid spike/mud fortifications,
spawn/death/slow/contact-range changes, map/unit/path mutations, caller edits to
returned restraint maps, and independently valid campaign save/restore runs.

The benchmark reports `Math.hypot` call counts, instrumented elapsed time and a
separate warmed median without the counting shim. Workloads are direct forecasts
on the 299-point maze road and repeated seeded stage-3 five-vs-five GameEngine
battles. AI timing, simulation cadence and movement/combat behavior are unchanged.
The absolute timings depend on the machine; operation counts are more reproducible.

Results are printed and saved to `.build/interception-validation/report.json`.
Forward Vitest options to select a subset:

```sh
node scripts/validate-interception-performance.mjs -t 'benchmarks direct'
node scripts/validate-interception-performance.mjs -t 'campaign checkpoint'
```

`DIFFERENTIAL_TICKS` changes the number of compared ticks per battle (default 360).
Baseline fixture hashes must remain unchanged. Update their manifest only when
intentionally establishing a new baseline; never format or rewrite the pinned
source files merely to satisfy formatting tools.
