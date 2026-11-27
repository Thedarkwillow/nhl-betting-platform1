# NBA PickFinder matchup ablation — November 27, 2026

Replayed already-archived PickFinder full-game half-lines against independently verified NBA final box scores. Same-offer matchup inputs were paired with the exact L10 and scored with equal weight per game. This is retrospective research, not a new freeze or release decision.

The matchup arm treats the L10 hit rate as a 20-game prior and updates it with the archived opponent-specific count. The two shrinkage arms each take the midpoint between their underlying probability and 50%. No coefficient or model version was fitted to these results.

| Arm | Brier | Log loss |
| --- | ---: | ---: |
| Flat 50% | 0.250000 | 0.693147 |
| L10 plus matchup, shrunk | 0.254810 | 0.703095 |
| L10, shrunk | 0.261547 | 0.717265 |
| L10 plus matchup | 0.269068 | 0.737553 |
| L10 | 0.286112 | 0.868157 |

The matchup increment improved both metrics over L10 after applying the same shrinkage, including in each of the 11 matched market groups. None of the four overall feature arms beat the neutral baseline. All 937 distinct propositions were from the same November 25 Pacific slate and only nine games. None had an explicit board event clock. Independent archived schedule clocks support this retrospective replay only. The chronological partition is withheld because fewer than three distinct dates qualified, and game-delta uncertainty intervals are withheld below 30 distinct games. Market differences are descriptive, not independent wins. This previously inspected archive is not an untouched holdout.

## Reproduce

Use a full checkout of public archive revision `828e6b43`. Apply the ablation code from this change, then run:

```sh
node scripts/pickfinder-nba-matchup-retrospective.cjs . 2026-11-27T06:10:00Z
node --test test/pickfinder-nba-matchup-retrospective.test.cjs test/public-nba-mirror-prospective-bridge.test.cjs
```

The replay makes no network calls and produces a report on stdout only. No original forecasts, model revisions or grades are changed. Additional independent slates and a properly untouched evaluation are required before any model promotion.
