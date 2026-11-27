'use strict';

// Only exact, self-contained profile table rows can support these research receipts.
const sportsbooks = new Set(['draftkings','fanduel','betmgm','caesars','pinnacle','bet365','espnbet','fanatics','betrivers','hardrockbet','betonline','bovada','fliff','betfair','novig']);
const workloadHeaders = new Set(['Reb Chances','D-Reb Chances','O-Reb Chances','Potential Asts','Passes']);
const availability = new Set(['out','doubtful','questionable','probable','available']);
const depthHeader = ' | Starter | 2nd | 3rd | 4th | 5th';
const depthBadges = new Set(['OUT','Q','DOUBT','PROB']);
const decimal = /^\d+(?:\.\d+)?$/;
const {noVigHigher}=require('./pickfinder-quote-features.cjs');
function rowCells(field) {
  if (!/^row [1-9]\d*$/.test(field.metric) || typeof field.value !== 'string') return null;
  let cells;
  try { cells = JSON.parse(field.value); } catch { return null; }
  const headers = (field.scope || '').split(' | ');
  if (field.tab === 'Injuries' && field.scope === depthHeader) headers[0] = 'Position';
  if (!Array.isArray(cells) || cells.length !== headers.length || headers.some(h => !h) ||
      new Set(headers).size !== headers.length || cells.some(c => !c || !Array.isArray(c.labels))) return null;
  return Object.fromEntries(headers.map((h,i) => [h,cells[i]]));
}

function explicitMovementClock(stamp, observed) {
  const match=typeof stamp==='string'&&/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(stamp);
  if(!match||match[4]==='-00:00')return null;
  const [,year,month,day,offset]=match;
  const calendar=new Date(year+'-'+month+'-'+day+'T00:00:00Z');
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==year+'-'+month+'-'+day)return null;
  if(/^[+-]14:(?!00)/.test(offset))return null;
  const at=Date.parse(stamp);
  if(!Number.isFinite(at)||at>observed)return null;
  return {movementAtUtc:new Date(at).toISOString(),sourceMovementDateTime:stamp,movementTimeBasis:'provider_time_element'};
}

function observedBrowserZone(zone) {
  if (typeof zone!=='string' || !/^[A-Za-z][A-Za-z0-9_+\/-]{0,63}$/.test(zone)) return null;
  try { new Intl.DateTimeFormat('en-US',{timeZone:zone}); return zone; } catch { return null; }
}

function parseMovement(f, cells) {
  if (f.origin !== 'line_movement' || f.tab !== 'Line Movement' || f.scope !== 'Line | App | Time') return null;
  const {Line,App,Time} = cells;
  if (Line.labels.length || Time.labels.length || App.labels.length !== 1 || !sportsbooks.has(App.labels[0]) ||
      typeof Line.value !== 'string' || !decimal.test(Line.value) || !Number.isFinite(Number(Line.value)) ||
      typeof Time.value !== 'string' || !/^(?:0?[1-9]|1[012])\/(?:0?[1-9]|[12]\d|3[01]) (?:0?[1-9]|1[012]):[0-5]\d ?[AP]M$/.test(Time.value)) return null;
  const prices = {};
  for (const token of String(App.value).split('\n')) {
    const match = /^([OU])([+-]\d{3,4})$/.exec(token);
    if (!match || Math.abs(Number(match[2])) < 100 || Object.hasOwn(prices,match[1])) return null;
    prices[match[1]] = match[2];
  }
  const at=explicitMovementClock(Time.sourceMovementDateTime,Date.parse(f.observedAt));
  const zone=observedBrowserZone(Time.browserTimeZone);
  return {book:App.labels[0],quoteLine:Number(Line.value),higher:prices.O || null,lower:prices.U || null,
    displayedMovementClock:Time.value,movementAtUtc:null,...(zone?{browserTimeZone:zone}:{}),...at};
}

