"use strict";
// A deliberately small common-feature logistic model, trained on older
// seasons and frozen on the exact original offered half-line only.
const n=Number.isFinite,dt=Date.parse,avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const expanded=require("./priority-expanded-ml-markets.json");
const F={nhl_points:["recent5","recent20","goals","assists","shootingRate","ice"],nfl_receiving_yards:["base","recent5","opportunity"],nfl_passing_attempts:["base","recent5","opportunity"]};
Object.assign(F,Object.fromEntries(Object.entries(expanded).map(([k,v])=>[k,v.fields])));
function joinGoalieUsage(history,usage){
 if(!["official_NHL_final_gamecenter_boxscore","official_NHL_stats_rest_goalie_summary_exact_game"].includes(usage?.source))return history;
 const players={...history.players};for(const [id,p] of Object.entries(players)){const by=new Map();for(const r of usage.players?.[id]||[]){const a=by.get(r.gameId)||[];a.push(r);by.set(r.gameId,a);}if(!by.size)continue;players[id]={...p,games:(p.games||[]).map(g=>{if(g.type!=="goalie")return g;const a=by.get(g.gameId)||[],r=a[0];if(a.length!==1||r.provenance!==usage.source||r.playerId!==g.playerId||r.gameDate!==g.gameDate||r.team!==g.team||r.timeOnIceSeconds!==g.timeOnIceSeconds||r.saves!==g.saves&&!(usage.source==='official_NHL_stats_rest_goalie_summary_exact_game'&&r.correction?.restAndFinalBoxscoreAgree===true&&r.correction.confirmedBy==='official_NHL_final_gamecenter_boxscore'&&r.correction.oldSaves===g.saves&&r.correction.oldShotsAgainst===g.shotsAgainst&&Number.isInteger(r.saves)&&r.saves>=0&&Number.isInteger(r.shotsAgainst)&&r.shotsAgainst>=r.saves)||typeof r.started!=="boolean"||g.starterEvidenceConflict===true)return g;if(typeof g.started==="boolean"&&g.started!==r.started)return {...g,started:null,starterEvidenceConflict:true};return {...g,started:r.started,...(r.correction?{saves:r.saves,shotsAgainst:r.shotsAgainst,goalieResearchCorrection:r.correction}:{})};})};}return {...history,players};
}
function nhlCommon(market,prior,team,day){
 const type=market==="saves"?"goalie":"skater",h=prior.filter(x=>(market!=="saves"||x.started===true)&&x.gameDate<day&&x.type===type&&x.team===team&&["OFF","FINAL"].includes(x.gameState)&&n(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0&&Number.isInteger(x[market])&&x[market]>=0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-20);
 if(h.length<10||new Set(h.map(x=>x.gameId)).size!==h.length)return null;
 return {recent5:avg(h.slice(-5).map(x=>x[market])),recent20:avg(h.map(x=>x[market])),ice:avg(h.slice(-10).map(x=>x.timeOnIceSeconds))/60};
}
function predict(market,line,features,artifact,now){
 const d=artifact?.document,model=d?.models?.[market]?.[String(line)],fields=F[market];
 if(!fields||!model||d.kind!=="priority_common_features_logistic_v1"||d.researchOnly!==true||d.modelPromoted!==false||!(dt(d.generatedAt)<=dt(artifact.firstCommittedAt)&&dt(artifact.firstCommittedAt)<=dt(now))||JSON.stringify(model.fields)!==JSON.stringify(fields)||!fields.every(k=>n(features[k]))||![model.intercept,...(model.coefficients||[]),...(model.means||[]),...(model.scales||[])].every(n)||[model.coefficients,model.means,model.scales].some(x=>x?.length!==fields.length)||model.scales.some(x=>x<=0))return null;
 const z=model.intercept+fields.reduce((s,k,i)=>s+model.coefficients[i]*(features[k]-model.means[i])/model.scales[i],0),p=1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
 return {kind:"priority_common_features_logistic_shadow_v1",market,line,higher:p,artifactFirstGitAt:artifact.firstCommittedAt,trainedThrough:d.trainedThrough,modelPromoted:false,calibrated:false,researchOnly:true};
}
function goalieStart(p,source,now){
 const doc=source?.document,cap=dt(doc?.generatedAt),commit=dt(source?.firstCommittedAt),at=dt(now),start=dt(p.gameStartAt);
 if(doc?.kind!=="nhl_external_pregame_availability_research"||!(cap<=commit+1000&&commit<=at&&cap<=at&&at-cap<=5400000&&start-at>=900000))return false;
 const events=(doc.events||[]).filter(x=>x.nhlGameId===p.gameId&&dt(x.eventStartsAt)===start);
 if(events.length!==1)return false;
 const rows=(events[0].goalies||[]).filter(x=>x.team===p.team&&x.officialTeamStarterConfirmation===true);
 return rows.length===1&&rows[0].playerId===p.playerId&&rows[0].nhlOfficialGameId===p.gameId&&rows[0].officialRosterIdentityMatched===true&&dt(rows[0].sourceCapturedAt)<=cap&&at-dt(rows[0].sourceCapturedAt)<=5400000;
}
const KICK_MARKETS=new Set(["fg_made","fg_attempts","pat_made","kicking_points"]);
function kickerFeatures(rows,market){
 if(!KICK_MARKETS.has(market))return null;
 const h=rows.slice().sort((a,b)=>a.year-b.year||a.week-b.week).slice(-20);
 if(h.length<12||new Set(h.map(x=>x.gameId)).size!==h.length||h.some(x=>![x.measures?.[market],x.measures?.fg_attempts].every(v=>Number.isInteger(v)&&v>=0)))return null;
 const values=h.map(x=>x.measures[market]);
 return {base:require("../scripts/backtest-nfl-historical-stats.cjs").forecast(values).shrunk_last5,recent5:avg(values.slice(-5)),opportunity:avg(h.slice(-10).map(x=>x.measures.fg_attempts))};
}
function kicker(p,rows,artifact,now){
 if(!KICK_MARKETS.has(p.market)||p.tier!=="Standard"||!Number.isInteger(p.season)||!Number.isInteger(p.week)||!p.historicalPlayerId||!(dt(p.eventStartsAt)-dt(now)>=900000))return null;
 const h=rows.filter(x=>x.playerId===p.historicalPlayerId&&x.team===p.team&&(x.year<p.season||x.year===p.season&&x.week<p.week)),features=kickerFeatures(h,p.market);
 const result=features&&predict("nfl_"+p.market,p.line,features,artifact,now);
 return result?{...result,conditionalOnKickerAppearance:true,activeKickerVerified:false}:null;
}
function nhl(p,history,day,artifact,now,goalieSource=null){
 if(!F["nhl_"+p.market]||p.tier!=="Standard"||!(dt(p.gameStartAt)-dt(now)>=900000))return null;
 if(p.market==="saves"&&!goalieStart(p,goalieSource,now))return null;
 if(p.market!=="points"){const q=nhlCommon(p.market,history?.players?.[String(p.playerId)]?.games||[],p.team,day);return q?predict("nhl_"+p.market,p.line,q,artifact,now):null;}
 const prior=(history?.players?.[String(p.playerId)]?.games||[]).filter(x=>x.gameDate<day&&x.type==="skater"&&x.team===p.team&&["OFF","FINAL"].includes(x.gameState)&&n(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 if(new Set(prior.map(x=>x.gameId)).size!==prior.length)return null;
 const v=require("./nhl-goal-credit-shared-ice-v1.cjs").features(prior,[],p.playerId,p.team,day),h=prior.filter(x=>Number.isInteger(x.points)).slice(-20);
 if(!v||h.length<10)return null;
 return predict("nhl_points",p.line,{recent5:avg(h.slice(-5).map(x=>x.points)),recent20:avg(h.map(x=>x.points)),goals:v.goals,assists:v.assists,shootingRate:v.shootingRate,ice:v.expectedIce},artifact,now);
}
function nfl(p,own,artifact,now){
 if(KICK_MARKETS.has(p.market)||p.tier!=="Standard"||!F["nfl_"+p.market]||!(dt(p.eventStartsAt)-dt(now)>=900000))return null;
 const h=own.slice().sort((a,b)=>a.y-b.y||a.w-b.w).slice(-20);
 if(h.length<12||h.some(x=>!n(x.value)||!n(x.opportunity))||new Set(h.map(x=>x.gameId)).size!==h.length)return null;
 const base=require("../scripts/backtest-nfl-historical-stats.cjs").forecast(h.map(x=>x.value))?.shrunk_last5;
 return predict("nfl_"+p.market,p.line,{base,recent5:avg(h.slice(-5).map(x=>x.value)),opportunity:avg(h.slice(-10).map(x=>x.opportunity))},artifact,now);
}
function readCommitted(now){
 const root=require("node:path").resolve(__dirname,".."),exec=require("node:child_process").execFileSync,paths=["outputs/research/priority-expanded-ml-artifact.json","outputs/research/priority-common-ml-artifact.json"];
 for(const p of paths)try{const at=exec("git",["log","-1","--format=%cI","HEAD","--",p],{cwd:root,encoding:"utf8",timeout:2000}).trim();if(!(dt(at)<=dt(now)))continue;const document=JSON.parse(exec("git",["show","HEAD:"+p],{cwd:root,encoding:"utf8",timeout:2000,maxBuffer:1048576}));return {document,firstCommittedAt:at};}catch{}return null;
}
module.exports={F,predict,nhl,nfl,readCommitted,nhlCommon,goalieStart,kickerFeatures,kicker,KICK_MARKETS,joinGoalieUsage};