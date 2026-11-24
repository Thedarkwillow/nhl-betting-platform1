# Cito data source setup

Set CITO_API_KEY as a repository Actions secret (CITO_KEY or CITO also accepted). Never commit credentials. The readiness workflow calls only the documented zero-credit /health and unauthenticated /exports/sample/{sport}/{dataset}.csv endpoints. Sample headers are schema diagnostics, not training records. It does not assume a key grants all sports or paid exports.

CS2 and COD are priority map-history gaps. Cito also documents Valorant, LoL and Dota 2 results/stats. Deep history above 90 days has a separate quota; Master/Delta CSV exports consume zero REST credits but require the relevant subscription entitlement. Do not upgrade or call metered data without explicit authorization. Cito CS2/LoL prop data is Pro+ (and may be trial-accessible), covers Underdog and Sleeper, not PrizePicks; it is an independent reference feed, not authenticated app settlement.

Docs: https://citoapi.com/docs/rate-limits/ ; https://citoapi.com/docs/ ; https://citoapi.com/esports-player-props-api/ . Keep raw provider rows private; use source-specific map scope, identity, dates and chronology checks before model evaluation.