const currentRouteAliases=Object.freeze({val:'valorant',cbb:'college-basketball',cfb:'college-football'});
const pickemTiers=new Set(['standard','goblin','demon','alternate']);
function parseCurrentPickEmMovement(f,cells){
 if(f.origin!=='line_movement'||f.tab!=='Line Movement'||f.scope!=='Line | App | Time')return null;
 const {Line,App,Time}=cells;
 const [book,badge]=App.labels;
 if(!['prizepicks','underdog'].includes(book)||App.labels.length>2||
    (badge&&!pickemTiers.has(badge))||Line.labels.length||Time.labels.length||
    typeof Line.value!=='string'||!decimal.test(Line.value)||!Number.isFinite(Number(Line.value))||
    typeof Time.value!=='string'||!/^(?:0?[1-9]|1[012])\/(?:0?[1-9]|[12]\d|3[01]) (?:0?[1-9]|1[012]):[0-5]\d ?[AP]M$/.test(Time.value))return null;
 const prices=new Map();
 if(App.value!==null){
  if(typeof App.value!=='string')return null;
  for(const token of App.value.split('\n')){
   const match=/^([OU])(?:([+-]\d{3,4}))?$/.exec(token);
   if(!match||match[2]&&Math.abs(Number(match[2]))<100||prices.has(match[1]))return null;
   prices.set(match[1],match[2]||null);
  }
 }else if(!badge)return null;
 const zone=observedBrowserZone(Time.browserTimeZone),clock=explicitMovementClock(Time.sourceMovementDateTime,Date.parse(f.observedAt));
 return {book,displayedTier:badge||null,quoteLine:Number(Line.value),higher:prices.get('O')??null,lower:prices.get('U')??null,
  displayedMovementClock:Time.value,movementAtUtc:null,...(zone?{browserTimeZone:zone}:{}),...clock,
  originalPlatformVerified:false,openingOrClosingVerified:false};
}
function profileMarketEvidence(record, field, digest, archiveAt, clock) {
  const depth = field.tab === 'Injuries' && field.scope === depthHeader;
  const defense = field.tab === 'Defense' && field.scope === 'STAT | SZN | L10 | L5 | STRENGTH';
  if (field.origin !== 'line_movement' && !(record.sport === 'nba' && field.origin === 'profile' &&
      (depth || defense || ['Player overview','Injuries'].includes(field.tab) && field.scope?.startsWith('Player | ')))) return [];
  const observed = Date.parse(field.observedAt), archived = Date.parse(archiveAt), cutoff = Date.parse(clock);
  if (![observed,archived,cutoff].every(Number.isFinite) || observed > cutoff || archived > cutoff ||
      observed > archived + 999 || !/^[0-9a-f]{64}$/.test(digest) || record.status !== 'sampled') return [];
  let detail;
  try { detail = new URL(record.detailId,'https://www.pickfinder.app'); } catch { return []; }
  const prop = detail.searchParams.getAll('prop'),route=detail.pathname.split('/')[2];
  const current=Number.isFinite(Date.parse(record.currentProfileAttemptedAt))&&Date.parse(record.currentProfileAttemptedAt)<=archived+999;
  if (detail.origin !== 'https://www.pickfinder.app' || !record.sport || !record.market || !record.eventId ||
      !record.player || !/^\/players\/[\w-]+\/[\w-]+$/.test(detail.pathname) ||
      (route!==record.sport&&(!current||currentRouteAliases[route]!==record.sport)) || prop.length !== 1 || prop[0].split(':').length !== 4 || prop[0].split(':')[1] !== record.market ||
      prop[0].split(':')[2] !== record.eventId) return [];
  const cells = rowCells(field);
  if (!cells) return [];
  const base = {sport:record.sport,player:record.player,eventId:record.eventId,market:record.market,detailId:record.detailId,
    period:record.period??null,mapRange:record.mapRange??null,gameMode:record.gameMode??null,
    observedAt:field.observedAt,archiveAt,profileDigest:digest,originalPlatformVerified:false,modelApproved:false};
  const movement = parseMovement(field,cells);
  if (movement) return [{...base,kind:'historical_sportsbook_quote',...movement}];
  const pickem=current?parseCurrentPickEmMovement(field,cells):null;
  if(pickem)return [{...base,kind:'current_displayed_pickem_movement',...pickem}];
  const context = {...base,tab:field.tab,window:field.window??null,filterSelection:field.filterSelection??null,
    fieldPeriod:field.period??null,fieldMapRange:field.mapRange??null,fieldGameMode:field.gameMode??null};
  if (depth && field.origin === 'profile') {
    if (!['PG','SG','SF','PF','C'].includes(cells.Position.value) || cells.Position.labels.length) return [];
    const matches = Object.entries(cells).filter(([,cell])=>cell.labels.includes(record.player));
    if (matches.length !== 1) return [];
    const [slot,cell] = matches[0];
    if (cell.labels.length !== 1 || typeof cell.value !== 'string') return [];
    const [display,badge,...extra] = cell.value.split('\n');
    const abbreviated = record.player.replace(/^(\S)\S* /u,'$1. ');
    if (extra.length || ![record.player,abbreviated].includes(display) || !depthBadges.has(badge)) return [];
    return [{...context,kind:'availability',metric:'depth_chart_badge',value:badge,normalizedStatus:badge==='OUT'?'out':null,
      depthPosition:cells.Position.value,depthSlot:slot,independentInjuryVerified:false}];
  }
  if (defense && field.origin === 'profile') {
    const stat = /^(Pts|Asts|Rebs|RA|PR|PA|PRA|Blks|Stls|3PM|PF|TO)\n(\d+(?:\.\d+)?) allowed\/g$/.exec(cells.STAT.value);
    if (!stat || !['TOUGH','SOLID','WEAK','AVERAGE','NEUTRAL'].includes(cells.STRENGTH.value)) return [];
    const ranks = {};
    for (const period of ['SZN','L10','L5']) {
      const rank = /^(\d{1,2})(st|nd|rd|th)$/.exec(cells[period].value);
      if (!rank) return [];
      const n = Number(rank[1]);
      const suffix = n >= 11 && n <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n%10] || 'th');
      if (n < 1 || n > 30 || rank[2] !== suffix) return [];
      ranks[period] = n;
    }
    return [{...context,kind:'defense_splits',metric:stat[1],displayedAllowedPerGame:Number(stat[2]),
      displayedRanks:ranks,displayedStrength:cells.STRENGTH.value,defendingTeamVerified:false,positionFilterVerified:false}];
  }
  if (field.origin !== 'profile' || !cells.Player || cells.Player.labels.length !== 1 ||
      cells.Player.labels[0] !== record.player) return [];
  if (field.tab === 'Injuries' && typeof cells.Status?.value === 'string' && availability.has(cells.Status.value.toLowerCase())) {
    return [{...context,kind:'availability',metric:'Status',value:cells.Status.value.toLowerCase()}];
  }
  if (field.tab !== 'Player overview') return [];
  return Object.entries(cells).filter(([name,c]) => workloadHeaders.has(name) && typeof c.value === 'string' &&
    decimal.test(c.value) && Number.isFinite(Number(c.value))).map(([metric,c]) => ({...context,kind:'workload',metric,value:Number(c.value)}));
}

