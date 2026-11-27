'use strict';

const review = require('../config/esports/pickfinder-series-review-2026-11-27.json');

// Retrospective review only. The public board lacks an independently matched
// kickoff and original offer ID. A result-site profile is not a game account.
function reconcileSeries(scopes, clock, evidence = review) {
  const index = new Map();
  const seriesUrls = new Set();
  if (Date.parse(evidence.reviewedAt) <= Date.parse(clock)) {
    for (const record of evidence.series) {
      const key = JSON.stringify([record.sport, record.sourceEventId]);
      if (index.has(key) || seriesUrls.has(record.seriesUrl)) {
        throw Error('Duplicate esports series review');
      }
      index.set(key, record);
      seriesUrls.add(record.seriesUrl);
    }
  }
  const counts = {};
  const rows = scopes.map(scope => {
    const fixture = index.get(JSON.stringify([scope.sport, scope.sourceEventId]));
    const participants = fixture?.roster.filter(player =>
      player.pickfinderProfilePath === scope.profilePath &&
      player.label.toLowerCase() === scope.sourcePlayer.toLowerCase()
    ) || [];
    const player = participants.length === 1 ? participants[0] : null;
    const maps = fixture?.firstTwoValveMatchIds || fixture?.firstTwoMapNames || [];
    const firstTwo = scope.maps.length === 2 && scope.maps[0] === 1 && scope.maps[1] === 2;
    let status = 'series_unreviewed';
    if (fixture) {
      if (!player) status = 'player_unresolved';
      else if (!firstTwo || new Set(maps).size !== 2 || maps.length !== 2) status = 'map_scope_unresolved';
      else status = 'roster_and_map_corroborated';
    }
    counts[status] = (counts[status] || 0) + 1;
    return {...scope, independentSeriesEvidence: fixture ? {
      status, seriesUrl: fixture.seriesUrl, reportedDate: fixture.reportedDate,
      dateSource: fixture.dateSource || fixture.seriesUrl, reviewedAt: evidence.reviewedAt,
      independentPlayerProfile: player?.profileUrl || null,
      ...(player?.aliasSource && {resultSiteLabel: player.resultSiteLabel, aliasSource: player.aliasSource}),
      ...fixture.firstTwoValveMatchIds && {firstTwoValveMatchIds: fixture.firstTwoValveMatchIds},
      ...fixture.firstTwoMapNames && {firstTwoMapNames: fixture.firstTwoMapNames},
    } : {status}, independentReviewVerified: false, modelApproved: false};
  });
  return {rows, summary: {scopes: rows.length, counts, officialSettlementVerified: 0, qualifiedModelInputs: 0}};
}
module.exports = {reconcileSeries};
