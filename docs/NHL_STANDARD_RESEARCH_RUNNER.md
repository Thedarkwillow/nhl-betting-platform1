# Public runner for PRIVATE NHL Standard-market model research

This **public** repository contains only GitHub Actions orchestration and operational status descriptions. The NHL model, offer lines, individual player projections, historical stats, private credentials, prediction probabilities and settlement evidence remain in **private** `Thedarkwillow/nhl-betting-platform`. Nothing here is a betting recommendation.

## Public workflows

- `.github/workflows/private-nhl-standard-challenger-lab.yml`: run private Standard-market code/tests through free public-hosted compute, then save research-only results to **private** GitHub. Scheduled **02:35 and 11:50 Pacific**; trusted workflow dispatch/manual and workflow-file changes can also trigger. No provider requests or publicly exported model reports.
- `.github/workflows/private-pregame-nhl-freeze.yml`: fetch a **new** partner NHL/NFL observation inside a private checkout, commit raw data privately, derive NHL research preferences from valid pregame source/history, and commit a single original snapshot before the game begins. As of the private model merge, that file also contains separate uncalibrated **ice-time/role**, **opponent**, and **count-distribution** Standard shadows. Never place wagers or mislabel late captures as 06:00 or 09:00 snapshots.
- `.github/workflows/audit-private-nhl-pregame-freeze.yml`: independently check the first original private Git commit, official game identity and future game-start cutoff, and ensure newly created original snapshots have matching A/B/C Standard shadow rows in the same original Git commit. Git dates have second precision; same-second millisecond capture differences are permitted but later whole seconds are rejected.
- `.github/workflows/private-nhl-prospective-grading.yml`: reconstruct original Git-backed preferences, grade only official NHL final results, and compare against baselines. Challenger-lab reports independently maintain retrospective-vs-original-shadow separation.

## Verified end-to-end evidence (November 8 Pacific)

- [Full private Standard model tests on public free runner](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/42563614881): succeeded against private main.
- [Fresh private pregame board + first genuine future A/B/C Standard snapshots](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/42563673394): succeeded; manual source count can be below the stricter morning NFL minimum without fabricating missing pagination or original-app coverage.
- [Independent original private Git snapshot + Standard shadow chronology audit](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/42563877499): succeeded.
- Previous failure [#42563244878](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/42563244878) identified a late-night NFL inventory source guard, corrected in private [PR #91](https://github.com/Thedarkwillow/nhl-betting-platform/pull/91). The earlier independent audit [#42563791958](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/runs/42563791958) rejected valid same-second Git provenance due to Git timestamp resolution; precise same-second handling is corrected and independently verified in the subsequent successful run.

## No model promotion

A/B/C challenger coefficients are fixed research hypotheses, not independently calibrated winning probabilities. Retrospective backtests cannot be sold as prospective outcomes, and 2–6 pick lineups are not validated joint-event probabilities. New genuinely frozen A/B/C picks must be scored after official game finals, compared on identical source lines against always-Higher/Lower and Last-5/Last-10, then evaluated over sufficiently independent games and dates. Settlement/payout and source-rights documentation are separate gates.

No raw offer data, user credentials, model code, secrets, logs or screenshots should be pushed to the public repository or uploaded as public Actions artifacts. No wagers are authorized.
