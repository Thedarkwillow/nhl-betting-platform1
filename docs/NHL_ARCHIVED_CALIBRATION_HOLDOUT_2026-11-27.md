# NHL chronological probability benchmark, November 27, 2026

A flat rate learned from earlier tier outcomes substantially improved the NHL Demon forecasts in the archived later sample. The corresponding Standard and Goblin comparisons do not support switching models.

| Held-out tier | Decisions / distinct games | Frozen model Brier / log loss | Earlier tier prior | Earlier market prior | Flat 50% |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard | 289 / 22 | .262597 / .719564 | .250514 / .694175 | .251629 / .696412 | .250000 / .693147 |
| Goblin | 450 / 22 | .229654 / .655766 | .229648 / .652105 | Not available | .250000 / .693147 |
| Demon | 144 / 20 | .278960 / .753245 | .232832 / .658509 | Not available | .250000 / .693147 |

The data comprises 2,664 training decisions from seven Pacific slates and 883 evaluation decisions from three later slates, November 23–25. The training snapshot came from public first-parent Git records before November 23 at midnight Pacific. The November 22 daily grade had not been published before that cutoff and was excluded from training. The holdout outcomes are official-stat grades, matched to the frozen scorecard on date, tier, counts and game count. The public checkout contains only aggregates, so this does not independently verify individual forecast or grade IDs. Wins are strict selected-direction stat hits. Pushes would count as non-hits in these probability scores only, and there were no held-out pushes.

The fixed prior has 40 neutral pseudo-decisions shared within a tier. The Standard market arm starts from that earlier Standard tier rate with another 40 pseudo-decisions of shrinkage. The fitted tier means from training are .488067 Standard, .680707 Goblin and .407173 Demon. Predictions in the holdout do not change the fit. The market rates are comparison benchmarks, not pricing, availability or settlement estimates.

Giving each of the three slates equal weight instead of weighting by decision count leaves the conclusions unchanged for Standard and Demon. For Goblin, original Brier .229195 was slightly better than the tier prior .229790, while its log loss .654959 was worse than the prior .652404. With only three holdout slates, none of these exploratory results qualifies the model for promotion. Candidates were not frozen contemporaneously. The source scorecard publishes rounded original metrics and cannot support a sound game-level paired uncertainty interval for this test. The relative performance of market rates vs the original on each individual offer is also unavailable.

Reproduce against the pinned public Git revision, with full history available:

```sh
node scripts/nhl-archived-calibration-holdout.cjs . 7fff44721fbd7761d66c7ffec89fff18a761c6c6
node --test test/nhl-archived-calibration-holdout.test.cjs test/nhl-tier-offset-calibration.test.cjs test/nhl-standard-rolling-calibration-research.test.cjs
```

The script reads public Git objects and prints aggregate results only. No collection, network calls, edits to frozen predictions, or changes to any published model are made.
