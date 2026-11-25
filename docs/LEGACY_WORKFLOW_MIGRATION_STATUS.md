# Legacy workflow migration status — 2026-11-25

Public orchestration is preferred. Do not disable private schedules until equivalent outputs and timing are verified. Restricted raw data remains private.

| Legacy failure | Public replacement or action | Acceptance |
|---|---|---|
| NFL data integration tests | public-migrated-legacy-contracts / nfl-history | Offline CI pending; Python full suite and live collector separate |
| NFL specialty research | public-migrated-legacy-contracts / nfl-specialty | Offline CI pending; private archive replay pending |
| NHL morning watchdog | public-migrated-legacy-contracts / nhl-watchdog; morning-private-archive-health | Offline CI pending; actual slot evidence pending |
| NHL seven-workstream status | public-migrated-legacy-contracts / nhl-readiness | Offline CI pending; live report separate |
| Expanded common ML | public-migrated-legacy-contracts / common-ml | Offline CI pending; training replay separate |
| NHL official period backfill | private-nhl-period-backfill public runner | Source calendar 261/261; rebuild failure stage diagnostics added, repair not yet verified |
| NHL/NFL morning board | public-private-nhl-nfl-0900; pickfinder-premium-hosted | Actual hour archive audit only; no backdating |
| NFL drive exceptions | private-six-drive-audit-public-runner | Existing public runner, fresh execution pending |
| Other private failures | existing public equivalents must be matched by exact output and cadence | Open; no blanket migration claim |

Morning audit validates immutable source/normalized digests and actual Pacific hour, reports missing archives separately from future slots. Does not certify original app lines or full board coverage.

2026-11-25: Four public suites passed in PR #291; watchdog failed due to preserved template paths. Repoint fixture to migration templates rather than re-enable metered collectors. Reintroduced on current main in PR #295, pending CI and live archive audit. Legacy schedules are not disabled until replacement acceptance.
