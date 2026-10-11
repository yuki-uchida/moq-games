# Pinned browser SDK

Private npm package prepared for this independent game. Public source repository: https://github.com/yuki-uchida/moq-wasm. No npm publication is intended. The package contains ESM wrapper/subscription management, generated JS/types/WASM, original MIT license and dependency attribution.

The release WASM was rebuilt from the locked source checkout with source paths remapped; the older captured binary is not distributed. Source identities are recorded in `sdk-origin.json` at the game root. Some upstream crate licenses are dual-license choices; retain the supplied notices.

Normal game use: `npm ci`; no Rust or sibling checkout is required. Vite must exclude `@moq-games/moqt-client` from dependency prebundling to preserve its WASM-relative URL. Production bundling emits the WASM as a hashed asset. The game's existing lazy Jev import remains unchanged.

To regenerate in an explicitly selected checkout of the source revision: run `wasm-pack build bindings/wasm --target web --out-dir <temporary-output> -- --locked` with `CARGO_TARGET_DIR` outside the checkout and `RUSTFLAGS` containing `--cfg tokio_unstable --cfg web_sys_unstable_apis --remap-path-prefix=<private-home>=/build`. Copy the four generated `moqt_client_wasm*` files into this SDK's `wasm/`, retain/re-audit dependency licenses, and run `npm run sdk:pack` in moq-games. Increment the package version, update the local tarball dependency and lockfile, audit the archive, and re-run dev/production initialization checks before adopting it. SDK wrapper sources are in `sdk/source/`; their imports target the packaged WASM and subscription module.