function summarize(receipts) {
  const counts = {historicalRows:0,explicitMovementUtcRows:0,browserTimezoneRows:0,pairedRows:0,workloadObservations:0,availabilityObservations:0,defenseSplitObservations:0,byBook:{},currentPickEmMovement:{rows:0,exactDisplayedTierRows:0,unpricedRows:0,sourceClockRows:0,byBook:{}}};
  const groups = new Map();
  for (const row of receipts) {
    if (row.kind === 'workload') counts.workloadObservations++;
    else if (row.kind === 'availability') counts.availabilityObservations++;
    else if (row.kind === 'defense_splits') counts.defenseSplitObservations++;
    else if(row.kind==='current_displayed_pickem_movement'){
      const c=counts.currentPickEmMovement;c.rows++;if(row.displayedTier)c.exactDisplayedTierRows++;
      if(!row.higher&&!row.lower)c.unpricedRows++;if(row.movementTimeBasis==='provider_time_element')c.sourceClockRows++;
      c.byBook[row.book]=(c.byBook[row.book]||0)+1;
    }else {
      counts.historicalRows++;
      const utc=explicitMovementClock(row.sourceMovementDateTime,Date.parse(row.observedAt));
      const zoned=row.movementTimeBasis==='provider_time_element' && utc && utc.movementAtUtc===row.movementAtUtc;
      if (zoned) counts.explicitMovementUtcRows++;
      if (observedBrowserZone(row.browserTimeZone)) counts.browserTimezoneRows++;
      const key = JSON.stringify([row.sport,row.eventId,row.detailId.split('?')[0],row.market,row.period,row.mapRange,
        row.gameMode,row.book,row.quoteLine,zoned?['explicit',row.movementAtUtc]:['unzoned',row.displayedMovementClock]]);
      const group = groups.get(key) || {higher:new Set(),lower:new Set(),paired:false,zoned,book:row.book};
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
  const pairs=distinct.filter(g=>g.paired && g.higher.size===1 && g.lower.size===1);
  counts.distinctUnconflictedPairedGroups = pairs.length;
  counts.unzonedPairedGroups=pairs.filter(g=>!g.zoned).length;
  // A price is eligible for a probability only from one exact two-sided row
  // at a source-supplied instant. Later captures cannot supply a missing side.
  counts.offsetBoundNoVigPairedGroups=0;
  for(const g of pairs)if(g.zoned&&noVigHigher([...g.higher][0],[...g.lower][0])!==null){
    counts.offsetBoundNoVigPairedGroups++;
    const b=counts.byBook[g.book];b.offsetBoundNoVigPairs=(b.offsetBoundNoVigPairs||0)+1;
  }
  return counts;
}
module.exports = {profileMarketEvidence,summarize};
