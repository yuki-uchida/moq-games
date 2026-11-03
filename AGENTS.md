# moq-games

Respond to the user in Japanese.

This independent checkout owns the tower-defense game, its bot, review tools, assets and tests. Preserve game behavior, original asset bytes and provenance. Large originals and unadopted candidates are preserved locally and ignored by Git; do not delete them.

## Commits and pull requests

For user-requested work in this repository, use pull requests instead of pushing directly to `main`. Split work into pull requests by major coherent unit; prefer one pull request per user instruction, but use stacked pull requests when the work cannot be cleanly separated otherwise.

For user-requested work, commit changes, create pull requests and merge them without asking the user for a decision or approval each time, subject to the restrictions below.

In each pull request description, briefly describe only the added and removed features in Japanese. Do not explain why the changes were needed.

Before creating or merging a pull request, read and follow `.claude/skills/create-pr/SKILL.md`. Check that it has no merge conflicts, then squash-merge without waiting for pre-merge CI or review. After merging, verify that CI succeeds on `main`; if CI fails, create another pull request to fix it and repeat this process. Do not bypass branch protection or other repository restrictions.

Keep each commit a coherent, test-passing unit. Before committing, validate the exact changes being committed with the relevant checks. For affected code, configuration or runtime behavior, run `npm run typecheck`, `npm run lint`, the relevant tests (`npm test` or the applicable focused suites), `npm run build`, and relevant headless E2E. For documentation-only changes, check formatting, links and documented commands. Never call skipped, blocked or unrun checks passing; resolve failures or report the blocker before committing the affected change. Do not bundle unrelated or unverified work into a passing commit.

This authorization does not permit force-pushing, rewriting published history, destructive changes, paid API calls or real debug-service requests. Separate publication actions and expansion of the public asset/data scope still require explicit authorization. Merges to `main` may trigger the existing configured GitHub Pages workflow; preserve its checks and publication boundaries.

## SDK and verification

The pinned SDK is generated into `.generated/moqt-sdk` by the explicit first-time `node scripts/setup-sdk.mjs` step before `npm ci --ignore-scripts`. Normal development reuses that output; it must not rebuild Rust or depend on a sibling checkout. See `sdk/README.md` for setup and regeneration.

Use headless browser verification. Local-only migration provenance (not published): `migration/source-inventory.json`.

## Subagents

Before launching any subagent (Agent tool or T3 `delegate_task`), read and follow the project skill `.claude/skills/subagent-start/SKILL.md`. In this repository it replaces the global "Opus 5.5 medium / Sonnet 5.5" subagent rule.

When a `/goal` is set (a "Goal set:" kickoff message or an active goal), read and follow `.claude/skills/goal-review/SKILL.md` before doing the work: evaluate the goal yourself first; once you pass it, get a cross-vendor second opinion. Both must pass, and fixes go to a lower same-vendor model.
