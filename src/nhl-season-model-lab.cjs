"use strict";
/**
 * Read-only model research on previously collected official NHL player-game
 * statistics. Evaluates *past-only* forecasts. Does not manufacture lines,
 * original platform settlements, or prospectively frozen historical picks.
 */
const MARKETS=["shotsOnGoal","goals","assists","points","blockedShots","saves"];
const MODELS=["weighted-form-v1","prior-mean","stable-blend","stable-shrink-v2"];
const round=x=>x===null?null:Number(x.toFixed(6));
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
function candidateMeans(values){
 if(values.length<5)throw Error("At least five past games required");
 const n=values.length,all=mean(values),five=mean(values.slice(-5)),ten=mean(values.slice(-10));
 const form=.6*five+.4*ten,weight=Math.min(.35,n/(n+30));
 return {
  "weighted-form-v1":.5*five+.3*ten+.2*all,
  "prior-mean":all,
  "stable-blend":.25*five+.25*ten+.5*all,
  "stable-shrink-v2":Math.max(0,all+weight*(form-all))
 };
}
function collectOfficialSeasons({reference2024,officialLogs}){
 if(!reference2024?.players||!officialLogs?.logs)throw Error("Missing cached official NHL season data");
 const ids=new Map(),counts={season2024Games:0,season2025Games:0,players2024:0,players2025:0};
 const add=(id,g,season)=>{
  if(!Number.isInteger(Number(id))||!Number.isInteger(Number(g.gameId))||!/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate||""))
   return;
  const gameId=String(g.gameId);
  if((season==="2024-25"&&!gameId.startsWith("202402"))||(season==="2025-26"&&!gameId.startsWith("202502")))return;
  let entry=ids.get(String(id));if(!entry){entry=new Map();ids.set(String(id),entry);}
  if(entry.has(gameId))throw Error("Duplicate official player-game identity "+id+"|"+gameId);
  entry.set(gameId,{...g,gameId:Number(g.gameId),season});
  if(season==="2024-25")counts.season2024Games++;else counts.season2025Games++;
 };
 for(const [id,p] of Object.entries(reference2024.players)){
  if(!Array.isArray(p?.games)||p.status!=="verified_games")continue;
  counts.players2024++;
  for(const g of p.games)add(id,g,"2024-25");
 }
 for(const [id,games] of Object.entries(officialLogs.logs)){
  if(!Array.isArray(games))continue;
  counts.players2025++;
  for(const g of games){
   if(g.season==="2025-26"||String(g.gameId).startsWith("202502"))
    add(id,g,"2025-26");
  }
 }
 return {players:Object.fromEntries([...ids].map(([id,g])=>[id,[...g.values()].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId)])),
  sourceCounts:counts};
}
function evaluateOfficialHistory(players,{minGames=5}={}){
 if(!players||typeof players!=="object"||minGames<5)throw Error("Invalid history lab inputs");
 const rows=[];
 for(const [id,games] of Object.entries(players)){
  const seen=new Set(),validGames=[...games].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  for(const game of validGames){
   const key=String(game.gameId);
   if(seen.has(key))throw Error("Duplicate official game within player "+id+" "+key);
   seen.add(key);
  }
  const prior=Object.fromEntries(MARKETS.map(x=>[x,[]]));
  for(const g of validGames){
   for(const market of MARKETS){
    const actual=g[market],history=prior[market];
    if(Number.isFinite(actual)&&actual>=0&&history.length>=minGames&&["2024-25","2025-26"].includes(g.season)){
     rows.push({season:g.season,gameId:g.gameId,gameDate:g.gameDate,playerId:Number(id),
      market,actual,priorGames:history.length,candidates:candidateMeans(history)});
    }
   }
   // Only official valid past observations become features after prediction.
   for(const market of MARKETS)
    if(Number.isFinite(g[market])&&g[market]>=0)prior[market].push(g[market]);
  }
 }
 return rows;
}
function summarize(rows){
 const n=rows.length;
 const models={};
 for(const model of MODELS){
  let error=0,squared=0,bias=0;
  for(const r of rows){const diff=r.candidates[model]-r.actual;error+=Math.abs(diff);squared+=diff*diff;bias+=diff;}
  models[model]={mae:n?round(error/n):null,rmse:n?round(Math.sqrt(squared/n)):null,
   meanBias:n?round(bias/n):null};
 }
 return {playerGames:n,distinctGames:new Set(rows.map(x=>x.gameId)).size,
  distinctDates:new Set(rows.map(x=>x.gameDate)).size,distinctPlayers:new Set(rows.map(x=>x.playerId)).size,models};
}
function pairedGameInterval(rows,model,{iterations=500,seed=727}={}){
 const groups=new Map();
 for(const r of rows){let x=groups.get(r.gameId);if(!x){x=[];groups.set(r.gameId,x);}
  x.push(Math.abs(r.candidates["weighted-form-v1"]-r.actual)-Math.abs(r.candidates[model]-r.actual));}
 if(groups.size<20)return null;
 const games=[...groups.values()],deltas=[];let state=seed>>>0;
 for(let draw=0;draw<iterations;draw++){
  let total=0,n=0;
  for(let j=0;j<games.length;j++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   const group=games[Math.floor((state/4294967296)*games.length)];
   for(const delta of group){total+=delta;n++;}
  }
  deltas.push(total/n);
 }
 deltas.sort((a,b)=>a-b);
 return {unit:"MAE improvement (positive is better)",method:"paired bootstrap, NHL game-cluster",
  lower95:round(deltas[Math.floor((iterations-1)*.025)]),
  upper95:round(deltas[Math.floor((iterations-1)*.975)]),
  note:"Exploratory historical sample; not a production accuracy guarantee."};
}
function evaluateSeasonLab(history,{minGames=5}={}){
 const rows=evaluateOfficialHistory(history.players,{minGames}),byMarket={};
 for(const market of MARKETS){
  const training=rows.filter(x=>x.season==="2024-25"&&x.market===market),
   holdout=rows.filter(x=>x.season==="2025-26"&&x.market===market);
  const trainScore=summarize(training),holdoutScore=summarize(holdout);
  // Candidate selection uses ONLY 2024-25 training and never the 2025-26 outcomes.
  const selected=training.length?MODELS.slice().sort((a,b)=>
   trainScore.models[a].mae-trainScore.models[b].mae||MODELS.indexOf(a)-MODELS.indexOf(b))[0]:null;
  byMarket[market]={training:trainScore,holdout:holdoutScore,
   selectedOn2024Only:selected,
   selectedHoldoutMae:selected?holdoutScore.models[selected].mae:null,
   championHoldoutMae:holdoutScore.models["weighted-form-v1"].mae,
   shadowHoldoutMae:holdoutScore.models["stable-shrink-v2"].mae,
   shadowImprovementInterval:pairedGameInterval(holdout,"stable-shrink-v2"),
   measuredShadowImprovement:holdout.length?round(holdoutScore.models["weighted-form-v1"].mae-
    holdoutScore.models["stable-shrink-v2"].mae):null,
   sufficientHoldoutForResearch:holdout.length>=100&&holdoutScore.distinctDates>=20,
   eligibleToDeploy:false};
 }
 return {schemaVersion:1,kind:"nhl_official_stat_two_season_projection_lab",
  trainingSeason:"2024-25",holdoutSeason:"2025-26",sourceCounts:history.sourceCounts,
  minPriorGames:minGames,models:MODELS,
  evaluatedTrainingRows:rows.filter(r=>r.season==="2024-25").length,
  evaluatedHoldoutRows:rows.filter(r=>r.season==="2025-26").length,
  byMarket,championUnchanged:true,prospectiveVerified:false,
  usesSyntheticPropLines:false,modelHitRate:null,calibrated:false,
  warning:"MAE evaluates observed official NHL player-game statistics, not historical PrizePicks or Underdog offers. Official backfill is a selected subset of players with partial market coverage. Prior games only; 2024-25 training and 2025-26 holdout. No verified pregame historical model prediction record, payouts, calibrated hit rate or EV."};
}
module.exports={MARKETS,MODELS,candidateMeans,collectOfficialSeasons,evaluateOfficialHistory,evaluateSeasonLab,pairedGameInterval};
