'use strict';

const {matchRow,profilePath} = require('./pickfinder-native-history-reconciliation.cjs');
const {sha} = require('./pickfinder-public-archive.cjs');
const {VERSION} = require('./pickfinder-research-coverage.cjs');

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

const dt = Date.parse, dayMs = 86400000;
const fantasyMarket = 'player_fantasy_score_all_';
const periodRoutes = new Map([
  ['1st_quarter_player_points',['1st_quarter',12]],
  ['1st_half_player_points',['1st_half',24]],
  ['1st_half_player_points_+_rebounds_+_assists',['1st_half',24]],
  ['1st_half_player_fantasy_score_all_',['1st_half',24]]
]);
function corroborateFullGameBody(record,field,index,clock) {
  const route=periodRoutes.get(record.market);
  if (record.sport!=='nba'||!route||record.period!==route[0]||field.period!==route[0]||
      [record.mapRange,record.gameMode,field.mapRange,field.gameMode].some(x=>x!=null)) return null;
  const headers=field.scope.split(' | ');
  if (headers[0]!=='Date'||headers[1]!=='Opponent'||headers[2]!=='Min'||
      headers.filter(h=>h==='Min').length!==1) return null;
  let cells;try{cells=JSON.parse(field.value);}catch{return null;}
  const minutes=cells?.[2]?.value;
  if (!Array.isArray(cells)||cells.length!==headers.length||typeof minutes!=='string'||
      !/^\d{1,2}(?:\.\d{1,2})?$/.test(minutes)||Number(minutes)<=route[1]||Number(minutes)>70) return null;
  // The selected offer can set the record/field period without scoping the
  // history table. Independently corroborate the unqualified points and PRA
  // columns as full-game totals. Keep this diagnostic disjoint from matches.
  const find=market=>matchRow({...record,market,period:null},{...field,period:null},index,clock,
    {allowNbaExtendedFinals:true}).candidate;
  const pts=find('player_points'),pra=find('player_points_+_rebounds_+_assists');
  if (!pts||!pra||pts.playerId!==pra.playerId||pts.eventId!==pra.eventId||pts.nativeDigest!==pra.nativeDigest) return null;
  return {period:route[0],playerId:pts.playerId,eventId:pts.eventId};
}
function formulaScope(r) {
  if (r.sport !== 'nba' || r.market !== fantasyMarket || r.period != null || r.mapRange != null ||
      r.gameMode != null || typeof r.player !== 'string' || !r.player.trim() || !profilePath(r.sport,r.detailId)) return null;
  const u = new URL(r.detailId,'https://www.pickfinder.app'), prop = u.searchParams.getAll('prop');
  const parts = prop.length === 1 ? prop[0].split(':') : [];
  if (u.hash || [...u.searchParams.keys()].length !== 1 || parts.length !== 4 ||
      !/^[a-z0-9]+$/i.test(parts[0]) || parts[1] !== fantasyMarket || !r.eventId ||
      parts[2] !== r.eventId || !/^\d{1,4}(?:\.\d{1,2})?$/.test(parts[3])) return null;
  return {key:JSON.stringify([u.pathname,prop[0],r.player]), threshold:Number(parts[3])};
}

