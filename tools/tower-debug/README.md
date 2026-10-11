# Local review/debug tooling

Run `npm run test:tower-debug` for synthetic store/server and client lifecycle tests. The optional real-model tests require an explicit read-only fixture through `TOWER_DEBUG_TEST_ASSETS` and `npm run test:tower-debug-assets`.

For an authorized local viewer session, set `TOWER_DEBUG_STORE` to an absolute, owner-controlled store outside this checkout and run `npm run debug:tower`. The default dedicated port is 5176. The store contains a catalog and digest-named assets; it is not bundled into public Vite output. `npm run build:tower-debug` builds only the viewer UI.

Never use the real user store for synthetic mutations. `make-synthetic-store.mjs` requires an explicit `TOWER_DEBUG_SOURCE_STORE` and creates a marked temporary copy containing assets/catalog but no real ticket state. `playwright.tower-foundations.config.ts` and `playwright.tower-debug.config.ts` target dedicated synthetic sessions. No real ticket submission, paid generation or automatic adoption is part of the game migration.

Historical private asset-import scripts, Library references, model packs and expanded-store installation receipts remain local and are excluded from the public source release. The current public tool expects an authorized store to be supplied separately; it does not fetch private media automatically.
