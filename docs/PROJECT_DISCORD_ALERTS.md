# Project Discord research alerts

This is our own channel feed, separate from PickFinder's native notifications and the legacy private alert inbox. The GitHub workflow reuses published authorized snapshots and the existing Discord URL validator. It does not fetch new boards or send anything to PickFinder.

## Connect a dedicated Discord text channel

1. Pick a text channel on your server. In Discord, open its settings, then Integrations → Webhooks. Create an incoming webhook for that channel.
2. In GitHub, open Settings → Secrets and variables → Actions. Add the webhook URL as repository secret `PROJECT_DISCORD_WEBHOOK_URL`. Never paste it into chat, commit it, or add it as a variable.
3. Add repository variables `PROJECT_DISCORD_GUILD_ID` and `PROJECT_DISCORD_CHANNEL_ID`. Discord's Developer Mode exposes Copy Server ID and Copy Channel ID. Use the exact channel from step 1.
4. In GitHub Actions, open **Project Discord research alerts** and run `main` with `test` once. It sends one counts-free setup message only if Discord metadata confirms the exact server and channel. Verify both the channel message and the Actions result `discord_confirmed`.
5. Set repository variable `PROJECT_DISCORD_ALERTS_ENABLED` to `1` to enable alert delivery after eligible existing capture and archive workflows. Remove it to pause scheduled sends. Preview never reads the webhook or writes delivery state.

## What it sends

A maximum of six entries per wake-up, with Discord mentions disabled. Eligible alerts cover observed line and price movement, new props, removals, alternate tiers, exact contemporaneous cross-platform threshold differences, and independently graded research ledger changes. A removal requires complete interpreted observations and an independently usable future event timestamp. Partial/disabled/stale boards are not disappearance evidence. Source snapshots are observational and do not certify original app availability.

The sender reserves event hashes on the separate `project-discord-alert-ledger` state ref before dispatch, and confirms a message using Discord's response. Ambiguous sends remain reserved rather than being retried automatically. Old receipts are pruned from the current ledger, but Git snapshots still contain only event hashes, timestamps, states, and keyed proof digests. No destination, credentials, source rows, or raw message identifiers are written to the ledger or workflow logs.

If no events meet the evidence gates, the workflow sends nothing. A green preview or mock test is not proof of live delivery.

## Optional filters and sport-specific channels

Keep the default channel for everything by leaving both settings absent. The optional repository variable `PROJECT_DISCORD_FILTERS` accepts an allowlist such as `{"sports":["nba","nhl"],"tiers":["standard","goblin"],"kinds":["line_change","price_change","alternate_tier"]}`. Supported keys are sports, tiers, books and kinds. A discrepancy must match both configured books. Leave a key absent to avoid filtering that dimension.

The optional **secret** `PROJECT_DISCORD_SPORT_ROUTES` accepts up to four sport overrides, each with `channelId` and `webhookUrl` properties. The target must be a different text channel on the same Discord server. Use a separate incoming webhook for each destination. Routes override the default only for events assigned to that sport. No additional routes are created by the workflow, and replayed events are not resent after a route change.

Price-only moves have a separate filter category. Board alerts include the observed UTC clock, and independently committed fresh NBA availability reports may publish counts by status. Injuries do not establish actual participation or confirmed starters.
