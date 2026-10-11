# moq-games

Independent TypeScript/three.js tower-defense game, with an optional Python Jev bot and MoQ transport. The game owns simulation and runs with Rule AI without network transport. The explicit first-time SDK setup fetches a pinned public moq-wasm commit and builds it with Rust. Normal game development reuses the generated SDK and does not need a sibling checkout.

## Install and run

Install Git, Node.js 24/npm and rustup. On a fresh clone:

```sh
node scripts/setup-sdk.mjs
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:5174/moq-games/examples/games/tower_diffence_with_jev/index.html`.

The public checkout includes the existing original 2D runtime art and supports offline RuleAI play. Optional 3D/Meshy and generated sound packs remain local until their redistribution evidence is reconciled. The game keeps its existing 2D default and procedural battlefield fallback. Optional 3D/audio controls need the local packs and otherwise report loading errors/roll back. See `ASSETS.md`.

The migration workstation retains the complete pack in `public/`, plus original sources and unadopted candidates outside Git. An authorized unpacked full pack can be imported with `node scripts/import-local-assets.mjs /absolute/path/to/authorized-pack`. No placeholder characters replace accepted art.

## Verify

```sh
npm run typecheck
npm run lint
npm run test:core
npm run build
npm run preview
npm run test:tower-debug
```

Production preview uses port 4174 and the same `/moq-games/` prefix. `npm test` runs available game tests; the migration workstation additionally retains the full private asset/provenance regression suite. Browser testing uses `npm run e2e` and a running dev server. The public SDK smoke/default-2D checks use the included pack; the complete local appearance/audio suite additionally requires the omitted optional packs. `npx playwright install chromium` installs the headless test browser. The SDK smoke test deliberately stops at a mocked WebTransport constructor after real WASM initialization, and makes no live Jev request.

The two real Wolf debug-asset checks are separately opt-in: set `TOWER_DEBUG_TEST_ASSETS` to the original read-only catalog/asset fixture and run `npm run test:tower-debug-assets`. They are not represented by the synthetic debug suite.

## SDK and bot

`sdk/source.json` pins the public upstream URL, full commit, Cargo.lock hash, wrapper hashes and build tool versions. `node scripts/setup-sdk.mjs` installs the pinned Rust target, obtains the pinned wasm-pack if needed, and prepares `.generated/moqt-sdk`. The same explicit setup runs in CI before `npm ci`; it is not an npm install lifecycle hook. Source/build caches and generated SDK files are ignored by Git. A verified unchanged SDK is reused; edited caches/output are rejected rather than reset. See [SDK setup](sdk/README.md).

The game imports the stable `@moq-games/moqt-client` package API. A future published SDK can replace the local dependency without changing game imports. There is no npm publication or upstream Release creation in this setup. Preserve the Vite dependency-prebundle exclusion.

The optional bot is under `examples/games/tower_diffence_with_jev/bot`. Create a fresh Python 3.12 virtual environment and install `requirements.txt`. Copy `.env.example` to a local ignored `.env` only when configuring an authorized real service. Keys remain server-side. No credentials are included; starting the bot against a real Jev service may incur charges and is not part of routine tests.

Review tooling uses an explicitly selected store outside the checkout. Real user state must never receive synthetic tests. GitHub Pages deploys the checked public build from `main`; local-only packs are not uploaded. The site root opens the game, and `THIRD-PARTY-NOTICES.txt` accompanies the distributed SDK and game.

## Saves and provenance

Browser storage keys and save schemas are unchanged. A path change on the same origin preserves localStorage; a different scheme, host, or port requires an explicit save export/import plan. No existing browser storage was cleared by migration. The old checkout remains intact.

Code is distributed under the retained upstream MIT license. SDK dependencies retain their own notices. This license does not grant rights to omitted artwork, recordings or audio.

The trusted-project Codex configuration declares the approved i-have-adhd and Ponytail plugin sources. A different machine still needs its own installation and hook trust confirmation; machine-specific trust hashes and credentials are not committed.
