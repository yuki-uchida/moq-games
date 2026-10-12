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

## Additional scoped forecast optimization

Run `node scripts/validate-forecast-performance.mjs` to compare the new explicit
call-local forecast context against the SHA-256-pinned first-performance-fix
release candidate in `forecast-baseline/`. The comparison uses separate source
module instances, unchanged fixed simulation steps, exact full-state/forecast
comparisons, road/unit mutation cases, paid spike/mud cohorts and save/restore.
The first optimization's original baseline and script remain unchanged.

Road contexts live only within one synchronous forecast. Every new forecast
captures road content revisions; ordinary game queries still validate mutable
paths. Normal forecasts may capture real-unit tank assignments because the
prediction moves a separate clone. Paid forecasts never capture assignments:
their cohort clones, health, arrays and obstacles mutate during substeps.
Contexts must never cross await/callback boundaries or be stored in game state,
checkpoint data or interception result caches. No ambient context is installed,
so nested queries and exceptions need no global cleanup. Weak revision caches
retain at most one current path revision, and scoped references end with the call.
Segment totals and interpolation retain the original arithmetic operation order;
there is no prefix-distance/binary-search numerical change.

CPU timings from this harness exclude browser rendering and network/real-time
AI. They establish CPU reduction and equivalence, not 60-FPS browser acceptance.
