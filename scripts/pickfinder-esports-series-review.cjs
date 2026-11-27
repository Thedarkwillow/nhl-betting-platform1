'use strict';

const review = require('../config/esports/pickfinder-series-review-2026-11-27.json');
const followup = require('../config/esports/pickfinder-series-review-remainder-2026-11-27.json');
const keyOf = ({sport, sourceEventId}) => JSON.stringify([sport, sourceEventId]);
const agrees = (scope, person) => person.pickfinderProfilePath === scope.profilePath &&
  person.label.toLowerCase() === scope.sourcePlayer.toLowerCase();

// Retrospective review only. The public board lacks an independently matched
// kickoff and original offer ID. A result-site profile is not a game account.
function reconcileSeries(scopes, clock, evidence = review, updates = evidence === review ? followup : null) {
  const index = new Map();
  const seriesUrls = new Set();
  if (Date.parse(evidence.reviewedAt) <= Date.parse(clock)) {
    for (const record of evidence.series) {
      const key = keyOf(record);
      if (index.has(key) || seriesUrls.has(record.seriesUrl)) {
        throw Error('Duplicate esports series review');
      }
      index.set(key, record);
      seriesUrls.add(record.seriesUrl);
    }
  }
  const later = new Map();
  if (updates && Date.parse(updates.reviewedAt) <= Date.parse(clock)) {
    for (const record of updates.series) {
      const key = keyOf(record);
      if (!index.has(key) || later.has(key)) throw Error('Unmatched esports series review update');
      later.set(key, record);
    }
  }
  const counts = {};
  const rows = scopes.map(scope => {
    const key = keyOf(scope);
    const fixture = index.get(key);
    const update = later.get(key);
    const participants = [...fixture?.roster || [], ...update?.additionalRoster || []]
      .filter(person => agrees(scope, person));
    const player = participants.length === 1 ? participants[0] : null;
    const conflicts = (update?.rosterConflicts || []).filter(person => agrees(scope, person));
    const rosterConflict = !player && conflicts.length === 1 ? conflicts[0] : null;
    const maps = fixture?.firstTwoValveMatchIds || update?.firstTwoMapNames || fixture?.firstTwoMapNames || [];
    const followsUpdate = rosterConflict || update?.additionalRoster?.includes(player) ||
      (player && update?.firstTwoMapNames);
    const firstTwo = scope.maps.length === 2 && scope.maps[0] === 1 && scope.maps[1] === 2;
    let status = 'series_unreviewed';
    if (fixture) {
      if (rosterConflict) status = 'roster_conflict';
      else if (!player) status = 'player_unresolved';
      else if (!firstTwo || new Set(maps).size !== 2 || maps.length !== 2) status = 'map_scope_unresolved';
      else status = 'roster_and_map_corroborated';
    }
    counts[status] = (counts[status] || 0) + 1;
    return {...scope, independentSeriesEvidence: fixture ? {
      status, seriesUrl: fixture.seriesUrl, reportedDate: fixture.reportedDate,
      dateSource: fixture.dateSource || fixture.seriesUrl, reviewedAt: followsUpdate ? updates.reviewedAt : evidence.reviewedAt,
      independentPlayerProfile: player?.profileUrl || rosterConflict?.profileUrl || null,
      ...(player?.rosterSource && {additionalRosterSource: player.rosterSource}),
      ...(rosterConflict && {rosterConflict}),
      ...(player && update?.firstTwoResultSiteMapIds && {firstTwoResultSiteMapIds: update.firstTwoResultSiteMapIds, resultSourceSha256: update.resultSourceSha256}),
      ...(player?.aliasSource && {resultSiteLabel: player.resultSiteLabel, aliasSource: player.aliasSource}),
      ...fixture.firstTwoValveMatchIds && {firstTwoValveMatchIds: fixture.firstTwoValveMatchIds},
      ...!fixture.firstTwoValveMatchIds && {firstTwoMapNames: maps},
    } : {status}, independentReviewVerified: false, modelApproved: false};
  });
  return {rows, summary: {scopes: rows.length, counts, officialSettlementVerified: 0, qualifiedModelInputs: 0}};
}
module.exports = {reconcileSeries};
