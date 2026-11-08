# nhl-betting-platform1

## Public, free-runner official game-status monitoring

The \`.github/workflows/collect-public-nhl-games.yml\` workflow runs at **06:08 and 09:08 America/Los_Angeles**, and can also be dispatched manually. It fetches *only* the NHL's public daily game scoreboard and stores a narrow allowlist of game IDs, teams, starts and scores in \`nhl-games.json\`. The raw API response is not committed. Each observation preserves its *actual* fetch time and provider name.

This is public scoreboard context, **not a PrizePicks/Underdog prop board**, not a valid 6 AM or 9 AM player-line capture, not model output, and not a replacement for the private repo's morning archive, projections, grading or original platform settlements. No paid API token, private checkout, repository PAT, proprietary data or hidden model code belongs in the public workflow. Production/commercial reuse rights must still be reviewed.

Website publication and smoke/validation already use this **public** repository's free standard GitHub-hosted runners. The **private** backend remains in \`Thedarkwillow/nhl-betting-platform\`. See its \`docs/PRIVATE_RUNNER_COST_RECOVERY_2026-11-08.md\` for the separate self-hosted path; until a runner is online the private collectors are *not* restored by this public workflow.

## Probability validation and recommendations

The public **Accuracy** tab displays only backend-allowlisted aggregates: count of original
Git-frozen picks, historical Standard training decisions, *future* Standard holdout coverage
and (only after a minimum sample) diagnostic Brier/log loss. If the private backend has not
published an audited summary, the page displays an unavailable/not-approved state.
Never publish private partner-board archives, player IDs, model coefficients, payout receipts,
or private Git snapshots here. Model estimates and research lineups are not validated betting
recommendations. No wager-placement integration is authorized.

## 9 AM Pacific NHL + NFL private boards on free PUBLIC runners

The new `.github/workflows/public-private-nhl-nfl-0900.yml` workflow runs
09:00, 09:12, 09:27 and 09:43 Pacific, plus a trusted manual `capture_0900`
dispatch. The public checkout only probes **counts**; original player offers
must never be saved, logged or uploaded from the public repo.

For an actual privately archived full board, configure the public Actions
secret `PRIVATE_RESEARCH_REPO_TOKEN` with a fine-grained, expiring GitHub
personal access token restricted to **only**
`Thedarkwillow/nhl-betting-platform`, **Contents: Read and write**.
No public repository default token can read private code. The scheduled
workflow securely checks out the private repository at runtime, runs the
private collector for both sports, and pushes only to the private branch
`main`. It fails if the secret, source reachability, actual Pacific 9 AM
time, complete provider pagination, or private Git archival is missing.

The `probe_now` action and first `push` run test public network access;
they DO NOT certify a real 9 AM board. Current model probabilities remain
uncalibrated and no wagers are placed.
