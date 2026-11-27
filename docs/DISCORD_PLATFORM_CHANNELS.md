# Discord platform channels

| Channel | Receives after cutover |
| --- | --- |
| `#prizepicks-props` | PrizePicks new, moved, repriced, removed and reposted props, plus alternate tiers |
| `#prizepicks-suggestions` | Qualified individual PrizePicks prop research only |
| `#underdog-props` | Underdog new, moved, repriced, removed and reposted props, plus alternate tiers |
| `#underdog-suggestions` | Qualified individual Underdog prop research only |
| `#general` (optional) | Collection status, verified availability updates and model-research performance summaries |

## Set up on your phone

1. In Discord, make four text channels with the exact names above. Turn on **Settings → Advanced → Developer Mode**. Press and hold each channel and tap **Copy Channel ID**.
2. In **Server Settings → Integrations → Webhooks**, create one webhook for each new channel. Pick the matching channel in the webhook settings, save, and tap **Copy Webhook URL**. If the app doesn't show Webhooks, try Discord in a browser with **Desktop site** enabled. You need permission to manage webhooks. No `#general` webhook is required.
3. Open [GitHub Actions secrets](https://github.com/Thedarkwillow/nhl-betting-platform1/settings/secrets/actions) in your phone browser. Tap **New repository secret** and name it `PROJECT_DISCORD_PLATFORM_ROUTES`. Paste the template below into the secret field and replace all placeholders there. Never paste actual webhook URLs into chat, Git files, or GitHub variables.

```json
{
  "prizepicks-props": {"channelId":"PASTE_CHANNEL_ID","webhookUrl":"PASTE_WEBHOOK_URL"},
  "prizepicks-suggestions": {"channelId":"PASTE_CHANNEL_ID","webhookUrl":"PASTE_WEBHOOK_URL"},
  "underdog-props": {"channelId":"PASTE_CHANNEL_ID","webhookUrl":"PASTE_WEBHOOK_URL"},
  "underdog-suggestions": {"channelId":"PASTE_CHANNEL_ID","webhookUrl":"PASTE_WEBHOOK_URL"}
}
```

4. Open [Project Discord research alerts](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/workflows/project-discord-line-alerts.yml). Tap **Run workflow**, stay on `main`, select `test_routes`, and run. Look for one clearly labeled test in each of the four platform channels. The run reports only each route name and confirmation status. A pass confirms test delivery, not delivery of a new prop or a qualified suggestion.
5. After all four tests pass, add the repository **variable** `PROJECT_DISCORD_PLATFORM_ROUTING_ENABLED` with value `1` on the **Variables** tab next to [Actions secrets](https://github.com/Thedarkwillow/nhl-betting-platform1/settings/secrets/actions). Leave `PROJECT_DISCORD_ALERTS_ENABLED` at its existing value of `1`. Verify a subsequent automatic run shows `deliveredRoutes` for genuine routed alerts. A quiet board or a lack of qualified suggestions can legitimately produce zero sends.

Platform-only delivery is the workflow default. To opt in to general delivery, set `PROJECT_DISCORD_GENERAL_ENABLED` to `1` and configure the general channel ID and webhook. The guild ID is still required to verify every destination. Operational summaries are withheld when there is no general channel. If general delivery is explicitly enabled, it keeps its prior routing until step 5 and can be tested separately with `test`. In split mode the existing sport, platform, tier and category filters still apply, and the platform/category destination replaces sport-specific webhook overrides. No market event or suggestion falls back to `#general`. Cross-platform discrepancy summaries are not delivered in split mode. A wrong server/channel is rejected before delivery and ambiguous sends are never retried automatically. New, alternate and reposted props still take precedence over ordinary price changes. To roll back to the old routing, remove the cutover variable.

## Suggestion eligibility and verification

The sender accepts only the committed `data/approved-individual-prop-research.json` approval artifact with kind `approved_individual_prop_research_v1`. It expects the exact current active first-party offer (platform offer ID, player/event/market IDs, sport, side, tier, line, and full period/map/mode scope), an independently verified upcoming game start, an approved calibrated individual model, and an existing individual research gate outcome tied to the same exact offer and model revision. The offer, calibration and gate receipts must be represented by digests. The most recent offer verification and gate receipt must be at most 15 minutes old, and the forecast inputs no more than 90 minutes old. The sender does not create these approvals. Raw PickFinder observations, public rankings, uncalibrated research and unavailable inputs must not produce a suggestion. The approval artifact is not currently produced in the public project, so suggestions correctly abstain. Do not create a live artifact from test fixtures or hand-set approval flags to trigger a send.

A genuine suggestion becomes eligible for delivery testing only after an existing model and first-party offer workflow produces qualifying evidence. Never send a test example as a real suggestion.
