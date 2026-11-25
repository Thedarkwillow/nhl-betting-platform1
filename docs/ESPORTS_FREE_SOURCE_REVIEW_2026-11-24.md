# Free esports source review — 2026-11-24 Pacific

No new subscriptions, no metered PrizePicks/Underdog requests, no Cito.
Historical or current public statistics are not evidence of original prop availability or settlement.

| Candidate | Actual review | Decision |
|---|---|---|
| OpenCS2 | Existing verified metadata download and exact-scope evaluation | Retain; narrow March–April cohort |
| sneakyzero/cs2-pro-round-economy | Dataset card identifies OpenCS2 upstream and one-month snapshot | Do not count as independent new dates |
| Jankasen/cs2 | Public repository tree inspected; no SQLite catalog or player-map Parquet | Request separately licensed export |
| Aokua/csgopred | Repository license and ingest code inspected; distributed raw Kaggle player CSV is the 2015–2020 source, not modern player-map totals | Do not use old whole-match statistics for CS2 props |
| smallmeji/hltv-cs2-data-public | Actual published match index and date index read; both empty | Team aggregates not a player-match baseline |
| StrandedPond/hltv_scraper | Public file tree contains player_stats.csv; connector returned no body; no repository license surfaced | Schema and use rights unresolved |
| EiJee/HLTV2025Dashboard | Tree contains aggregate player stats CSV, no clear data license | No date-level model evidence |
| Budapest 2025 workbook | Tree includes workbook; README labels some data estimated, educational use only | No ingestion as verified player stats |
| archotium/cs2-match-prediction | MIT code; published team summary features, raw Kaggle source separate | No raw player counts inferred |
| CS2RB Zenodo 10.5281/zenodo.22970589 | Dataset catalog CC BY 4.0, no player names, SteamIDs or team names | Not usable for exact player crosswalk |
| PureSkill | Anonymized, noncommercial share-alike; AWS export charges possible | No purchase or reidentification |
| GRID and Riot GRID | Free official feeds require approved use and access; free route noncommercial | Obtain approved scope before connecting |
| PandaScore | Free fixtures/results, detailed historical player data gated | Needs account; verify allowed use |
| BALLDONTLIE | Free API key available, player match-map stats higher tier | No trial/subscription activation |
| EsportsOdds | Free sandbox fixed past sample, not live or full history | No card-required trial |
| DataSportsAPI | Documented all-plan games and lineups; free key required, 7-day history; terms and entitlement for this project unverified | Candidate for forward results capture, not historical recovery |
| Kaggle | Four exact dataset metadata endpoints probed with no key; no dataset download before rights review | Inspect audit output |
| OpenDota | No-key public API; bounded completed game sample and aggregate freshness audit | Separate game IDs from series and prop settlement |
| ChainCC / VCT Reference / COD wiki | Existing historical integrations, rights and title coverage reviewed separately | Do not represent historical tables as live props |
| PGL / HLTV / BLAST | Public schedules/results references | Captured target fixtures still pending at review; no invented final player counts |

Sources:
- https://github.com/jankasen/cs2
- https://github.com/Aokua/csgopred
- https://github.com/smallmeji/hltv-cs2-data-public
- https://github.com/StrandedPond/hltv_scraper
- https://github.com/EiJee/HLTV2025Dashboard
- https://github.com/serbansergiu-crypto/cs2-budapest-major-2025
- https://github.com/archotium/cs2-match-prediction
- https://huggingface.co/datasets/sneakyzero/cs2-pro-round-economy
- https://doi.org/10.5281/zenodo.22970589
- https://docs.pureskill.gg/
- https://grid.gg/open-access/
- https://grid.gg/riot-open-access/
- https://developers.pandascore.co/docs/plan-reference
- https://cs.balldontlie.io/
- https://docs.esportsodds.gg/docs/rate-limits
- https://datasportsapi.com/free-sports-api/
- https://datasportsapi.com/docs/fixtures/games/
- https://opendota.apidocumentation.com/
- https://chaincc.lol/free/data/
- https://blast.tv/cs/tournaments/pgl-singapore-major-2026/match

No source is deemed commercially licensed merely because a free account or public file exists.
