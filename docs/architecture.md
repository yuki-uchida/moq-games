# Architecture

The browser owns combat, economy, checkpoints, validation and rendering. Rule AI runs locally. Jev mode lazily imports the connection module and initializes the pinned MoQ SDK only when the user connects. The optional Python bot handles the external model API; no API credentials belong in browser code.

The SDK package owns WebTransport/WASM, the existing request wrapper and subscription state management. Game-specific wire encoding and relay settings remain in this repository. The relay is an external service; no Rust build occurs during `npm run dev` or `npm run build`.

The former browser-example directory layout is deliberately retained in the first extraction, so relative asset URLs and historical local test/provenance paths remain stable. Vite uses `/moq-games/`; E2E paths use the same base. Runtime assets are lazy-loaded under `public/`; no asset re-encoding or game balance change is part of extraction.

Debug tooling resolves this repository root directly and requires an explicitly configured external asset store. Private historical import scripts and provenance are retained locally, outside the public source selection.
