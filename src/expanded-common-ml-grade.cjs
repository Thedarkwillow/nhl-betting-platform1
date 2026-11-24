"use strict";
const {SPECS,marketValue}=require("../scripts/backtest-nfl-historical-stats.cjs");
const {matchOfficialGame,finalScorePresent}=require("./nfl-precommitted-grading.cjs");
const n=Number.isFinite,dt=Date.parse;
function score({nhlFrames=[],nflFrames=[],history,weekly=[],schedule=[],kicks=[],now}){
 const ordered=[...nhlFrames.map(x=>({...x,sport:"NHL"})),...nflFrames.map(x=>({...x,sport:"NFL"}))].sort((a,b)=>dt(a.firstGitCommittedAt)-dt(b.firstGitCommittedAt));
 const seen=new Set(),markets={},excluded={},matched=[];const skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const item of ordered){
  const s=item.snapshot,commit=dt(item.firstGitCommittedAt),created=dt(item.sport==="NHL"?s?.matchupContextReviewV1?.generatedAt:s?.createdAt);
  if(item.gitHistoryCount!==1||!n(commit)||!n(created)||created-commit>=1000||commit>dt(now)){skip("invalid_original");continue;}
  const rows=item.sport==="NHL"?(s.matchupContextReviewV1?.rows||[]):[...(s.expandedCommonMLShadow?.rows||[]),...(s.kickerCommonMLShadow?.rows||[])];
  for(const r of rows){
   const m=item.sport==="NHL"?r.commonML:r.model,start=dt(r.gameStartAt||r.eventStartsAt),capture=dt(r.capturedAt||r.sourceObservedAt),artifact=dt(m?.artifactFirstGitAt),side=item.sport==="NHL"?r.side:r.offeredSide;
   if(!m)continue;
   if(m.kind!=="priority_common_features_logistic_shadow_v1"||m.researchOnly!==true||m.modelPromoted!==false||m.calibrated!==false||!n(m.higher)||m.higher<0||m.higher>1||!n(r.line)||r.line%1!==.5||m.line!==r.line||m.market!==item.sport.toLowerCase()+"_"+r.market||![start,capture,artifact].every(n)||capture>created||artifact>created||start-commit<900000||!["Higher","Lower"].includes(side)||m.higher===.5){skip("invalid_shadow");continue;}
   const predicted=m.higher>.5?"Higher":"Lower";if(predicted!==side){skip("model_side_not_observed");continue;}
   const player=r.playerId??r.historicalPlayerId,game=r.gameId??r.sourceGameId;
   if(!player||!game){skip("missing_identity");continue;}
   const key=JSON.stringify([item.sport,game,player,r.market,r.line]);if(seen.has(key))continue;seen.add(key);
   const out=markets[m.market]??={registered:0,decided:0,correct:0,alwaysHigher:0,alwaysLower:0,brierSum:0,pending:0};out.registered++;
   let actual=null;
   if(item.sport==="NHL"){
    const a=(history?.players?.[String(player)]?.games||[]).filter(x=>x.gameId===game&&x.playerId===player&&["OFF","FINAL"].includes(x.gameState)&&x.timeOnIceSeconds>0&&(r.market==="saves"?x.type==="goalie"&&x.started===true:x.type==="skater"));
    if(a.length===1&&Number.isInteger(a[0][r.market]))actual=a[0][r.market];
   }else{
    const g=matchOfficialGame(r,schedule),spec=SPECS.find(x=>x.id===r.market);
    if(finalScorePresent(g)&&dt(now)-start>=8*3600000&&spec){
     if(spec.family==="kicking"){const a=kicks.filter(x=>x.gameId===g.game_id&&x.playerId===player&&x.team===r.team);if(a.length===1)actual=a[0].measures?.[r.market];}
     else{const a=weekly.filter(x=>x.player_id===player&&x.season===r.season&&x.week===r.week&&(x.recent_team||x.team)===r.team);if(a.length===1)actual=marketValue(spec,a[0]);}
    }
   }
   if(!n(actual)||actual===r.line){out.pending++;continue;}
   const higher=actual>r.line,b=r.sportsbookML;if(b?.conditionalIdentityOnly===true&&b.researchOnly===true&&b.modelPromoted===false&&b.statisticalHigher===m.higher&&n(b.sportsbookHigher)&&b.bookCount>=2&&dt(b.quoteAt)<=dt(b.quoteFirstGitAt)+999&&dt(b.quoteFirstGitAt)<=created&&created-dt(b.quoteAt)<=1800000)matched.push({key,gameKey:JSON.stringify([item.sport,game]),market:m.market,date:new Date(start).toISOString().slice(0,10),startAt:new Date(start).toISOString(),firstGitAt:item.firstGitCommittedAt,quoteAt:b.quoteAt,stat:m.higher,book:b.sportsbookHigher,actual:Number(higher),researchOnly:true,conditionalIdentityOnly:true});out.decided++;out.correct+=Number(higher===(predicted==="Higher"));out.alwaysHigher+=Number(higher);out.alwaysLower+=Number(!higher);out.brierSum+=(m.higher-Number(higher))**2;
  }
 }
 for(const a of Object.values(markets)){a.hitRate=a.decided?a.correct/a.decided:null;a.brier=a.decided?a.brierSum/a.decided:null;delete a.brierSum;}
 return {kind:"expanded_common_ml_first_git_grade_v1",generatedAt:now,markets,excluded,sportsbookMatched:require("./sportsbook-matched-model-research.cjs").compare(matched),researchOnly:true,calibrated:false,modelPromoted:false,platformSettlementVerified:false};
}
module.exports={score};
