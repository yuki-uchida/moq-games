# moq-games

This independent checkout owns the tower-defense game, its bot, review tools, assets and tests. Preserve game behavior, original asset bytes and provenance. The pinned SDK is in `vendor/`; normal development must not build Rust or depend on a sibling checkout. Do not publish, commit, push, call paid APIs or send real debug requests without explicit authorization. Use headless browser verification. Large originals and unadopted candidates are preserved locally and ignored by Git; do not delete them.

Source architecture: `docs/architecture.md`. Run `npm run typecheck`, `npm test`, `npm run build`, and the relevant headless E2E. SDK regeneration: `sdk/README.md`. Local-only migration provenance (not published): `migration/source-inventory.json`.
