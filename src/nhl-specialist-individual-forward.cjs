"use strict";
// Separate individual specialist cohort. No champion picks, public cards or
// automatic slips. Exact offered-side evidence; no guessed settlement rules.
const {buildFreeNhlResearch}=require("./free-nhl-research.cjs");
const {identifyGame}=require("./nhl-game-identity.cjs");
const {nameKey,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const {uniqueRosterIdentity}=require("./nhl-current-roster-identity.cjs");
const foldName=x=>nameKey(x).replace(/ /g,"");
function exactSpecialistIdentity(source,prop,projections){
 // Punctuation differences are allowed only when the complete normalized name
 // and current team identify a unique historical player. No guessed initials.
 const name=foldName(source?.player),team=canonicalTeam(source?.team);
 if(!name||!team||team!==canonicalTeam(prop.team)||name!==foldName(prop.player))return false;
 const hits=Object.values(projections?.players||{}).filter(x=>canonicalTeam(x.team)===team&&foldName(x.name)===name);
 return hits.length===1&&hits[0].playerId===prop.playerId;
}
const {INDIVIDUAL_MARKETS}=require("./nhl-experimental-offer-bridge.cjs");
const {gradeExperimentalFrozenPicks}=require("./nhl-experimental-market-outcome.cjs");
const {validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const {vector}=require("./nhl-all-tier-exact-mass-calibration.cjs");
const KIND="nhl_separate_individual_specialist_cohort_v1";
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier]);
function eligibilityReason(p,now){
 const rule=INDIVIDUAL_MARKETS[p?.market],v=vector(p?.probabilities),side=p?.lean?.toLowerCase(),t=dt(now);
 if(!rule)return "unrecognized_market";
 if(!v)return "invalid_probability_mass";
 if(!["higher","lower"].includes(side))return "invalid_direction";
 if(!Number.isFinite(p.probability)||Math.abs(v[side]-p.probability)>.0001)return "selected_probability_vector_mismatch";
 if(v[side]<=.5)return "offered_side_not_above_half";
 if(!["Standard","Goblin","Demon"].includes(p.tier)||p.tier!=="Standard"&&p.lean!=="Higher")return "tier_side_unavailable";
 if(!Number.isInteger(p.playerId)||!Number.isFinite(p.line))return "missing_player_or_line";
 if(!Number.isFinite(dt(p.eventStartsAt))||dt(p.eventStartsAt)-t<900000)return "not_future_15_minutes";
 if(!Number.isFinite(dt(p.capturedAt))||dt(p.capturedAt)>t||t-dt(p.capturedAt)>1800000)return "stale_or_invalid_capture";
 if(!Number.isFinite(dt(p.experimentalMarketEvidence?.modelBuiltAt))||dt(p.experimentalMarketEvidence.modelBuiltAt)>dt(p.capturedAt))return "model_build_chronology_unverified";
 return null;
}
function freeze(board,projections,schedule,extension,now){
 const t=dt(now),cap=dt(board?.generatedAt);
 if(!Number.isFinite(t)||!Number.isFinite(cap)||cap>t||t-cap>1800000||
    board.provider!=="partner-api.prizepicks.com"||board.completePagination!==true||
    board.sourceStatus!=="fresh"||board.snapshotMode!=="direct_live_board"||
    schedule?.complete!==true||!Array.isArray(schedule.games)||
    !extension?.priorityShadow||!extension?.extraShadow||!extension?.officialHistory?.players)
  throw Error("Require complete fresh private source, model shadows and official identities");
 const report=buildFreeNhlResearch(board,projections,now,null,null,extension);
 const rows=new Map(),ambiguous=new Set(),excluded={};
 const skip=x=>excluded[x]=(excluded[x]||0)+1;
 for(const p of report.rankedProps){
  if(!p.experimentalMarketResearchOnly)continue;
  const reason=eligibilityReason(p,now);
  if(reason){skip(p.market+"|"+reason);continue;}
  const v=vector(p.probabilities);
  // Require exact provider name and team in addition to official game identity.
  const source=board.rows.filter(r=>r.projectionId===p.projectionId&&r.side===p.lean&&r.line===p.line&&r.tier===p.tier&&
   r.capturedAt===p.capturedAt&&(exactSpecialistIdentity(r,p,projections)||uniqueRosterIdentity(r,p,extension.officialRosters,now)));
  const game=identifyGame(p,schedule.games.filter(g=>Math.abs(dt(g.startTimeUTC)-dt(p.eventStartsAt))<=300000));
  if(source.length!==1){skip(p.market+"|exact_source_identity_unresolved");continue;}
  if(!game){skip(p.market+"|official_game_unresolved");continue;}
  if(dt(game.gameStartAt)-t<900000){skip(p.market+"|official_game_too_close");continue;}
  const pick={...p,...game,probabilities:v,autoPickEligible:false};
  if(require("./nhl-league-published-status.cjs").applyNhlLeagueStatus(pick,extension.officialLeagueStatus,now).blocked){skip(p.market+"|league_published_risk");continue;}
  const k=key(pick);
  if(ambiguous.has(k))continue;
  if(rows.has(k)){
   // Keep higher selected probability only when opposing sides came from
   // the exact same original offer and have distinct sides.
   const a=rows.get(k);
   if(a.projectionId!==pick.projectionId||a.lean===pick.lean){ambiguous.add(k);rows.delete(k);skip("conflicting_specialist_offer");continue;}
   if(a.probability>=pick.probability)continue;
  }
  rows.set(k,pick);
 }
 return {kind:KIND,generatedAt:now,rows:[...rows.values()],excluded,sourceExclusions:report.excluded,
  separateFromChampion:true,researchOnly:true,calibrated:false,autoPickEligible:false,originalPlatformSettlementVerified:false};
}
function audit(frames,history,schedule,policyAt){
 if(!Array.isArray(frames)||!history?.players||schedule?.complete!==true||!Number.isFinite(dt(policyAt)))throw Error("Require official schedule, first policy and history");
 const seen=new Set(),picks=[],excluded={};
 const skip=x=>excluded[x]=(excluded[x]||0)+1;
 for(const frame of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=frame.snapshot,f=s?.specialistIndividualResearch;
  if(f?.kind!==KIND||f.generatedAt!==s.generatedAt||f.researchOnly!==true||f.separateFromChampion!==true||
     f.autoPickEligible!==false||!Array.isArray(f.rows)||frame.gitHistoryCount!==1||
     dt(s.generatedAt)<=dt(policyAt)||dt(frame.firstCommittedAt)<=dt(policyAt)||
     dt(frame.firstCommittedAt)-dt(s.generatedAt)>=900000)continue;
  for(const p of f.rows){
   const rule=INDIVIDUAL_MARKETS[p.market],v=vector(p.probabilities),k=key(p),side=p.lean?.toLowerCase();
   const game=identifyGame(p,schedule.games.filter(g=>Math.abs(dt(g.startTimeUTC)-dt(p.eventStartsAt))<=300000));
   if(!rule||!v||!["higher","lower"].includes(side)||v[side]<=.5||Math.abs(v[side]-p.probability)>.0001||
    p.experimentalMarketResearchOnly!==true||p.autoPickEligible!==false||!game||game.gameId!==p.gameId||
    game.gameStartAt!==p.gameStartAt||seen.has(k)||dt(p.gameStartAt)-dt(frame.firstCommittedAt)<900000||
    !validArchiveChronology(dt(p.capturedAt),dt(s.generatedAt),dt(frame.firstCommittedAt),dt(p.gameStartAt))||
    !Number.isFinite(dt(p.experimentalMarketEvidence?.modelBuiltAt))||
    dt(p.experimentalMarketEvidence.modelBuiltAt)>dt(p.capturedAt)){skip("invalid_or_duplicate_original_specialist");continue;}
   seen.add(k);picks.push({...p,predictionRecordedAt:s.generatedAt,snapshotArchivedAt:frame.firstCommittedAt});
  }
 }
 // Restrict the pre-existing specialty grader to one final role-correct
 // positive-participation boxscore per player/game.
 const clean={players:{}};
 for(const p of picks){
  const g=(history.players[String(p.playerId)]?.games||[]).filter(x=>x.gameId===p.gameId&&x.playerId===p.playerId&&
   ["OFF","FINAL"].includes(x.gameState)&&x.type===INDIVIDUAL_MARKETS[p.market].role&&Number.isFinite(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0);
  if(g.length===1){const entry=clean.players[p.playerId]??={games:[]};if(!entry.games.some(x=>x.gameId===p.gameId))entry.games.push(g[0]);}
 }
 const result=gradeExperimentalFrozenPicks(picks,clean),byMarket={};
 for(const market of Object.keys(INDIVIDUAL_MARKETS)){
  const registered=picks.filter(p=>p.market===market).length,rows=result.graded.filter(p=>p.market===market);
  const n=rows.length,decided=rows.filter(p=>p.correct!==null),correct=decided.filter(p=>p.correct===true).length;
  byMarket[market]={registered,graded:n,decided:decided.length,correct,pushes:n-decided.length,
   hitRate:decided.length?correct/decided.length:null,strictSelectedBrier:n?rows.reduce((a,p)=>a+(p.probability-Number(p.correct===true))**2,0)/n:null,
   distinctGames:new Set(rows.map(p=>p.gameId)).size,calibrated:false};
 }
 return {kind:KIND,byMarket,summary:result.summary,excluded,researchOnly:true,separateFromChampion:true,modelPromoted:false,originalPlatformSettlementVerified:false};
}
module.exports={KIND,freeze,audit,eligibilityReason,exactSpecialistIdentity};
