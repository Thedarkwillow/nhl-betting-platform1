"use strict";
/**
 * Empirical repeated-player, same-official-game count-stat covariance.
 * This is NOT the correlation of fantasy-prop hit events. No payout, lineup
 * joint probability, optimal bet, or live model adjustment is inferred.
 */
const FIELDS=new Set(["shotsOnGoal","goals","assists","points","blockedShots","saves","shotsAgainst"]);
const validDate=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const round=x=>Number(x.toFixed(4));
function pearsonWithInterval(rows,{minimumPairedGames=12}={}){
 if(!Array.isArray(rows)||!Number.isInteger(minimumPairedGames)||minimumPairedGames<12)
  throw Error("Require valid paired official observations and >=12 real games");
 const n=rows.length;
 if(n<minimumPairedGames)
  return {status:"insufficient_repeated_official_games",pairedGames:n,
   countStatPearson:null,approxFisher95:null};
 const xs=rows.map(r=>r.x),ys=rows.map(r=>r.y);
 if(xs.some(x=>!Number.isFinite(x))||ys.some(x=>!Number.isFinite(x)))
  throw Error("Incomplete official player counts");
 const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
 let xx=0,yy=0,xy=0;
 for(let i=0;i<n;i++){
  const x=xs[i]-mx,y=ys[i]-my;xx+=x*x;yy+=y*y;xy+=x*y;
 }
 if(xx<=0||yy<=0)return {status:"zero_stat_variance",
  pairedGames:n,countStatPearson:null,approxFisher95:null};
 const raw=Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
 const z=Math.atanh(Math.max(-.999999,Math.min(.999999,raw))),
  se=1/Math.sqrt(n-3);
 return {status:"descriptive_repeat_pair_stat_correlation",pairedGames:n,
  countStatPearson:round(raw),
  approxFisher95:{lower:round(Math.tanh(z-1.96*se)),
   upper:round(Math.tanh(z+1.96*se))},
  approximateNormalityAssumed:true,
  multipleComparisonAdjustmentApplied:false,
  measuredPropHitCorrelation:false};
}
function officialPairedCountStats(a,b,history){
 if(!Number.isInteger(a?.playerId)||!Number.isInteger(b?.playerId)||
  a.playerId===b.playerId||!FIELDS.has(a.market)||!FIELDS.has(b.market)||
  !validDate(a.capturedAt)||!validDate(b.capturedAt))return [];
 const cutoff=(Date.parse(a.capturedAt)<Date.parse(b.capturedAt)?
  a.capturedAt:b.capturedAt).slice(0,10);
 const ga=history?.players?.[String(a.playerId)]?.games||[];
 const gb=history?.players?.[String(b.playerId)]?.games||[];
 const earlier=new Map(ga.filter(r=>Number.isInteger(r?.gameId)&&
  typeof r.gameDate==="string"&&r.gameDate<cutoff&&
  Number.isFinite(r[a.market])&&r[a.market]>=0).map(r=>[r.gameId,r]));
 const wantSameTeam=String(a.team||"")===String(b.team||"");
 return gb.filter(r=>Number.isInteger(r?.gameId)&&
  typeof r.gameDate==="string"&&r.gameDate<cutoff&&
  Number.isFinite(r[b.market])&&r[b.market]>=0&&earlier.has(r.gameId))
  .map(r=>({a:earlier.get(r.gameId),b:r}))
  .filter(({a:x,b:y})=>x.gameDate===y.gameDate&&x.playerId===a.playerId&&
   y.playerId===b.playerId&&x.gameId===y.gameId&&
   (!x.team||!y.team||(x.team===y.team)===wantSameTeam))
  .map(({a:x,b:y})=>({gameId:x.gameId,date:x.gameDate,
   x:x[a.market],y:y[b.market],historicalTeamRelationVerified:!!(x.team&&y.team)}))
  .sort((x,y)=>x.date.localeCompare(y.date)||x.gameId-y.gameId);
}
function pairRelationship(a,b){
 if(a.team===b.team)return "same_team";
 return (a.market==="saves"&&b.market==="shotsOnGoal")||
  (b.market==="saves"&&a.market==="shotsOnGoal")?
  "opposing_goalie_shooter":"opposing_teams";
}
function evaluateNhlCountStatDependence(history,props,{asOf,minimumPairedGames=12,
 maxPlayersPerGame=8,maxPairs=600}={}){
 if(!history?.players||!Array.isArray(props)||!validDate(asOf)||
  !Number.isInteger(minimumPairedGames)||minimumPairedGames<12||
  maxPlayersPerGame<2||maxPlayersPerGame>20||maxPairs<1||maxPairs>3000)
  throw Error("Valid official game logs, pregame props and bounded research rules required");
 const clock=Date.parse(asOf),groups=new Map();
 for(const p of props){
  if(!Number.isInteger(p?.gameId)||!Number.isInteger(p?.playerId)||!FIELDS.has(p.market)||
   !validDate(p.capturedAt)||!validDate(p.eventStartsAt)||
   Date.parse(p.capturedAt)>clock||Date.parse(p.capturedAt)>=Date.parse(p.eventStartsAt)||
   !["Higher","Lower"].includes(p.lean)||
   !Number.isFinite(p.probability)||p.probability<=.5||
   p.researchEligibility==="watchlist"||
   !p.team||!p.opponent||p.team===p.opponent)continue;
  if(!groups.has(p.gameId))groups.set(p.gameId,new Map());
  const pairKey=String(p.playerId)+"|"+p.market;
  const prev=groups.get(p.gameId).get(pairKey);
  if(!prev||p.probability>prev.probability)groups.get(p.gameId).set(pairKey,p);
 }
 const paired=[],statuses={insufficient_repeated_official_games:0,
  zero_stat_variance:0,descriptive_repeat_pair_stat_correlation:0};
 let excludedAlreadySamePlayer=0,tooManyPairs=0;
 for(const [gameId,players]of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
  const selected=[...players.values()].sort((a,b)=>b.probability-a.probability||
    a.playerId-b.playerId).slice(0,maxPlayersPerGame);
  for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
   const a=selected[i],b=selected[j];
   if(a.playerId===b.playerId){excludedAlreadySamePlayer++;continue;}
   if(a.eventStartsAt!==b.eventStartsAt)continue;
   if(paired.length>=maxPairs){tooManyPairs++;continue;}
   const samples=officialPairedCountStats(a,b,history);
   const outcome=pearsonWithInterval(samples,{minimumPairedGames});
   statuses[outcome.status]++;
   const signed=outcome.countStatPearson===null?null:
    round(outcome.countStatPearson*(a.lean===b.lean?1:-1));
   paired.push({gameId,playerAId:a.playerId,playerBId:b.playerId,
    teamA:a.team,teamB:b.team,marketA:a.market,marketB:b.market,
    sideA:a.lean,sideB:b.lean,relationship:pairRelationship(a,b),
    ...outcome,sideAlignedCountCorrelation:signed,
    historicalTeamRelationVerified:samples.length>0&&
      samples.every(x=>x.historicalTeamRelationVerified===true),
    pairedGamesWithoutTeamLabels:samples.filter(x=>!x.historicalTeamRelationVerified).length,
    observedStatCountOnly:true,prospectivePropCoHitRateVerified:false,
    modelAdjustmentAllowed:false});
  }
 }
 return {schemaVersion:1,kind:"private_official_nhl_past_only_count_stat_pair_dependence",
  evaluatedAt:asOf,officialHistorySource:"NHL completed-game player game boxscores",
  population:"Archived pregame eligible research sides, max 8 player-markets per official game",
  countedGamesMustEndBeforeBothPropCaptures:true,
  evaluatedPairs:paired.length,measuredPairs:statuses.descriptive_repeat_pair_stat_correlation,
  statuses,excludedAlreadySamePlayer,pairBudgetSkipped:tooManyPairs,
  requiredPairedOfficialGames:minimumPairedGames,
  measuredProposition:"Correlation of historical raw NHL count statistics for recurring pairs of players",
  measuredPropWinEventCorrelations:false,verifiedJointLineupProbability:false,
  modelOrOptimizerModified:false,payoutEVVerified:false,
  pairs:paired,
  warning:"Exploratory raw stat co-movement, not correlation of Higher/Lower prop wins. Archived prior-season official NHL logs may lack historical team labels; those pairs are not proof of historical teammate/opponent status. Approximate Fisher bands assume normality; multiple comparisons and game/team dependence not corrected. Do not advertise an edge, estimate joint hit chances, or adjust lineup payouts."};
}
module.exports={pearsonWithInterval,officialPairedCountStats,
 pairRelationship,evaluateNhlCountStatDependence};
