# Esports research v1 — isolated, no paid data calls

This branch covers CS2, Valorant, League of Legends, Dota 2 and Call of Duty. It does not change the NHL/NBA/NFL/MLB models or dashboard. The source registry includes all six originally proposed sources, plus both pick'em platforms and supplemental sources. Registry membership is not active API access or authorization. Every network switch is off. No restricted scraping, account creation, subscriptions, new secrets or wagering.

## Inputs

Supply private JSON arrays of authorized, source-attributed map box scores and actual captured offers. A box score must carry title, stable player/team/opponent/series/map IDs, exact map index, ruleset, UTC start/end/observed timestamps, actual played exposure in rounds (CS2/Valorant) or minutes (LoL/Dota/COD), integer statistics, final/identity/participation/pro status; COD requires game edition and mode. A source match ID is never inferred to be a series/map position. Do not treat percentage headshots as a count. Offer records require platform, original ID, timestamp, match identity, map indices, exact threshold, offered sides, tier, rule version and source. These assertions still require independent source verification.

## Offline commands

```
node --test test/esports-research-v1.test.cjs
node scripts/run-esports-research-v1.cjs dota-import /private/opendota-match.json
node scripts/run-esports-research-v1.cjs replay /private/offers.json /private/maps.json
node scripts/run-esports-research-v1.cjs freeze /private/offers.json /private/maps.json outputs/esports/frozen/unique-utc-name.json
node scripts/run-esports-research-v1.cjs grade outputs/esports/frozen/unique-utc-name.json /private/maps.json
```

Freeze archives use exclusive create; prospective grading checks first-Git time and rejects modified or late files. Grading is statistical, not platform settlement. Never use reconstructed historical results as genuine prospective predictions. The calibration CLI is per archive and needs sufficient earlier and later observations; a multi-archive cohort aggregator remains needed. No actual prop records are currently validated. The six regression tests use synthetic fixtures; the public OpenDota test fixture decoded ten historical player rows, all ineligible for prop matching.

## Research roadmap

- Obtain data-use permission for the intended betting research purpose and approved exports for each game. Connect GRID/Riot GRID/PandaScore only after access and rights confirmation. HLTV, VLR, PickFinder and other public pages are reference-only until allowed automation is documented.
- Reconcile exact player, team, tournament, series/map index and ruleset identity between original offers and statistics. Archive before series start; record changes without overwriting first snapshots.
- Compare the empirical count baseline and exposure-scaled challenger on identical actual lines. Forecast rounds/maps/veto and duration separately from target outcomes; fit opponent, role, patch, roster, agent/hero, LAN/tier and COD mode effects using only past data. The existing context subset experiments are not fitted production models.
- Test genuine outcomes on held-out matches and later first-Git archives, separately by game, market, scope, platform and tier. Fit probability calibration on earlier data; do not use the holdout for feature selection.
- Build and independently validate joint event probabilities from matched same-series outcomes; repeated-player, map-overlap and teammate/opponent dependence cannot be assumed zero. Require exact entry-specific payout, offered sides, grading/DNP rules, verified calibration and sufficient independent samples before any 2–6 leg optimizer is enabled. No approved entry, probability, EV or ROI is produced by this branch.
