# Public distribution boundary

This is a fresh initial source history, not an unchecked copy of the upstream Git history.

Included: original 2D runtime artwork, game source, optional bot runtime, transport SDK, synthetic/core tests, review/debug tooling, build configuration, and dependency license notices.

Not published: `.env` or credentials, virtual environments, dependency directories, captures/logs/test reports, raw migration inventory with private paths, private Library references and historical provenance, original art/models, unadopted candidates, 3D runtime artwork, and generated audio packs. These remain preserved on the migration workstation. Their redistribution basis has not been established for this source release. Generated Stable Audio assets were documented for a non-commercial demo; this source release does not relabel them as commercially licensed or redistribute them. No model weights are distributed.

The SDK archive was rebuilt with private build paths remapped and scanned internally. Its third-party notice collection is a conservative superset from the locked dependency graph, including target-specific dependencies. Existing copyright and license notices are retained.

A source release cannot guarantee the absence of every possible secret through automated scanning alone. Publication review checks the explicit staged text, filenames, nested archive contents, generated JS/WASM, private paths, credentials and endpoint references. No full private history or asset pack is uploaded.

Known tooling issue: the retained Vitest 3.2.7 development dependency graph has npm audit findings (one moderate, two critical). Production dependencies have no npm audit findings at the migration check. Tests are run once locally or in isolated CI; no Vitest UI/API server is exposed. A separately validated test-runner upgrade remains necessary.
