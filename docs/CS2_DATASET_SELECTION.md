# CS2 dataset selection — 2026-11-24

Preferred broad source: Cito API historical CS2 export (https://citoapi.com/cs2-historical-data-api/). Vendor reported 723,564 player-map lines and 67,149 maps on Nov 9, 2026, including older Counter-Strike. Filter explicit CS2-era records, verify stable player/team/map IDs, complete final maps and exact counts; preserve source date and map ordering. Historical bulk access needs entitlement; no subscription or metered call authorized. A schema sample is not training data.

Free research fallback: OpenCS2, pinned post-QC revision 912a363098feec3f220e41d68634d2f71676c28b, CC BY 4.0 subject to original source terms. Download only metadata, enumerate every manifest page, hash-check where available. Short date window and incomplete maps are limitations. Do not mix overlapping derivatives as independent observations.

Other investigated sources: jankasen/cs2 reports 40,920 boxscores but no published data asset found; CS2RB anonymizes player identities; PureSkill is noncommercial and matchmaking/FACEIT rather than named professional history; legacy Aokua player CSV is entirely 2015–2020 and excluded. No source is treated as evidence of actual app prop lines.

No provider key or licensed raw dataset goes in public Git. Keep actual results separate from advertised counts; no model promotion.
