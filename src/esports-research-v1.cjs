"use strict";
// Private offline research. Never treats a reference quote as a bookable offer.
const TITLES={
 CS2:{unit:"rounds",stats:["kills","headshotKills","assists","deaths","killsPlusAssists"]},
 VALORANT:{unit:"rounds",stats:["kills","headshotKills","assists","deaths","killsPlusAssists"]},
 LOL:{unit:"minutes",stats:["kills","assists","deaths","killsPlusAssists","creepScore"]},
 DOTA2:{unit:"minutes",stats:["kills","assists","deaths","killsPlusAssists","lastHits"]},
 COD:{unit:"minutes",stats:["kills","assists","deaths","killsPlusAssists"]}
};
const at=x=>typeof x==="string"&&/(Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const id=x=>typeof x==="string"&&x.trim()!==""&&x.length<200;
const cnt=x=>Number.isSafeInteger(x)&&x>=0;
const positive=x=>Number.isFinite(x)&&x>0;
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
function stat(row,market){
 const s=row.stats||{};
 if(market==="killsPlusAssists")return cnt(s.kills)&&cnt(s.assists)?s.kills+s.assists:null;
 return cnt(s[market])?s[market]:null;
}
function validMap(r){
 return !!(TITLES[r?.title]&&[r.playerId,r.teamId,r.opponentId,r.seriesId,r.mapId,r.sourceId,r.sourceUrl,r.ruleset].every(id)
 &&r.teamId!==r.opponentId&&Number.isInteger(r.mapIndex)&&r.mapIndex>=1&&r.mapIndex<=7
 &&r.final===true&&r.participationVerified===true&&r.professional===true&&r.identityVerified===true
 &&Number.isFinite(at(r.startAt))&&at(r.startAt)<at(r.endAt)&&at(r.endAt)<=at(r.observedAt)
 &&positive(r.exposure)&&r.exposureUnit===TITLES[r.title].unit
 &&r.stats&&Object.values(r.stats).every(cnt)
 &&(!cnt(r.stats.headshotKills)||(cnt(r.stats.kills)&&r.stats.headshotKills<=r.stats.kills))
 &&(r.title!=="COD"||[r.edition,r.mode].every(id)));
}
function validOffer(o){
 return !!(TITLES[o?.title]?.stats.includes(o.market)&&["PrizePicks","Underdog"].includes(o.platform)
 &&[o.offerId,o.playerId,o.teamId,o.opponentId,o.seriesId,o.ruleset,o.ruleVersion,o.sourceId,o.sourceUrl].every(id)
 &&o.teamId!==o.opponentId&&["Standard","Goblin","Demon","Unknown"].includes(o.tier)
 &&Array.isArray(o.maps)&&o.maps.length&&o.maps.every((x,i)=>Number.isInteger(x)&&x>=1&&x<=7&&(i===0||x>o.maps[i-1]))
 &&Number.isFinite(o.line)&&o.line>=0&&Number.isInteger(o.line*2)
 &&Array.isArray(o.sides)&&o.sides.length&&new Set(o.sides).size===o.sides.length&&o.sides.every(x=>["Higher","Lower"].includes(x))
 &&Number.isFinite(at(o.capturedAt))&&at(o.capturedAt)<at(o.seriesStartAt)
 &&o.identityVerified===true&&o.scopeVerified===true
 &&(o.title!=="COD"||[o.edition,o.mode].every(id)));
}
const mapKey=r=>JSON.stringify([r.title,r.seriesId,r.mapIndex,r.playerId]);
const offerKey=o=>JSON.stringify([o.platform,o.title,o.seriesId,o.playerId,o.market,o.maps,o.line,o.tier,o.ruleset,o.ruleVersion]);
function uniqueMaps(raw){
 const m=new Map(),bad=new Set();let invalid=0;
 for(const r of raw){if(!validMap(r)){invalid++;continue;}const k=mapKey(r);
  if(m.has(k)){bad.add(k);continue;}m.set(k,r);}
 for(const k of bad)m.delete(k);
 return {rows:[...m.values()],invalid,ambiguous:bad.size};
}
function historicalSamples(o,rows){
 const groups=new Map();
 for(const r of rows){
  if(r.title!==o.title||r.playerId!==o.playerId||r.teamId!==o.teamId||r.ruleset!==o.ruleset
   ||r.seriesId===o.seriesId||at(r.observedAt)>at(o.capturedAt)||at(r.endAt)>=at(o.capturedAt)
   ||!o.maps.includes(r.mapIndex)||stat(r,o.market)===null
   ||(o.title==="COD"&&(r.edition!==o.edition||r.mode!==o.mode)))continue;
  if(!groups.has(r.seriesId))groups.set(r.seriesId,[]);groups.get(r.seriesId).push(r);
 }
 return [...groups.values()].filter(a=>a.length===o.maps.length&&new Set(a.map(x=>x.mapIndex)).size===o.maps.length)
 .map(a=>({seriesId:a[0].seriesId,end:Math.max(...a.map(x=>at(x.endAt))),total:a.reduce((s,r)=>s+stat(r,o.market),0),
  exposure:a.reduce((s,r)=>s+r.exposure,0),maps:a})).sort((a,b)=>b.end-a.end).slice(0,40);
}
function probabilities(samples,line){
 if(!samples.length)return null;
 const h=samples.filter(x=>x>line).length,l=samples.filter(x=>x<line).length,p=samples.length-h-l;
 return {higher:h/samples.length,lower:l/samples.length,push:p/samples.length};
}
function predict(o,rows){
 if(!validOffer(o))return {status:"invalid_offer",researchOnly:true};
 const a=historicalSamples(o,rows);
 if(a.length<12)return {status:"insufficient_prior_complete_series",priorSeries:a.length,researchOnly:true};
 const raw=a.map(x=>x.total),rate=a.reduce((s,x)=>s+x.total,0)/a.reduce((s,x)=>s+x.exposure,0);
 // Exposure challenger requires a dated, independently forecast input, never final rounds/minutes.
 const ctx=o.context||{};
 const exposureOK=positive(ctx.expectedExposure)&&ctx.exposureUnit===TITLES[o.title].unit
 &&id(ctx.sourceUrl)&&at(ctx.knownAt)<=at(o.capturedAt)&&ctx.independentPregameForecast===true;
 const exposure=exposureOK?a.map(x=>Math.max(0,Math.round(x.total/x.exposure*ctx.expectedExposure))):null;
 // Context alternatives are exact historical subsets, not invented coefficients.
 const comparable={opponent:a.filter(x=>x.maps.every(r=>r.opponentId===o.opponentId)),
  mapPool:a.filter(x=>Array.isArray(ctx.mapNames)&&ctx.mapNames.length===o.maps.length&&at(ctx.knownAt)<=at(o.capturedAt)&&x.maps.every(r=>r.mapName===ctx.mapNames[o.maps.indexOf(r.mapIndex)])),
  rolePatch:a.filter(x=>[ctx.role,ctx.patch,ctx.rosterId].every(id)&&at(ctx.knownAt)<=at(o.capturedAt)&&x.maps.every(r=>r.role===ctx.role&&r.patch===ctx.patch&&r.rosterId===ctx.rosterId)),
  lanTier:a.filter(x=>typeof ctx.lan==="boolean"&&id(ctx.opponentTier)&&at(ctx.knownAt)<=at(o.capturedAt)&&x.maps.every(r=>r.lan===ctx.lan&&r.opponentTier===ctx.opponentTier))};
 const challengers=Object.fromEntries(Object.entries(comparable).map(([k,v])=>[k,v.length>=12?{n:v.length,projection:avg(v.map(x=>x.total)),probabilities:probabilities(v.map(x=>x.total),o.line)}:null]));
 return {status:"research_only",priorSeries:a.length,projection:avg(raw),ratePerExposure:rate,baseline:probabilities(raw,o.line),
  exposureChallenger:exposure?{n:a.length,projection:rate*ctx.expectedExposure,probabilities:probabilities(exposure,o.line)}:null,
  contextChallengers:challengers,priorSeriesIds:a.map(x=>x.seriesId),calibrated:false,researchOnly:true,bettingEligible:false};
}
function grade(o,rows){
 if(!validOffer(o))return {status:"invalid_offer"};
 const a=rows.filter(r=>r.title===o.title&&r.seriesId===o.seriesId&&r.playerId===o.playerId&&r.teamId===o.teamId
  &&r.opponentId===o.opponentId&&r.ruleset===o.ruleset&&o.maps.includes(r.mapIndex)&&at(r.startAt)>=at(o.seriesStartAt)
  &&(o.title!=="COD"||(r.edition===o.edition&&r.mode===o.mode)));
 if(a.length!==o.maps.length||new Set(a.map(r=>r.mapIndex)).size!==o.maps.length||a.some(r=>stat(r,o.market)===null))
  return {status:"unresolved_missing_map_or_stat"};
 const actual=a.reduce((s,r)=>s+stat(r,o.market),0);
 return {status:"statistical_result_only",actual,outcome:actual>o.line?"Higher":actual<o.line?"Lower":"Push",officialPlatformSettlementVerified:false};
}
function evaluate(rawOffers,rawMaps){
 const {rows,invalid,ambiguous}=uniqueMaps(rawMaps),seen=new Set(),records=[],excluded={invalid:0,duplicate:0,noHistory:0,unresolved:0,push:0};
 for(const o of [...rawOffers].sort((a,b)=>at(a.capturedAt)-at(b.capturedAt))){
  if(!validOffer(o)){excluded.invalid++;continue;}const k=offerKey(o);if(seen.has(k)){excluded.duplicate++;continue;}seen.add(k);
  const p=predict(o,rows),g=grade(o,rows);
  if(p.status!=="research_only"){excluded.noHistory++;continue;}
  if(g.status!=="statistical_result_only"){excluded.unresolved++;continue;}
  if(g.outcome==="Push"){excluded.push++;continue;}
  records.push({offer:o,forecast:p,actual:g.actual,outcome:g.outcome});
 }
 const groups={};
 for(const r of records){
  const o=r.offer,k=JSON.stringify([o.title,o.platform,o.market,o.maps,o.tier,o.ruleset,o.ruleVersion]);
  (groups[k]??=[]).push(r);
 }
 const score=a=>{
  let b=0,ll=0,w=0,n=0,h=0;
  for(const r of a){const p=r.forecast.baseline,y=Number(r.outcome==="Higher"),d=p.higher+p.lower;if(!d)continue;
   const q=p.higher/d; b+=(q-y)**2;ll-=Math.log(Math.max(1e-6,y?q:1-q));n++;h+=y;
   w+=Number((q>.5)===Boolean(y));}
  return {n,wins:w,losses:n-w,hitRate:n?w/n:null,brier:n?b/n:null,logLoss:n?ll/n:null,alwaysHigher:n?h/n:null,alwaysLower:n?1-h/n:null,
   distinctSeries:new Set(a.map(x=>x.offer.seriesId)).size};
 };
 return {kind:"esports_retrospective_exact_scope_v1",mapRows:rows.length,invalidMapRows:invalid,ambiguousMapKeys:ambiguous,excluded,
  byGroup:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,score(a)])),records:records.length,prospective:false,calibrationApproved:false,
  actualPlatformSettlementVerified:false,modelPromoted:false,optimizedLineupsApproved:false};
}
// Official source-shaped fixture import: a single Dota match is not a series ID or map ordinal.
function decodeOpenDota(payload){
 const x=payload?.result||payload;
 if(!Number.isSafeInteger(x?.match_id)||!positive(x.start_time)||!positive(x.duration)||!positive(x.leagueid)
 ||!positive(x.radiant_team_id)||!positive(x.dire_team_id)||!Array.isArray(x.players)||x.players.length!==10)throw Error("invalid professional match");
 const seen=new Set(),slots=new Set();
 return x.players.map(p=>{
  if(!positive(p.account_id)||seen.has(p.account_id)||!cnt(p.player_slot)||slots.has(p.player_slot)||![p.kills,p.deaths,p.assists,p.last_hits].every(cnt))throw Error("invalid player row");
  seen.add(p.account_id);slots.add(p.player_slot);
  const radiant=p.player_slot<128;
  return {title:"DOTA2",provider:"opendota",providerMatchId:String(x.match_id),providerPlayerId:String(p.account_id),teamId:String(radiant?x.radiant_team_id:x.dire_team_id),opponentId:String(radiant?x.dire_team_id:x.radiant_team_id),
   startAt:new Date(x.start_time*1000).toISOString(),endAt:new Date((x.start_time+x.duration)*1000).toISOString(),exposure:x.duration/60,exposureUnit:"minutes",
   stats:{kills:p.kills,deaths:p.deaths,assists:p.assists,lastHits:p.last_hits},heroId:p.hero_id,seriesId:null,mapIndex:null,identityVerified:false,propMatchEligible:false};
 });
}
module.exports={TITLES,validMap,validOffer,uniqueMaps,stat,probabilities,predict,grade,evaluate,decodeOpenDota};
