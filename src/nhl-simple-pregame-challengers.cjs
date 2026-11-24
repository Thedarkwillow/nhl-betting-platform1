"use strict";
/**
 * Before-puck-drop, research-only Standard market challenger forecasts.
 * Immutable forecasts are recorded alongside original model selections in
 * the SAME Git commit. Never turn them into postgame reconstructed picks.
 * All inputs are cached NHL final-game history, with same-day games excluded.
 */
const KIND="nhl_frozen_simple_standard_challengers_v1";
const VALID_MARKETS=new Set(["shotsOnGoal","blockedShots","goals","assists","points",
 "saves","shotsAgainst"]);
const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 Number.isFinite(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function cachedPastSamples(history,selection,now){
 const first=history?.players?.[String(selection?.playerId)],
  cutoff=typeof now==="string"?now.slice(0,10):null,
  market=selection?.market;
 if(!first||!Array.isArray(first.games)||!VALID_MARKETS.has(market)||
    !Number.isFinite(Date.parse(now))||!validDate(cutoff))return [];
 const games=new Map();
 for(const g of first.games){
  if(!g||!Number.isInteger(g.gameId)||!validDate(g.gameDate)||g.gameDate>=cutoff||
   !Number.isInteger(g[market])||g[market]<0)continue;
  const id=String(g.gameId);
  if(games.has(id))return []; // ambiguous duplicated finals fail closed
  games.set(id,{gameId:g.gameId,day:g.gameDate,value:g[market]});
 }
 return [...games.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.gameId-b.gameId);
}
function makeForecast(p,history,now){
 if(!p||p.tier!=="Standard"||!Number.isInteger(p.gameId)||
  !Number.isInteger(p.playerId)||!VALID_MARKETS.has(p.market)||
  !finite(p.line)||p.line<0||!["Higher","Lower"].includes(p.lean)||
  !finite(Date.parse(p.gameStartAt))||Date.parse(now)>=Date.parse(p.gameStartAt))
  return null;
 const values=cachedPastSamples(history,p,now);
 const forecast=n=>{
  if(values.length<n)return {side:null,sample:values.length,mean:null,reason:"insufficient_prior_official_games"};
  const mean=values.slice(-n).reduce((s,r)=>s+r.value,0)/n;
  return {side:mean>p.line?"Higher":mean<p.line?"Lower":null,
   sample:n,mean:Number(mean.toFixed(6)),
   reason:mean===p.line?"exact_mean_line_tie_abstained":"previous_final_games_only"};
 };
 const five=forecast(5),ten=forecast(10);
 // Shadow selection policy is fixed BEFORE trial: two independent windows
 // must agree and both be at least 0.5 away from same original quote threshold.
 const agreement=five.side&&five.side===ten.side&&
  Math.abs(five.mean-p.line)>=0.5&&Math.abs(ten.mean-p.line)>=0.5?
  five.side:null;
 return {gameId:p.gameId,playerId:p.playerId,market:p.market,tier:"Standard",
  line:p.line,modelSelectedSide:p.lean,originalGameStartAt:p.gameStartAt,
  originalSourceCapturedAt:p.capturedAt,
  strategies:{
   last5:five.side,last10:ten.side,
   consensus5And10MarginHalf:agreement
  },
  samples:{last5:five.sample,last10:ten.sample},
  // Persist the forecasts and observed history counts in original pregame
  // snapshot, never recompute a supposedly precommitted side after the game.
  means:{last5:five.mean,last10:ten.mean},
  noOriginalBookSideAvailabilityProof:true,noPlatformPayoutProof:true};
}
function freezeSimpleBenchmarks(picks,history,{now}={}){
 if(!Array.isArray(picks)||!Number.isFinite(Date.parse(now)))
  throw Error("Require frozen original picks and valid pregame forecast clock");
 const rows=picks.filter(p=>p?.tier==="Standard");
 const frozen=rows.map(p=>makeForecast(p,history,now));
 // Refuse partial identity corruption rather than silently dropping rows.
 if(frozen.some(x=>x===null))throw Error("Invalid original Standard pick or chronology for baseline freeze");
 const unique=new Set(frozen.map(r=>JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier])));
 if(unique.size!==frozen.length)throw Error("Duplicate frozen Standard benchmark identity");
 return {kind:KIND,policy:"nhl_last5_last10_consensus_standard_v1",
  createdAt:now,rows:frozen,
  originalStandardSelections:rows.length,
  selectedModelPolicyUnchanged:true,
  pregameGitCommitEvidenceRequired:true,
  originalPlatformSidesAuthenticated:false,bettingEdgeVerified:false,
  note:"Simple pregame mean-side challengers on the model's exact selected Standard thresholds. They do not choose independently from the full eligible board; opinions and payouts unverified."};
}
module.exports={KIND,VALID_MARKETS,cachedPastSamples,makeForecast,freezeSimpleBenchmarks};
