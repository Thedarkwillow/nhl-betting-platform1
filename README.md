# nhl-betting-platform1

## Public, free-runner official game-status monitoring

The \`.github/workflows/collect-public-nhl-games.yml\` workflow runs at **06:08 and 09:08 America/Los_Angeles**, and can also be dispatched manually. It fetches *only* the NHL's public daily game scoreboard and stores a narrow allowlist of game IDs, teams, starts and scores in \`nhl-games.json\`. The raw API response is not committed. Each observation preserves its *actual* fetch time and provider name.

This is public scoreboard context, **not a PrizePicks/Underdog prop board**, not a valid 6 AM or 9 AM player-line capture, not model output, and not a replacement for the private repo's morning archive, projections, grading or original platform settlements. No paid API token, private checkout, repository PAT, proprietary data or hidden model code belongs in the public workflow. Production/commercial reuse rights must still be reviewed.

Website publication and smoke/validation already use this **public** repository's free standard GitHub-hosted runners. The **private** backend remains in \`Thedarkwillow/nhl-betting-platform\`. See its \`docs/PRIVATE_RUNNER_COST_RECOVERY_2026-11-08.md\` for the separate self-hosted path; until a runner is online the private collectors are *not* restored by this public workflow.
