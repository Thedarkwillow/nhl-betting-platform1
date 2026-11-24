"use strict";
// Separate private fresh-source preview. Never used by full-game champion,
// public rankings, prospective hit-rate registry or lineup optimizer.
const {FIELDS,PERIODS,reconcile}=require("./nfl-dedicated-period-lab.cjs");
const {indexWeekly,idName,matchPriorKickerRoster}=require("./nfl-partner-board-research.cjs");
const {officialKickoffMatches}=require("./nfl-independent-source-preview.cjs");
const {classifyMarket}=require("./nfl-market-registry.cjs");
const num=x=>typeof x==="number"&&Number.isFinite(x),dt=x=>typeof x==="string"?Date.parse(x):NaN,mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function probability(values,line,{signed=false}={}){
 if(!Array.isArray(values)||values.length<8||!values.every(Number.isInteger)||!num(line))return null;
 const mu=.65*mean(values.slice(-5))+.35*mean(values),center=mean(values),a={higher:1,lower:1,push:Number(Number.isInteger(line))};
 for(const x of values){const z=Math.round(x-center+mu),v=signed?z:Math.max(0,z);a[v>line?"higher":v<line?"lower":"push"]++;}
 const total=a.higher+a.lower+a.push;
 return {projection:mu,probabilities:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v/total])),historicalGames:values.length};
}
function preview({board,weeklyRows,schedule,events,allSchedule,kickers=[],kickerRosters=[],now}){
 const t=dt(now),a=dt(board?.boardAsOfAt);
 if(board?.provider!=="partner-api.prizepicks.com"||board?.sourceStatus!=="fresh"||board.completePagination!==true||!Number.isFinite(t)||!Number.isFinite(a)||a>t||t-a>1800000)throw Error("Fresh complete source required");
 const offers=board.periodResearchRows||[],excluded={},rows=[],skip=k=>excluded[k]=(excluded[k]||0)+1;
 if(!offers.length)return {kind:"nfl_explicit_period_private_preview_v1",status:"no_explicit_period_source_rows",rows,excluded,calibrated:false,autoPickEligible:false};
 const hist=reconcile({events,weekly:weeklyRows,schedule:allSchedule,kickers}).rows,idx=new Map(),seen=new Set();
 for(const p of offers){
  const market=classifyMarket("prizepicks",p.market,{period:p.period}),m=market.marketId,s=FIELDS[m],game=officialKickoffMatches(p,schedule);
  if(!s||!PERIODS[market.period]||market.status!=="recognized_research_only"||market.comboValidationNeeded){skip("unsupported_market_or_exact_period");continue;}
  if(!game||dt(p.eventStartsAt)-t<900000||dt(p.capturedAt)!==a||!num(p.line)||!["Higher","Lower"].includes(p.side)||!["Standard","Goblin","Demon"].includes(p.tier)||(p.tier!=="Standard"&&p.side!=="Higher")){skip("invalid_offer_identity_or_clock");continue;}
  const k=game.season+"|"+game.week;if(!idx.has(k))idx.set(k,indexWeekly(weeklyRows,game.season,game.week));
  const matches=s.usage==="kicker_appearance"?matchPriorKickerRoster(kickerRosters,p,game.season,game.week):idx.get(k).filter(x=>x.latest?.team===p.team&&x.latest.name===idName(p.player));
  if(matches.length!==1){skip("unresolved_player_identity");continue;}
  const id=matches[0].id,key=JSON.stringify([game.gameId,id,m,market.period,p.line,p.tier,p.side]);
  if(seen.has(key)){skip("duplicate_offer");continue;}seen.add(key);
  const past=hist.filter(x=>x.player===id&&x.team===p.team&&x.periods[m]&&(x.season<game.season||x.season===game.season&&x.week<game.week)).sort((x,y)=>x.season-y.season||x.week-y.week).slice(-20);
  if(past.length<8||mean(past.slice(-5).map(x=>x.full[m].usage))<s.min){skip("insufficient_prior_period_role_history");continue;}
  const f=probability(past.map(x=>x.periods[m][market.period]),p.line,{signed:/yards/.test(m)});
  if(!f)continue;
  rows.push({gameId:game.gameId,playerId:id,market:m,period:market.period,line:p.line,tier:p.tier,side:p.side,capturedAt:p.capturedAt,eventStartsAt:p.eventStartsAt,sourceProjectionId:p.projectionId,...f,estimatedProbability:f.probabilities[p.side.toLowerCase()],researchOnly:true,calibrated:false,autoPickEligible:false});
 }
 return {kind:"nfl_explicit_period_private_preview_v1",status:rows.length?"private_uncalibrated_period_research":"no_eligible_exact_period_matches",generatedAt:now,sourceBoardAt:board.boardAsOfAt,rows,excluded,calibrated:false,autoPickEligible:false,originalPlatformSettlementVerified:false,originalPregameGitFreezeRequired:true};
}
module.exports={probability,preview};