function createLayoutAudit(clock) {
  const cutoff = Date.parse(clock), layouts = new Map(), gaps = [];
  const books = new Map();
  function bookEvidence(scope) {
    if (!books.has(scope.key)) books.set(scope.key,{boards:new Map(), profiles:new Map(), conflicting:false});
    return books.get(scope.key);
  }
  function bindLegacyBook(record, field, digest) {
    // A legacy "book" is a source route, not sufficient evidence of exclusivity.
    if (record.book !== 'prizepicks' || record.books !== undefined) return null;
    const scope = formulaScope(record);
    const evidence = scope && books.get(scope.key), observed = dt(field.observedAt);
    if (!evidence || evidence.conflicting) return null;
    const board = [...evidence.boards].flatMap(([dig,groups]) =>
      [...groups].filter(([,sides])=>sides.size===2).map(([at])=>({dig,at})));
    const before = board.filter(x=>x.at<=observed&&observed-x.at<=dayMs)
      .sort((a,b)=>b.at-a.at||a.dig.localeCompare(b.dig))[0];
    const after = before && board.filter(x=>x.at>observed&&x.at-observed<=dayMs&&x.dig!==before.dig)
      .sort((a,b)=>a.at-b.at||a.dig.localeCompare(b.dig))[0];
    const donor = [...evidence.profiles].filter(([d,at])=>d!==digest&&at>observed&&at-observed<=dayMs)
      .sort(([a,t],[b,u])=>t-u||a.localeCompare(b))[0];
    return after && donor ? {book:'prizepicks',boardDigests:[before.dig,after.dig],profileDigest:donor[0],
      retrospectiveOnly:true, originalSettlementVerified:false} : null;
  }
  return {
    gaps,
    observeFormulaBoard({m,offers,digest,first}) {
      if (m.sport !== 'nba' || m.authenticated !== true || !digestOk(digest) || !sawBy(first,cutoff)) return;
      for (const o of offers) {
        const scope = formulaScope(o), at=dt(o.observedAt);
        if (!scope || o.book!==m.book || o.line!==scope.threshold || !Number.isFinite(at) ||
            at<dt(m.firstObservedAt)||at>dt(m.lastObservedAt)||at>dt(first)+999) continue;
        const evidence = bookEvidence(scope);
        if (o.book!=='prizepicks') {evidence.conflicting=true;continue;}
        if (!['Higher','Lower'].includes(o.side)) continue;
        const groups=evidence.boards.get(digest)||new Map(), sides=groups.get(at)||new Set();
        sides.add(o.side);groups.set(at,sides);evidence.boards.set(digest,groups);
      }
    },
    observeFormulaProfile(record,digest,observedAt,first) {
      const scope = formulaScope(record);
      if (!scope || !digestOk(digest) || !sawBy(first,cutoff) || !sawBy(observedAt,cutoff) ||
          dt(observedAt)>dt(first)+999 || record.status!=='sampled' || record.truncated!==false ||
          record.coverageVersion!==VERSION || !Array.isArray(record.books) || !record.books.length) return;
      const evidence=bookEvidence(scope);
      if (record.book!=='prizepicks'||record.books.length!==1||record.books[0]!=='prizepicks') {
        evidence.conflicting=true;return;
      }
      evidence.profiles.set(digest,dt(observedAt));
    },
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
      const reasons = {}, rows = [], facts = new Set(), fullGameBodyGames=new Set(), fullGameBodyPeriods={};
      let reconstructed = 0, independentlyMatched = 0, archivedFormulaBindings = 0;
      for (const {record, field, digest, width} of gaps) {
        const prefix = field.scope.startsWith(tablePrefix) ? clippedScope(field.scope) : null;
        const matches = prefix ? [...(layouts.get(width)?.entries() || [])].filter(([header]) => header.startsWith(prefix)) : [];
        let reason = 'retained_header_cannot_be_reconstructed';
        if (digestOk(digest) && sawBy(field.observedAt, cutoff) && matches.length === 1) {
          const [scope, refs] = matches[0];
          if (refs.digests.size >= 2 && refs.players.size >= 2) {
            reconstructed++;
            const normalized = scope.split(' | ').map(label=>aliases[label] || label).join(' | ');
            const binding = bindLegacyBook(record,field,digest);
            const scopedRecord = binding ? {...record,books:[binding.book]} : record;
            const result = matchRow(scopedRecord, {...field, scope:normalized}, index, clock, {allowNbaExtendedFinals:true});
            reason = result.reason;
            if (reason==='unsupported_scope') {
              const body=corroborateFullGameBody(record,{...field,scope:normalized},index,clock);
              if (body) {
                fullGameBodyPeriods[body.period]=(fullGameBodyPeriods[body.period]||0)+1;
                fullGameBodyGames.add(JSON.stringify([body.playerId,body.eventId]));
              }
            }
            if (result.candidate) {
              const fact = result.candidate;
              reason = 'independent_stat_match';
              independentlyMatched++;
              if (binding) archivedFormulaBindings++;
              facts.add(JSON.stringify([fact.playerId, fact.eventId, fact.market, fact.value]));
              rows.push({player:record.player, market:fact.market, value:fact.value, nativeEventId:fact.eventId,
                sourceDigest:digest, sourceScopeDigest:sha(JSON.stringify([record.detailId, field.metric, field.scope, field.tab, field.window, field.filterSelection, field.value])),
                layoutDigests:[...refs.digests].sort(), nativeDigest:fact.nativeDigest, sourceObservedAt:field.observedAt,
                ...(binding ? {archivedFormulaBinding:binding} : {}),
                retrospectiveOnly:true, modelApproved:false});
            }
          }
        }
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
      return {summary:{originalGaps:gaps.length,reconstructedHeaders:reconstructed,independentlyMatched,
        distinctMatchedFacts:facts.size,archivedFormulaBindings,reasons,
        periodRouteFullGameBody:{byRoute:fullGameBodyPeriods,distinctPlayerGames:fullGameBodyGames.size,
          requestedPeriodQualified:false},qualifiedCacheChanged:false,collectionSkipAuthorized:false,modelApproved:false},rows};
    }
  };
}

module.exports = {createLayoutAudit};
