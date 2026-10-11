# moq-games

**[Play in your browser](https://yuki-uchida.github.io/moq-games/)** — place defenders and protect your base in a TypeScript/three.js tower-defense game.

Rule AI runs locally: no account, bot or live MoQ connection is needed to play. An optional Python bot connects Jev through [moq-wasm](https://github.com/yuki-uchida/moq-wasm), the MoQ transport SDK, for networked AI decisions.

## Play

1. Open the [public game](https://yuki-uchida.github.io/moq-games/examples/games/tower_diffence_with_jev/).
2. Use Rule AI to play without configuring an external service.

This revision includes the original 2D game, a sample gallery, a title screen with New game/Continue, a read-only EXTRA frame viewer and a dedicated Slime real-model review page. The full real-3D roster remains in development. These describe this revision; the live site changes only after the checked revision is deployed.

## Run locally

**Prerequisites:** Git, Node.js 24/npm and rustup. The first SDK setup needs network access and Rust build tools; later development reuses its output.

1. Clone the repository and enter it.

   ```sh
   git clone https://github.com/yuki-uchida/moq-games.git
   cd moq-games
   ```

2. Prepare the pinned SDK, install dependencies and start Vite.

   ```sh
   node scripts/setup-sdk.mjs
   npm ci --ignore-scripts
   npm run dev
   ```

3. Open the [local game](http://127.0.0.1:5174/moq-games/examples/games/tower_diffence_with_jev/index.html).

**Already set up?** Run `npm run dev`. You do not need a sibling moq-wasm checkout or a new Rust build.

## Check your changes

Run these from the repository root:

```sh
npm run typecheck
npm run lint
npm run test:core
npm run build
```

To inspect the production build, run `npm run preview` and open the [preview game](http://127.0.0.1:4174/moq-games/examples/games/tower_diffence_with_jev/index.html).

<details>
<summary>More tests: browser, debug tools and optional assets</summary>

- `npm test` runs the available game tests. The migration workstation also retains private asset/provenance regression tests.
- For the included public-build browser suite, install Chromium with `npx playwright install chromium`, run `npm run build`, then run `npx playwright test --config playwright.pages.config.ts`. This starts and waits for its own preview server. The broader development suite uses `npm run e2e` with `npm run dev` in another terminal.
- Public SDK smoke/default-2D checks use the included assets. The complete appearance/audio suite also needs the omitted local packs. The SDK smoke test initializes real WASM, then stops at a mocked WebTransport constructor; it makes no live Jev request.
- `npm run test:tower-debug` checks the debug tools with synthetic fixtures. Review tooling requires an explicitly selected store outside the checkout; never point synthetic tests at real user state.
- The two real Wolf debug-asset checks are separate: set `TOWER_DEBUG_TEST_ASSETS` to the original read-only catalog/asset fixture, then run `npm run test:tower-debug-assets`.

</details>

## Optional setup and technical details

<details>
<summary>SDK: pinned source, generated files and troubleshooting</summary>

[`sdk/source.json`](sdk/source.json) pins the public moq-wasm URL, full commit, Cargo.lock hash, wrapper hashes and build-tool versions. Setup installs the pinned Rust target and obtains the pinned wasm-pack when needed, then prepares `.generated/moqt-sdk`.

The explicit setup runs before `npm ci` locally and in CI; it is not an npm install hook. Generated files and caches are Git-ignored. Setup reuses verified unchanged output and rejects edited caches/output rather than resetting them. See [SDK setup](sdk/README.md) for recovery and regeneration details.

The game imports the stable `@moq-games/moqt-client` API. A future published SDK can replace this local dependency without changing game imports. This setup does not publish to npm or create an upstream Release. Preserve the Vite dependency-prebundle exclusion.

</details>

<details>
<summary>Jev bot: optional Python service and credentials</summary>

The bot lives in [`examples/games/tower_diffence_with_jev/bot`](examples/games/tower_diffence_with_jev/bot).

1. Create a fresh Python 3.12 virtual environment in that directory.
2. Install its `requirements.txt` into that environment.
3. Only when configuring an authorized real service, copy `.env.example` to a local, ignored `.env`.

**Real Jev requests may incur charges.** They are not part of routine tests. Keep keys server-side; no credentials are included in the repository.

See [architecture](docs/architecture.md) for the browser, bot and transport boundaries.

</details>

<details>
<summary>Artwork, optional local packs and real-3D development</summary>

The public checkout includes the original 2D runtime art and supports local Rule AI play. Redistribution evidence is confirmed for all 20 real-3D unit roles, including Soldier. Only the selected Slime model-review GLB and EXTRA frames are included in this revision. The other runtime packs remain local while optimization and browser acceptance checks are completed. Generated sound packs remain separate and omitted pending their own redistribution review. Missing optional packs must not be treated as successfully loaded assets.

The migration workstation preserves the complete pack, original sources and unadopted candidates outside the public Git selection. To import an authorized unpacked pack:

```sh
node scripts/import-local-assets.mjs /absolute/path/to/authorized-pack
```

No placeholder characters replace accepted art. See [asset scope and provenance](ASSETS.md).

</details>

<details>
<summary>Deployment, saves and developer plugins</summary>

GitHub Pages deploys the checked public build from `main`; local-only packs are not uploaded. The root in this revision opens the sample gallery; the existing game URL remains available. Keep the generated `THIRD-PARTY-NOTICES.txt` with distributed SDK/game builds.

Browser storage keys and save schemas are unchanged. A path change on the same origin preserves localStorage. Changing scheme, host or port requires an explicit save export/import plan. Migration did not clear existing browser storage, and the old checkout remains intact.

The trusted-project Codex configuration declares the approved [i-have-adhd](https://github.com/ayghri/i-have-adhd) and [Ponytail](https://github.com/DietrichGebert/ponytail) sources. Each machine still needs its own installation and hook trust confirmation. Machine-specific trust hashes and credentials are not committed.

</details>

## License

Code is distributed under the retained upstream [MIT license](LICENSE). SDK dependencies retain their own notices. This license does not grant rights to omitted artwork, recordings or audio; see [ASSETS.md](ASSETS.md).
