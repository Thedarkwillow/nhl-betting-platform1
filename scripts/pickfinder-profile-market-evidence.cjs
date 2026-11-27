'use strict';

// Only exact, self-contained profile table rows can support these research receipts.
const sportsbooks = new Set(['draftkings','fanduel','betmgm','caesars','pinnacle','bet365','espnbet','fanatics','betrivers','hardrockbet','betonline','bovada','fliff','betfair']);
const workloadHeaders = new Set(['Reb Chances','D-Reb Chances','O-Reb Chances','Potential Asts','Passes']);
const availability = new Set(['out','doubtful','questionable','probable','available']);
const decimal = /^\d+(?:\.\d+)?$/;
function rowCells(field) {
  if (!/^row [1-9]\d*$/.test(field.metric) || typeof field.value !== 'string') return null;
  let cells;
  try { cells = JSON.parse(field.value); } catch { return null; }
  const headers = (field.scope || '').split(' | ');
  if (!Array.isArray(cells) || cells.length !== headers.length || headers.some(h => !h) ||
      new Set(headers).size !== headers.length || cells.some(c => !c || !Array.isArray(c.labels))) return null;
  return Object.fromEntries(headers.map((h,i) => [h,cells[i]]));
}

function parseMovement(f, cells) {
  if (f.origin !== 'line_movement' || f.tab !== 'Line Movement' || f.scope !== 'Line | App | Time') return null;
  const {Line,App,Time} = cells;
  if (Line.labels.length || Time.labels.length || App.labels.length !== 1 || !sportsbooks.has(App.labels[0]) ||
      typeof Line.value !== 'string' || !decimal.test(Line.value) || !Number.isFinite(Number(Line.value)) ||
      typeof Time.value !== 'string' || !/^(?:0?[1-9]|1[012])\/(?:0?[1-9]|[12]\d|3[01]) (?:0?[1-9]|1[012]):[0-5]\d[AP]M$/.test(Time.value)) return null;
  const prices = {};
  for (const token of String(App.value).split('\n')) {
    const match = /^([OU])([+-]\d{3,4})$/.exec(token);
    if (!match || Math.abs(Number(match[2])) < 100 || Object.hasOwn(prices,match[1])) return null;
    prices[match[1]] = match[2];
  }
  return {book:App.labels[0],quoteLine:Number(Line.value),higher:prices.O || null,lower:prices.U || null,
    displayedMovementClock:Time.value,movementAtUtc:null};
}

function profileMarketEvidence(record, field, digest, archiveAt, clock) {
  if (field.origin !== 'line_movement' && !(record.sport === 'nba' && field.origin === 'profile' &&
      ['Player overview','Injuries'].includes(field.tab) && field.scope?.startsWith('Player | '))) return [];
  const observed = Date.parse(field.observedAt), archived = Date.parse(archiveAt), cutoff = Date.parse(clock);
  if (![observed,archived,cutoff].every(Number.isFinite) || observed > cutoff || archived > cutoff ||
      observed > archived + 999 || !/^[0-9a-f]{64}$/.test(digest) || record.status !== 'sampled') return [];
  let detail;
  try { detail = new URL(record.detailId,'https://www.pickfinder.app'); } catch { return []; }
  const prop = detail.searchParams.getAll('prop');
  if (detail.origin !== 'https://www.pickfinder.app' || !record.sport || !record.market || !record.eventId ||
      !record.player || !/^\/players\/[\w-]+\/[\w-]+$/.test(detail.pathname) ||
      detail.pathname.split('/')[2] !== record.sport || prop.length !== 1 || prop[0].split(':').length !== 4 || prop[0].split(':')[1] !== record.market ||
      prop[0].split(':')[2] !== record.eventId) return [];
  const cells = rowCells(field);
  if (!cells) return [];
  const base = {sport:record.sport,player:record.player,eventId:record.eventId,market:record.market,detailId:record.detailId,
    period:record.period??null,mapRange:record.mapRange??null,gameMode:record.gameMode??null,
    observedAt:field.observedAt,archiveAt,profileDigest:digest,originalPlatformVerified:false,modelApproved:false};
  const movement = parseMovement(field,cells);
  if (movement) return [{...base,kind:'historical_sportsbook_quote',...movement}];
  if (field.origin !== 'profile' || !cells.Player || cells.Player.labels.length !== 1 ||
      cells.Player.labels[0] !== record.player) return [];
  const context = {...base,tab:field.tab,window:field.window??null,filterSelection:field.filterSelection??null,
    fieldPeriod:field.period??null,fieldMapRange:field.mapRange??null,fieldGameMode:field.gameMode??null};
  if (field.tab === 'Injuries' && typeof cells.Status?.value === 'string' && availability.has(cells.Status.value.toLowerCase())) {
    return [{...context,kind:'availability',metric:'Status',value:cells.Status.value.toLowerCase()}];
  }
  if (field.tab !== 'Player overview') return [];
  return Object.entries(cells).filter(([name,c]) => workloadHeaders.has(name) && typeof c.value === 'string' &&
    decimal.test(c.value) && Number.isFinite(Number(c.value))).map(([metric,c]) => ({...context,kind:'workload',metric,value:Number(c.value)}));
}

function summarize(receipts) {
  const counts = {historicalRows:0,pairedRows:0,workloadObservations:0,availabilityObservations:0,byBook:{}};
  const groups = new Map();
  for (const row of receipts) {
    if (row.kind === 'workload') counts.workloadObservations++;
    else if (row.kind === 'availability') counts.availabilityObservations++;
    else {
      counts.historicalRows++;
      const key = JSON.stringify([row.sport,row.eventId,row.detailId.split('?')[0],row.market,row.period,row.mapRange,
        row.gameMode,row.book,row.quoteLine,row.displayedMovementClock]);
      const group = groups.get(key) || {higher:new Set(),lower:new Set(),paired:false};
      if (row.higher) group.higher.add(row.higher);
      if (row.lower) group.lower.add(row.lower);
      if (row.higher && row.lower) group.paired = true;
      groups.set(key,group);
      const b = counts.byBook[row.book] ??= {rows:0,paired:0};
      b.rows++;
      if (row.higher && row.lower) { counts.pairedRows++; b.paired++; }
    }
  }
  const distinct = [...groups.values()];
  counts.conflictingMovementGroups = distinct.filter(g=>g.higher.size>1 || g.lower.size>1).length;
  counts.distinctUnconflictedPairedGroups = distinct.filter(g=>g.paired && g.higher.size===1 && g.lower.size===1).length;
  return counts;
}
module.exports = {profileMarketEvidence,summarize};
