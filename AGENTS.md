# moq-games

This independent checkout owns the tower-defense game, its bot, review tools, assets and tests. Preserve game behavior, original asset bytes and provenance. Large originals and unadopted candidates are preserved locally and ignored by Git; do not delete them.

## Commits and pushes

For user-requested work in this repository, the user authorizes continuing to commit and push directly to `main`. A pull request is not required. Do not ask for approval again for each such commit or push.

Keep each commit a coherent, test-passing unit. Before committing, validate the exact changes being committed with the relevant checks. For affected code, configuration or runtime behavior, run `npm run typecheck`, `npm run lint`, the relevant tests (`npm test` or the applicable focused suites), `npm run build`, and relevant headless E2E. For documentation-only changes, check formatting, links and documented commands. Never call skipped, blocked or unrun checks passing; resolve failures or report the blocker before committing the affected change. Do not bundle unrelated or unverified work into a passing commit.

This authorization does not permit force-pushing, rewriting published history, destructive changes, paid API calls or real debug-service requests. Separate publication actions and expansion of the public asset/data scope still require explicit authorization. Direct `main` pushes may trigger the existing configured GitHub Pages workflow; preserve its checks and publication boundaries.

## SDK and verification

The pinned SDK is generated into `.generated/moqt-sdk` by the explicit first-time `node scripts/setup-sdk.mjs` step before `npm ci --ignore-scripts`. Normal development reuses that output; it must not rebuild Rust or depend on a sibling checkout. See `sdk/README.md` for setup and regeneration.

Use headless browser verification. Local-only migration provenance (not published): `migration/source-inventory.json`.
