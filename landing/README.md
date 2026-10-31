# MoQ Games catalog

The site root is a lightweight catalog. `samples.js` is the list of published,
playable samples; add a metadata entry when another actual game is ready. Keep
existing deep links stable. The catalog includes Tower Defense, Ember Grid and Lane Battle; all three have root-build entries and non-JavaScript fallback links.

`main.js` renders accessible sample sections. The previews use original
roster portraits from `public/tower-defense-art/` over a static SVG battlefield
illustration. It is promotional artwork, not a live game or a gameplay screenshot.
No asset bytes are modified. See the root `ASSETS.md` for the artwork provenance.
The landing imports no renderer, game state, network client, audio, or WASM.

Check with `npm run test:landing`. With the development server running, use
`npm run e2e:landing` for desktop/mobile layout, image loading, keyboard, reduced
motion, navigation/back, and non-JavaScript fallback checks. The E2E captures
full-page landing screenshots in its test output directory.
