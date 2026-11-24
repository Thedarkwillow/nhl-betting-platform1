"use strict";
/** Read-only 2026-27 chronological official NHL stat forecast baseline lab.
 * This is NOT a PrizePicks hit-rate backtest: it has no historical quoted
 * thresholds, original tier or payout evidence. No model is promoted.
 */
const {MARKET_FIELDS}=require("./nhl-six-priority-evidence-brief.cjs");
const targetSeason="2026-27",start="2026-07-01",end="2027-07-01";
const validDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
const usable=(row,m)=>row&&validDate(row.gameDate)&&
 Number.isInteger(row.gameId)&&Number.isFinite(row[m.field])&&
 (m.kind==="integer"?(Number.isInteger(row[m.field])&&row[m.field]>=0):
 m.kind==="seconds"?(row[m.field]>=0&&row[m.field]<=3900):true);
const avg=values=>values.reduce((a,b)=>a+b,0)/values.length;
function runOfficialMarketWalkforward(history,{minPrevious=8}={}){
 if(!Number.isInteger(minPrevious)||minPrevious<8)throw Error("Historical floor must be >=8");
 const accum=Object.fromEntries(MARKET_FIELDS.map(m=>[m.key,{n:0,err5:0,err10:0,
  games:new Set(),dates:new Set(),players:new Set(),missingPrior:0}]));
 if(history?.players&&typeof history.players==="object"){
  for(const p of Object.values(history.players)){
   if(!p||!Array.isArray(p.games)||!Number.isInteger(p.playerId))continue;
   for(const m of MARKET_FIELDS){
    if((p.type==="goalie")!==!!m.goalie)continue;
    const sorted=p.games.filter(g=>validDate(g?.gameDate)&&
     Number.isInteger(g.gameId)).slice().sort((a,b)=>
      a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
    const known=[],seenGames=new Set();
    for(const g of sorted){
     const key=g.gameId+"|"+g.gameDate;
     if(seenGames.has(key))continue;
     seenGames.add(key);
     const okay=usable(g,m),inHoldout=g.gameDate>=start&&g.gameDate<end;
     if(inHoldout){
      if(!okay||known.filter(x=>x.day<g.gameDate).length<minPrevious){
       accum[m.key].missingPrior++;
      }else{
       // Same-date records are deliberately excluded from training, even
       // if the official result was archived earlier that day.
       const prior=known.filter(x=>x.day<g.gameDate).map(x=>x.value);
       const last5=prior.slice(-5),last10=prior.slice(-10);
       if(last5.length===5&&last10.length>=minPrevious){
        const a=accum[m.key];
        a.n++;a.err5+=Math.abs(avg(last5)-g[m.field]);
        a.err10+=Math.abs(avg(last10)-g[m.field]);
        a.games.add(g.gameId);a.dates.add(g.gameDate);a.players.add(p.playerId);
       }
      }
     }
     if(okay)known.push({day:g.gameDate,value:g[m.field]});
    }
   }
  }
 }
 return {kind:"nhl_official_priority_markets_walkforward_2026_27_v1",
  status:history?.players?"official_history_scored_research_only":"official_history_unavailable",
  season:targetSeason,minPreviousGames:minPrevious,
  dateCutoffStrictlyBeforeHoldoutGame:true,
  sameDateHistoricalOutcomesExcluded:true,
  markets:Object.fromEntries(MARKET_FIELDS.map(m=>{
   const a=accum[m.key],n=a.n;
   return [m.key,{stat:m.label,scoredPlayerGames:n,distinctOfficialGames:a.games.size,
    distinctGameDates:a.dates.size,players:a.players.size,
    excludedNoPriorOrObservedResult:a.missingPrior,
    last5MeanAbsoluteError:n?Number((a.err5/n).toFixed(5)):null,
    last10MeanAbsoluteError:n?Number((a.err10/n).toFixed(5)):null,
    lowerErrorBaseline:n&&a.err5<a.err10?"last_5":
     n&&a.err10<a.err5?"last_10":n?"tie":"unavailable",
    unit:m.kind==="seconds"?"seconds":m.kind==="fantasy"?
     "user_provided_fantasy_point_rule":"official_count",
    originalPlatformQuoteLinesScored:0,
    originalFantasySettlementVerified:false,
    eligibleForAutomaticModelPromotion:false}];
  })),
  isActualPrizePicksQuotedLineBacktest:false,
  officialStatsNotOriginalPlatformSettlement:true,
  retrospectivePointErrorNotProspectiveProbabilityCalibration:true,
  noModelPromoted:true,paidProviderRequests:0,
  warning:"Only 2026–27 chronological official player-game point forecast errors. No original offered thresholds, tier/payouts, DNP/reboot or verified platform settlement; last5/last10 baseline comparison is exploratory."};
}
module.exports={runOfficialMarketWalkforward,usable,validDate};
