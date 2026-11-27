'use strict';

const {matchRow} = require('./pickfinder-native-history-reconciliation.cjs');
const {sha} = require('./pickfinder-public-archive.cjs');

const tablePrefix = 'Date | Opponent | Min | Pts | Rebs | O-Reb | D-Reb | Asts | ';
const marker = ' | [header truncated]';
const aliases = {Rebs:'reb', Asts:'assists', Blks:'blocks', Stls:'steals', TO:'tov'};
const digestOk = value => /^[a-f0-9]{64}$/.test(value);
function sawBy(value, cutoff) {
  return Number.isFinite(Date.parse(value)) && Date.parse(value) <= cutoff;
}

function clippedScope(header) {
  if (header.length === 500) return header;
  if (header.endsWith(marker) && header.length === 480 + marker.length) return header.slice(0, 480);
  return null;
}

function createLayoutAudit(clock) {
  const cutoff = Date.parse(clock), layouts = new Map(), gaps = [];
  return {
    gaps,
    pin(r, f, digest, width) {
      const {research, ...record} = r;
      return {record, field:f, digest, width};
    },
    observe(r, f, digest, width) {
      if (f.headerLayout !== 'span-grid-v1' || !f.scope.startsWith(tablePrefix) ||
          f.scope.split(' | ').length !== width ||
          !digestOk(digest) || !sawBy(f.observedAt, cutoff)) return;
      const refs = layouts.get(width) || new Map();
      const layout = refs.get(f.scope) || {digests:new Set(), players:new Set()};
      layout.digests.add(digest);
      layout.players.add(r.player);
      refs.set(f.scope, layout);
      layouts.set(width, refs);
    },
    run(index) {
      const reasons = {}, rows = [], facts = new Set();
      let reconstructed = 0, independentlyMatched = 0;
      for (const {record, field, digest, width} of gaps) {
        const prefix = field.scope.startsWith(tablePrefix) ? clippedScope(field.scope) : null;
        const matches = prefix ? [...(layouts.get(width)?.entries() || [])].filter(([header]) => header.startsWith(prefix)) : [];
        let reason = 'retained_header_cannot_be_reconstructed';
        if (digestOk(digest) && sawBy(field.observedAt, cutoff) && matches.length === 1) {
          const [scope, refs] = matches[0];
          if (refs.digests.size >= 2 && refs.players.size >= 2) {
            reconstructed++;
            const normalized = scope.split(' | ').map(label=>aliases[label] || label).join(' | ');
            const result = matchRow(record, {...field, scope:normalized}, index, clock);
            reason = result.reason;
            if (result.candidate) {
              const fact = result.candidate;
              reason = 'independent_stat_match';
              independentlyMatched++;
              facts.add(JSON.stringify([fact.playerId, fact.eventId, fact.market, fact.value]));
              rows.push({player:record.player, market:fact.market, value:fact.value, nativeEventId:fact.eventId,
                sourceDigest:digest, sourceScopeDigest:sha(JSON.stringify([record.detailId, field.metric, field.scope, field.tab, field.window, field.filterSelection, field.value])),
                layoutDigests:[...refs.digests].sort(), nativeDigest:fact.nativeDigest, sourceObservedAt:field.observedAt,
                retrospectiveOnly:true, modelApproved:false});
            }
          }
        }
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
      return {summary:{originalGaps:gaps.length,reconstructedHeaders:reconstructed,independentlyMatched,
        distinctMatchedFacts:facts.size,reasons,qualifiedCacheChanged:false,collectionSkipAuthorized:false,modelApproved:false},rows};
    }
  };
}

module.exports = {createLayoutAudit};
