# Browser SDK setup

Upstream: https://github.com/yuki-uchida/moq-wasm. The source and tool versions are pinned in `source.json`. This repository keeps only the setup code and package template; generated JS, WASM, types and notices are outside Git.

From a fresh clone, install Git, Node.js 24/npm and rustup, then run `node scripts/setup-sdk.mjs` followed by `npm ci --ignore-scripts`. The setup explicitly installs Rust 1.96.0 with the wasm32-unknown-unknown target. It uses wasm-pack 0.13.1, installing that pinned version into the ignored cache if a matching executable is unavailable. Wrapper compilation uses TypeScript 5.9.3. The initial setup requires network access and Rust build tools; normal `npm run dev`, tests and builds reuse the prepared SDK.

The source checkout lives under `.sdk-cache/source/<commit>` and output under `.generated/moqt-sdk`. Setup verifies origin, exact HEAD, clean source, Cargo.lock and wrapper hashes. It refuses to overwrite edited output and never resets or cleans an existing checkout. Preserve any local edits elsewhere before retrying. Interrupted staging directories remain ignored for diagnosis. Changing the pin requires updating its hashes and revalidating the SDK; a branch name or moving HEAD is not accepted.

WASM uses the upstream Cargo.lock with `--locked` and remaps home, temporary and checkout paths. Wrapper source comes from the same public commit; only its imports are adapted to the generated package layout. No local moq-wasm working tree is read. CI caches generated output, sources, tool binaries and Cargo inputs by OS, architecture and setup inputs, and verifies cached integrity before use.

The SDK includes upstream MIT attribution and conservatively collected Cargo dependency declarations and available LICENSE/COPYING/NOTICE texts. `scripts/prepare-pages.mjs` includes these and the game/three.js notices in `dist/THIRD-PARTY-NOTICES.txt`. Dependency acquisition does not waive license obligations. Keep this generated file with distributed builds; do not remove individual notices without checking their conditions. CI verifies the notice and provenance files exist.

The npm package name, public exports and lazy WASM initialization are unchanged. The current dependency is a local generated package, not a published npm or GitHub Release package. Replacing it later with a versioned published artifact should not require game import changes. The previously checked-in tarball and notices remain in Git history; no history rewrite is performed.
