# NHL + NFL reliable daily source captures and automatic archive tests

**Updated November 10, 2026.** The public free GitHub Actions runner performs the actual two-league private source archive, while the private repo retains immutable original source offers, pregame Higher/Lower selections, and research models. A legitimate source is always recorded at its **actual observed time**, not at the intended cron minute.

## Diagnosed failure and implemented mitigation

GitHub explicitly says `schedule` runs can be **delayed or dropped**, especially at the top of the hour. On November 10, scheduled 9 AM Pacific workflows were created as late as approximately **2:33 PM**, and the original job failed because it refused an out-of-hour archive. The false recovery option would be to record a 2:33 PM capture as 9 AM; this is prohibited.

Public workflow `.github/workflows/public-private-nhl-nfl-0900.yml` now avoids hour-boundary triggers and has five retries within each Pacific capture hour, at 06:07/17/29/41/53 and 09:07/17/29/41/53. `scripts/pacific-morning-capture-gate.cjs` binds the **actual** `America/Los_Angeles` clock to the **original** scheduled cron slot (`github.event.schedule`) or explicitly dispatched manual mode. A delayed 06:07 event arriving at 09:07 cannot be relabeled as a 9 AM source; an event arriving at 2:33 PM becomes a **safe skip, zero source requests**, not a failed or false morning capture. Unknown cron and missing private checkout authorization fail closed.

`.github/workflows/private-nhl-nfl-daily-line-movement.yml` now checks the original certified `isCertifiedMorning` rather than the generic `verifiedSlot` importer, because the latter intentionally permits genuine **manual 2 PM** snapshots. Scheduled audit must never select an afternoon observation as the morning baseline. Raw source archives and immutable original predictions remain unchanged.

## Automatic proof, not a green badge

Public `test-nhl-nfl-morning-capture-reliability.yml` runs every day near **07:16 and 10:16 Pacific**, using free public Actions minutes. It:
1. Tests genuine 6/9 Pacific timing, daylight saving transitions, wrong-slot delivery and simulated GitHub delays without contacting any provider.
2. Tests full private NHL/NFL collection, original provider IDs, pagination and line-delta source integrity.
3. Runs `scripts/audit-private-morning-archives.cjs` against both leagues' **actual saved private Git manifests and source chunks**, verifying the Pacific capture window, complete dual-sport inventory (NHL >=200, NFL >=1000), original page/chunk counts, zero missing identities, duplicate exclusion, and a unique private Git commit after capture.
4. **Fails with an error** if the corresponding day's requested 6 AM or 9 AM capture does not exist. The task never turns a "passed" GitHub job into a fabricated source archive.
5. On code changes, validates a real previously captured original 6 AM archive (Nov 10) and the failure cases with local fixtures. Future original source archives are audited independently.

A daily watchdog can itself start late when GitHub's cron is delayed. This is evidence monitoring, **not the independent capture trigger**.

## Independent Cloudflare scheduler — live activation required

A previously deployed Cloudflare Worker called `nhl-board-dispatcher` targets **obsolete private repository NHL jobs**. With private Actions minutes exhausted, its previous state cannot ensure both sports are collected through the **public** runner.

The replacement, `scheduler/nhl-board-dispatcher/src/index.mjs`, has the SAME Worker name, so successful deployment will replace the obsolete worker rather than create a second Cloudflare cron. It dispatches `Thedarkwillow/nhl-betting-platform1/.github/workflows/public-private-nhl-nfl-0900.yml` with `workflow_dispatch` input `mode=capture_0600` or `mode=capture_0900`, not an old private workflow. Worker cron runs at 05, 15, 25, 35 and 45 minutes of the necessary UTC hours and checks the actual 6/9 Pacific time, handling PST/PDT. The Worker carries **no player information, fantasy-app account data, or provider key**. It uses bounded retries and ignores stale GitHub-native queued workflow runs after a safety delay. All calls to PrizePicks remain in the secured private checkout of the **public** GitHub free runner.

`.github/workflows/deploy-nhl-nfl-cloudflare-backup.yml` tests the Worker on the public Actions runner and **deploys only when all three public repository secrets exist**. Required public repository Actions secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account containing the already deployed `nhl-board-dispatcher` Worker |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers script edit permission in that account |
| `PUBLIC_GITHUB_DISPATCH_TOKEN` | Fine-grained GitHub token restricted to PUBLIC repository `Thedarkwillow/nhl-betting-platform1` with Actions read/write |

Set them under the [public repository Action secrets](https://github.com/Thedarkwillow/nhl-betting-platform1/settings/secrets/actions), **not in chat or a source file**. Existing private repository secrets cannot be read or transferred by a public runner; if the public ones are absent, the deployment workflow tests but logs an explicit `NOT DEPLOYED` warning. The previous Worker should not be assumed retargeted until deployment and a genuine independent `workflow_dispatch` event are verified.

On Android: open the above GitHub secrets page → **New repository secret** for each required name; when all are in place, open [Activate independent scheduler](https://github.com/Thedarkwillow/nhl-betting-platform1/actions/workflows/deploy-nhl-nfl-cloudflare-backup.yml) → **Run workflow**. The next actual 06/09 Pacific external dispatch and complete privately archived NHL+NFL board must still be independently confirmed.

## Acceptance gates and limitations

- ✅ Timing/DST unit tests, GitHub late/incorrect event simulation, full NHL/NFL archived source tests, permanent 6/9 scheduled audit source verifier.
- ✅ No private source lines are emitted to the public repo; prior frozen Higher/Lower picks cannot be rewritten by line movements.
- ✅ The original complete Nov 10 06:20 Pacific source was privately Git archived and independently verified; **Nov 10 09 AM remains unverified**.
- ⚠️ Independent Cloudflare retargeting is **not proven live** until required public secrets/deployment and the first real workflow dispatch are confirmed.
- ⚠️ Future success across consecutive scheduled mornings is **not yet measured**, and GitHub native cron remains best effort even with retries.
- ❌ Never invent missed original 9 AM source snapshots, authenticated region-specific PrizePicks/Underdog app offers, official settlement, calibrated hit probabilities, or EV.

External references: [GitHub scheduled-event limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
