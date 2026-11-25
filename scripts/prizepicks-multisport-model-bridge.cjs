'use strict';
// Offline restricted API-to-existing-model adapters. Context must come from independently
// reviewed, pregame source receipts; this module does not create or authenticate them.
const nhl=require('../src/projections.cjs');
const {estimateCountProbabilities}=require('../src/prop-probabilities.cjs');
const nfl=require('./backtest-nfl-historical-stats.cjs');
const esports=require('../src/esports-research-v1.cjs');
const {verifiedMap}=require('./esports-prospective-archive.cjs');
const {quotes}=require('./pickfinder-public-evidence-audit.cjs');
const dt=Date.parse, hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x), rev=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fresh=(x,t,ms)=>Number.isFinite(dt(x))&&dt(x)<=t&&t-dt(x)<=ms;
const norm=x=>typeof x==='string'?x.trim().toLowerCase():'';
const sports=new Set(['NHL','NFL',...Object.keys(esports.TITLES)]);
const nhlMarkets={'shots on goal':'shotsOnGoal','goals':'goals','assists':'assists','points':'points','blocked shots':'blockedShots','goalie saves':'saves','saves':'saves'};
const nflMarkets={'pass yards':'passing_yards','passing yards':'passing_yards','pass attempts':'passing_attempts','passing attempts':'passing_attempts','pass completions':'passing_completions','passing completions':'passing_completions','pass tds':'passing_touchdowns','passing tds':'passing_touchdowns','interceptions thrown':'interceptions_thrown','rush yards':'rushing_yards','rushing yards':'rushing_yards','rush attempts':'rushing_attempts','rushing attempts':'rushing_attempts','receiving yards':'receiving_yards','rec yards':'receiving_yards','receptions':'receptions','targets':'receiving_targets','rec targets':'receiving_targets','field goals made':'fg_made','field goals attempted':'fg_attempts','extra points made':'pat_made','kicking points':'kicking_points'};
const esportsMarkets={'kills':'kills','headshots':'headshotKills','headshot kills':'headshotKills','assists':'assists','deaths':'deaths','kills + assists':'killsPlusAssists','creep score':'creepScore','last hits':'lastHits'};
const full=x=>['full game','full_game','full','game'].includes(norm(x));
function mapPeriod(x){const m=/^maps?\s+([1-7])(?:\s*[-–]\s*([1-7]))?$/i.exec(String(x||'').trim());if(!m)return null;const a=+m[1],b=+(m[2]||m[1]);return a<=b?Array.from({length:b-a+1},(_,i)=>a+i):null;}
function match(row,ctx,clock){
 const at=dt(clock);
 if(!ctx||!rev(ctx.revision)||!fresh(ctx.preparedAt,at,3600000)||!Array.isArray(ctx.scopes)||!ctx.archive||!Array.isArray(ctx.archive.invalid)||ctx.archive.invalid.length||!Array.isArray(ctx.archive.latest))return null;
 const a=ctx.scopes.filter(s=>s.sport===row.sport&&norm(s.name)===norm(row.player)&&norm(s.team)===norm(row.team)&&norm(s.opponent)===norm(row.opponent)&&dt(s.startAt)===dt(row.startsAt)&&s.playerId&&s.gameId&&s.identityReviewed===true&&s.eventReviewed===true&&s.rosterReviewed===true&&hash(s.receiptDigest)&&rev(s.receiptCommit)&&fresh(s.observedAt,at,86400000)&&Number.isFinite(dt(s.firstGitAt))&&dt(s.observedAt)<=dt(s.firstGitAt)+999&&dt(s.firstGitAt)<=dt(row.observedAt)&&dt(s.firstGitAt)+900000<dt(s.startAt)&&Array.isArray(s.historyDigests)&&s.historyDigests.length&&s.historyDigests.every(hash));
 return a.length===1?a[0]:null;
}
function crosscheck(row,side,tier,s,archive,clock){
 const at=dt(clock),p=s.pickfinder;
 if(!p||!p.detailId||!p.eventId||!p.market||!p.player||p.reviewed!==true||norm(p.apiStat)!==norm(row.stat)||norm(p.apiPeriod)!==norm(row.period))return {pickfinderCorroborated:false,matchedSportsbooks:0,marketBenchmark:null};
 const a=archive.latest.filter(b=>b.m.sport===row.sport.toLowerCase()&&b.m.book==='prizepicks'&&dt(b.first)<=at).flatMap(b=>(b.offers||[]).filter(o=>o.book==='prizepicks'&&o.detailId===p.detailId&&o.eventId===p.eventId&&o.player===p.player&&o.market===p.market&&(o.period??null)===(p.period??null)&&(o.mapRange??null)===(p.mapRange??null)&&(o.gameMode??null)===(p.gameMode??null)&&o.line===row.line&&o.side===side&&o.tier===tier&&dt(o.startAt)===dt(row.startsAt)&&fresh(o.observedAt,at,300000)&&Math.abs(dt(o.observedAt)-dt(row.observedAt))<=300000).map(o=>({o,b})));
 const q=a.length===1?quotes(a[0].o,a[0].b.sportsbookQuotes||[],clock):[];
 return {pickfinderCorroborated:a.length===1,matchedSportsbooks:q.length,marketBenchmark:q.length?q.reduce((n,x)=>n+(side==='Higher'?x.higher:1-x.higher),0)/q.length:null};
}
function project(row,s,clock){
 const cut=dt(row.observedAt);
 if(row.sport==='NHL'){
  const metric=nhlMarkets[norm(row.stat)];if(!metric||!full(row.period)||!s.history||s.history.playerId!==s.playerId||norm(s.history.team)!==norm(s.team)||norm(s.history.name)!==norm(s.name)||!Array.isArray(s.history.games)||!['skater','goalie'].includes(s.history.type))return null;
  // A goalie needs independently reviewed pregame starter status.
  if(metric==='saves'&&s.starterVerified!==true)return null;
  const games=s.history.games.filter(g=>g.finalVerified===true&&Number.isFinite(dt(g.knownAt))&&dt(g.knownAt)<=cut&&/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate)&&g.gameDate<row.observedAt.slice(0,10)&&Number.isInteger(g.gameId)&&Number.isFinite(g[metric])&&g[metric]>=0);
  if(new Set(games.map(g=>g.gameId)).size!==games.length)return null;
  const p=nhl.projectPlayer({...s.history,games}).projections[metric];
  if(!p?.ready||!Number.isFinite(p.estimate))return null;
  const probs=estimateCountProbabilities(p.estimate,row.line);return probs?{metric,projection:p.estimate,probabilities:probs,prior:p.observations,method:'weighted-form-v1/poisson-v0'}:null;
 }
 if(row.sport==='NFL'){
  const metric=nflMarkets[norm(row.stat)];if(!metric||!full(row.period)||!Number.isInteger(s.season)||!Number.isInteger(s.week)||s.week<1||s.week>18||!Array.isArray(s.history))return null;
  const identity=(['fg_made','fg_attempts','pat_made','kicking_points'].includes(metric)?'kicker:':'player:')+s.playerId;
  const eligible=s.history.filter(g=>g.identity===identity&&g.finalVerified===true&&Number.isFinite(dt(g.knownAt))&&dt(g.knownAt)<=cut&&Number.isInteger(g.year)&&Number.isInteger(g.week)&&(g.year<s.season||g.year===s.season&&g.week<s.week)).sort((a,b)=>a.year-b.year||a.week-b.week);
  if(new Set(eligible.map(g=>g.year+'|'+g.week)).size!==eligible.length)return null;
  const histories=new Map();for(const g of eligible)for(const [m,v] of Object.entries(g.measures||{}))if(Number.isFinite(v)){const k=identity+'|'+m;const a=histories.get(k)||[];a.push(v);histories.set(k,a);}
  const a=histories.get(identity+'|'+metric)||[];if(a.length<5||!nfl.isRoleEligible({identity,position:s.position},metric,histories)||identity.startsWith('kicker:')&&s.kickerParticipationVerified!==true)return null;
  const p=nfl.forecast(a);return p?{metric,projection:p.shrunk_last5,probabilities:null,prior:a.length,method:'shrunk_last5'}:null;
 }
 const metric=esportsMarkets[norm(row.stat)],maps=mapPeriod(row.period);
 if(!metric||!maps||JSON.stringify(maps)!==JSON.stringify(s.maps)||s.scopeReviewed!==true||!s.ruleset||!s.ruleVersion||!Array.isArray(s.history))return null;
 const offered=Object.entries(row.selections||{}).filter(([side,v])=>v.available===true&&['Higher','Lower'].includes(side)).map(([side])=>side);
 const o={title:row.sport,platform:'PrizePicks',offerId:row.providerOfferId,playerId:String(s.playerId),teamId:s.teamId,opponentId:s.opponentId,seriesId:String(s.gameId),ruleset:s.ruleset,ruleVersion:s.ruleVersion,sourceId:'independent-provider',sourceUrl:'https://prizepicksapi.com/',tier:'Unknown',market:metric,maps,line:row.line,sides:offered,capturedAt:row.observedAt,seriesStartAt:row.startsAt,identityVerified:true,scopeVerified:true,edition:s.edition,mode:s.mode};
 const verified=s.history.filter(g=>verifiedMap(g)&&hash(g.archiveDigest)&&s.historyDigests.includes(g.archiveDigest)&&Number.isFinite(dt(g.archiveFirstGitAt))&&dt(g.archiveFirstGitAt)<=cut);
 const p=esports.predict(o,esports.uniqueMaps(verified).rows);
 return p.status==='research_only'?{metric,projection:p.projection,probabilities:p.baseline,prior:p.priorSeries,method:'esports-research-v1'}:null;
}
function evaluateOther(rows,ctx,clock){
 const at=dt(clock),predictions=[],excluded={},seen=new Set();
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const row of rows){
  if(!sports.has(row?.sport)){reject('sport_adapter_not_connected');continue;}
  if(row.provider!=='PrizePicksAPI'||row.productionEligible!==false||row.originalAppAvailabilityVerified!==false){reject('invalid_provider_provenance');continue;}
  if(!fresh(row.receivedAt,at,900000)||!fresh(row.observedAt,at,900000)||dt(row.observedAt)>dt(row.receivedAt)||!Number.isFinite(dt(row.startsAt))||dt(row.startsAt)<=at+900000||!row.providerOfferId||!row.player||!row.team||!row.opponent||!Number.isFinite(row.line)||row.line<0){reject('freshness_or_scope');continue;}
  const s=match(row,ctx,clock);if(!s){reject('unverified_player_event_or_history_context');continue;}
  const p=project(row,s,clock);if(!p){reject('unsupported_scope_or_insufficient_history');continue;}
  for(const [side,v] of Object.entries(row.selections||{})){
   if(!['Higher','Lower'].includes(side)||v?.available!==true||!['standard','goblin','demon'].includes(v.tier)||side==='Lower'&&v.tier!=='standard')continue;
   const key=JSON.stringify([row.sport,s.playerId,s.gameId,p.metric,row.period,row.line,side,v.tier]);if(seen.has(key)){reject('duplicate_direction');continue;}seen.add(key);
   const q=p.probabilities,den=q?q.higher+q.lower:0;
   predictions.push({sport:row.sport,nativePlayerId:s.playerId,nativeGameId:s.gameId,player:row.player,market:p.metric,period:row.period,line:row.line,side,tier:v.tier,projection:p.projection,rawConditionalEstimate:den>0?q[side.toLowerCase()]/den:null,pushEstimate:q?.push??null,priorObservations:p.prior,method:p.method,forecastAt:clock,sourceObservedAt:row.observedAt,gameStartAt:row.startsAt,modelRevision:ctx.revision,identityEvidenceSha256:s.receiptDigest,historyDigests:s.historyDigests,providerOfferId:row.providerOfferId,originalPlatformVerified:false,calibrated:false,expectedValue:null,modelApproved:false,restricted:true,...crosscheck(row,side,v.tier,s,ctx.archive,clock)});
  }
 }
 return {predictions,excluded};
}
module.exports={evaluateOther,mapPeriod,crosscheck};
