"use strict";
// Conditional identity matches are benchmark research, not authenticated lines.
// Train blend weights only on prior final-game evidence. Evaluate once on
// chronological later dates, with no outcome/line revision of source frames.
const dt=Date.parse,n=Number.isFinite,{beforeFreeze,sameEvent}=require("./archived-prop-market-benchmark.cjs");
const probability=x=>n(x)&&x>=0&&x<=1;
function compare(rows){
 const valid=rows.filter(r=>r.researchOnly===true&&r.conditionalIdentityOnly===true&&typeof r.gameKey==="string"&&typeof r.market==="string"&&typeof r.key==="string"&&typeof r.date==="string"&&probability(r.stat)&&probability(r.book)&&[0,1].includes(r.actual)&&dt(r.firstGitAt)<dt(r.startAt)-900000&&dt(r.quoteAt)<=dt(r.firstGitAt));
 const seen=new Set(),by={};for(const r of valid.sort((a,b)=>dt(a.firstGitAt)-dt(b.firstGitAt))){if(seen.has(r.key))continue;seen.add(r.key);(by[r.market]??=[]).push(r);}
 const result={};
 for(const [market,a] of Object.entries(by)){const dates=[...new Set(a.map(r=>r.date))].sort(),cut=dates[Math.floor(dates.length*.7)],train=a.filter(r=>r.date<cut),holdout=a.filter(r=>r.date>=cut),games=x=>new Set(x.map(r=>r.gameKey)).size;
  const report={rows:a.length,train:train.length,holdout:holdout.length,trainGames:games(train),holdoutGames:games(holdout),status:"insufficient_matched_evidence"};
  if(dates.length<10||train.length<100||holdout.length<50||games(train)<20||games(holdout)<10||train.some(r=>holdout.some(s=>s.gameKey===r.gameKey))){result[market]=report;continue;}
  const weights=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1],loss=(rs,w)=>rs.reduce((s,r)=>s+(w*r.book+(1-w)*r.stat-r.actual)**2,0)/rs.length;
  const w=weights.sort((x,y)=>loss(train,x)-loss(train,y)||x-y)[0];
  const metrics=w=>({brier:loss(holdout,w),wins:holdout.filter(r=>Number(w*r.book+(1-w)*r.stat>=.5)===r.actual).length,n:holdout.length});
  result[market]={...report,status:"historical_chronological_matched_holdout",cutoff:cut,bookWeight:w,statistical:metrics(0),sportsbook:metrics(1),combined:metrics(w),alwaysHigher:holdout.filter(r=>r.actual===1).length,alwaysLower:holdout.filter(r=>r.actual===0).length,qualifiedForProduction:false};
 }
 return {kind:"conditional_sportsbook_matched_chronological_research_v1",markets:result,matchedRows:seen.size,modelPromoted:false,researchOnly:true,calibrated:false};
}
function lineHistory(archives){
 const by=new Map();let accepted=0;
 for(const a of archives){const d=a.archive,at=dt(d?.generatedAt),commit=dt(a.firstCommittedAt);if(a.gitHistoryCount!==1||!(Math.floor(at/1000)*1000<=commit)||!n(commit))continue;
  accepted++;for(const r of d.rows||[]){if(r.source!=="The Odds API"||!n(r.line)||!r.eventId||!r.book||!r.player||!r.market||r.period!=="full_game"||!(dt(r.marketUpdatedAt)<=dt(r.capturedAt)&&dt(r.capturedAt)<=at&&at<=commit+999&&commit<dt(r.commenceTime)-900000)||!Number.isInteger(r.overOdds)||!Number.isInteger(r.underOdds)||Math.abs(r.overOdds)<100||Math.abs(r.underOdds)<100)continue;
   const k=JSON.stringify([r.sport,r.eventId,r.player,r.market,r.period,r.book]);const arr=by.get(k)||[];arr.push({...r,archiveAt:d.generatedAt});by.set(k,arr);
  }
 }
 const rows=[];for(const [key,a] of by){a.sort((x,y)=>dt(x.capturedAt)-dt(y.capturedAt));const stamps=[...new Set(a.map(x=>x.capturedAt))];if(stamps.some(t=>a.filter(x=>x.capturedAt===t).length!==1))continue;const first=a[0],last=a.at(-1);rows.push({key,firstObservedAt:first.capturedAt,lastObservedAt:last.capturedAt,observations:a.length,firstLine:first.line,lastLine:last.line,lineChange:last.line-first.line,firstOverOdds:first.overOdds,lastOverOdds:last.overOdds,firstUnderOdds:first.underOdds,lastUnderOdds:last.underOdds,minutesBeforeStart:(dt(last.commenceTime)-dt(last.capturedAt))/60000,authenticatedOpening:false,authenticatedClosing:false});}
 return {acceptedArchives:accepted,trackedSeries:rows.length,repeatedSeries:rows.filter(r=>r.observations>=2).length,changedLines:rows.filter(r=>r.observations>=2&&r.lineChange!==0).length,rows,authenticatedClosing:false};
}
function gameContext(p,archives,now){
 const t=dt(now),sport=p.sport||"NHL",start=dt(p.gameStartAt||p.eventStartsAt),candidates=[];
 if(!(start-t>=900000))return null;
 for(const a of archives){const d=a.archive,at=dt(d?.generatedAt),commit=dt(a.firstCommittedAt);if(a.gitHistoryCount!==1||!(Math.floor(at/1000)*1000<=commit&&commit<=t&&at<=t&&t-at<=1800000))continue;
  const rows=(d.gameMarkets||[]).filter(q=>(q.sport||"NFL")===sport&&q.twoSidedVerified===true&&n(q.total)&&n(q.homeSpread)&&q.homeSpread===-q.awaySpread&&q.total>Math.abs(q.homeSpread)&&dt(q.marketUpdatedAt)<=dt(q.observedAt)&&dt(q.observedAt)<=at&&t-dt(q.marketUpdatedAt)<=1800000&&sameEvent(p,q,d));
  const ids=new Set(rows.map(q=>q.eventId));if(ids.size!==1)continue;
  const bridge=(d.eventCrosswalk||[]).filter(q=>q.sport===sport&&q.eventId===rows[0].eventId);if(bridge.length!==1)continue;
  // Need known home/away identity, never infer from spread or player.
  const home=bridge[0].homeTeam,away=bridge[0].awayTeam,team=String(p.team||"").toUpperCase();
  const club=require("./archived-prop-market-benchmark.cjs").club;
  if(typeof club!=="function")continue;
  const isHome=club(sport,team)===String(home||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),isAway=club(sport,team)===String(away||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(isHome===isAway)continue;
  const unique=rows.filter(q=>rows.filter(z=>z.book===q.book).length===1);if(unique.length<2)continue;
  const mean=v=>v.reduce((s,x)=>s+x,0)/v.length,ml=unique.filter(q=>probability(q.homeWinNoVig)&&dt(q.moneylineUpdatedAt)<=dt(q.observedAt)&&t-dt(q.moneylineUpdatedAt)<=1800000);
  candidates.push({quoteAt:d.generatedAt,quoteFirstGitAt:a.firstCommittedAt,books:unique.length,teamSpread:mean(unique.map(q=>isHome?q.homeSpread:q.awaySpread)),total:mean(unique.map(q=>q.total)),impliedTeamTotal:mean(unique.map(q=>(q.total-(isHome?q.homeSpread:q.awaySpread))/2)),teamWinNoVig:ml.length>=2?mean(ml.map(q=>isHome?q.homeWinNoVig:1-q.homeWinNoVig)):null,researchOnly:true});
 }
 return candidates.sort((a,b)=>dt(b.quoteAt)-dt(a.quoteAt))[0]||null;
}
function freeze(p,archives,now,stat){const b=beforeFreeze(p,archives,now);if(!b||!probability(stat)||b.bookCount<2)return null;return {source:b.source,statisticalHigher:stat,sportsbookHigher:b.higher,equalWeightHigher:(stat+b.higher)/2,bookCount:b.bookCount,quoteAt:b.quoteAt,quoteFirstGitAt:b.firstCommittedAt,conditionalIdentityOnly:true,researchOnly:true,calibrated:false,modelPromoted:false};}
module.exports={compare,lineHistory,freeze,gameContext};
