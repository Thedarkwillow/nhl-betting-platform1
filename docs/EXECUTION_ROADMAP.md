# Public betting platform execution roadmap
Owner requirement (2026-11-24 Pacific): reconcile and check off completed tasks every sprint. See [AGENTS.md](../AGENTS.md). This is the public execution ledger; the [legacy master roadmap](https://github.com/Thedarkwillow/nhl-betting-platform/blob/main/docs/MASTER_BETTING_PLATFORM_ROADMAP.md) remains intact. Scoped checked milestones do not complete broader legacy tasks P02-10, MLBX-16, EDGE-04 or P06-13.
## Verified scoped milestones
- [x] **[ESP-001]** OpenDota bounded source-native collection, private persistence and deduplication. 169 unique index games, 21 complete game details, 210 player rows, eight series with all listed details and stable roster; no independent ordinal proof.
- [x] **[ESP-002]** Separate 2024 Dota historical cohort: 3,000 complete matches and 30,000 player rows.
- [x] **[ESP-003]** PandaScore and GRID adapter implementation and credential-presence check (not source-use authorization).
- [x] **[ESP-004]** CS2 static history and distinct-match candidate audit: 21,870 rows; 17 distinct-match corroborated candidates, zero authoritative links.
- [x] **[ESP-005]** LoL synthetic count-distribution historical probability experiment and frozen challenger integration; not approved.
- [x] **[ESP-006]** Valorant joint agent/map and agent/opponent historical comparison; observed context only.
- [x] **[ESP-007]** COD May 2026 mode-conditioned historical test: 187 maps, 1,496 rows; matched kills/deaths MAE improved.
- [x] **[ESP-008]** Public sanitized historical scorecard deployment and dashboard validation.
- [x] **[ESP-009]** KashRock keyless sample contract test: HTTP 200, one returned sample; not authenticated board.
- [x] **[ESP-010]** CS2 round table schema validation: 794 indexed map records, 168,294 round-player records, 111,715 kill-event records. No new unique full player-map totals claimed.
- [x] **[ESP-011]** LoL patch/role historical challenger evaluated (failed improvement, all four MAEs worsened); retain prior baseline.
- [x] **[ESP-012]** Valorant prior-history agent prediction evaluated: 4,635/14,363 correct; all three matched MAEs worsened; retain prior baseline.
- [x] **[ESP-013]** Authenticated zero-credit coverage recheck: 205 CS2 offers reported by independent PrizePicks source, not individual lines; Underdog 49 remaining credits and no fresh nonzero coverage.
## Open acceptance criteria — nine-priority sprint
- [ ] **[ESP-014]** Independently verify Dota series completeness and map ordinal with authoritative second source. Native chronology alone is not sufficient.
- [ ] **[ESP-015]** Validate Dota hero/position/opponent challengers, with verified position rather than side; retain only independently validated improvements.
- [ ] **[ESP-016]** Validate genuine multi-map probability model on exact original scopes. Chronological candidate scope is not proof.
- [ ] **[ESP-017]** Resolve 17 CS2 identity conflicts with authoritative independent player ID evidence. Distinct-match candidates are not identity links.
- [ ] **[ESP-018]** Reconcile and deduplicate round-level CS2 headshot/kill totals against native Steam map records; expand unique verified coverage.
- [ ] **[ESP-019]** Verify LoL explicit team outcomes and test prior-only Elo/patch/role improvement. Latest patch challenger failed; no explicit results parsed in run 45548604774.
- [ ] **[ESP-020]** Improve pregame Valorant agent/expected-round model on untouched evidence; latest agent model failed.
- [ ] **[ESP-021]** Validate pooled nonoverlapping COD cohorts and synthetic mode probability comparison; genuine prop probability remains separate.
- [ ] **[ESP-022]** Authenticate KashRock Sandbox evaluation; bounded CS2 prop schema check, book freshness, source IDs and sides. No raw public display or paid upgrade.
- [ ] **[ESP-023]** Obtain authorized, fresh exact original-platform esports offers and rules; independently verify player/event/scope and eligible side. No third-party feed is automatically first-party proof.
- [ ] **[ESP-024]** Obtain authorized final-result and independent scoring/ordinal evidence; register and grade untouched frozen future trials. Current original offers and decided trials zero.
- [ ] **[ESP-025]** Obtain GRID and PandaScore specific permitted-use and no-charge access confirmation; both keys detected.
- [ ] **[ESP-026]** Validate prospective probability calibration and correlated 2–6 research lineups on actual original lines, not synthetic thresholds. No wager placement.
## Verified completion log
| ID | UTC date | Evidence |
| --- | --- | --- |
| ESP-001 | 2026-11-25 | [Private collection verified](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45547746724) |
| ESP-002 | 2026-11-25 | [Historical evaluation](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546951289) |
| ESP-003 | 2026-11-25 | [Credential check](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546951253) |
| ESP-004 | 2026-11-25 | [Distinct-match audit](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546951289) |
| ESP-005 | 2026-11-25 | [Merged PR #198](https://github.com/Thedarkwillow/nhl-betting-platform1/pull/198), [synthetic test](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45543382743), [regression](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546904500) |
| ESP-006 | 2026-11-25 | [Historical evaluation](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546951289) |
| ESP-007 | 2026-11-25 | [May COD test](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45546951289) |
| ESP-008 | 2026-11-25 | [Deployment](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45547746729), [validation](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45547746850) |
| ESP-009 | 2026-11-25 | [Sample contract](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45548604774) |
| ESP-010 | 2026-11-25 | [Parquet schema test](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45548604774) |
| ESP-011 | 2026-11-25 | [Negative challenger result](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45548604774) |
| ESP-012 | 2026-11-25 | [Negative challenger result](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45548604774) |
| ESP-013 | 2026-11-25 | [Coverage receipt](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/45548604774) |
## Roadmap change history
- 2026-11-25 UTC: establish public execution ledger and mandatory evidence policy; 13 scoped completed milestones, 13 open acceptance criteria. Preserve legacy roadmap and broader unfinished parent tasks. Key owner-added; Sandbox meta + one bounded CS2 evaluation call only after plan check.
