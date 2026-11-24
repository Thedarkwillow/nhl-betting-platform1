"use strict";
// Prior-only QB attempt alternatives. Fixed grid selected on 2025 directional
// error, not numeric MAE; evaluate 2026 separately. No actual target-game score.
const {teamVolume,passingAttempts}=require("./nfl-priority-volume-v1.cjs");
const {matchupSample}=require("./nfl-partner-board-research.cjs");
const {SPECS,forecast}=require("../scripts/backtest-nfl-historical-stats.cjs");
const num=Number.isFinite,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const earlier=(x,y,w)=>x.y<y||x.y===y&&x.w<w;
const recent=a=>.65*avg(a.slice(-5))+.35*avg(a.slice(-10));
const median=a=>{const v=[...a].sort((x,y)=>x-y),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
function scoreHistory(schedule){
 const ids=new Map();for(const g of schedule)if(g.game_id)ids.set(g.game_id,(ids.get(g.game_id)||0)+1);
 return schedule.filter(g=>ids.get(g.game_id)===1&&g.game_type==="REG"&&num(g.home_score)&&num(g.away_score)).flatMap(g=>[[g.home_team,g.away_team,g.home_score-g.away_score],[g.away_team,g.home_team,g.away_score-g.home_score]].map(([team,opp,margin])=>({gameId:g.game_id,y:Number(g.season),w:Number(g.week),team,opp,margin}))).sort((a,b)=>a.y-b.y||a.w-b.w);
}
function features(own,volume,scores,team,opp,y,w){
 const h=own.filter(x=>earlier(x,y,w)&&x.team===team&&num(x.value)).sort((a,b)=>a.y-b.y||a.w-b.w);
 if(h.length<12)return null;
 const base=forecast(h.map(x=>x.value))?.shrunk_last5;
 const v=passingAttempts(h,volume,team,opp,y,w);if(!num(base)||!v)return null;
 const hist=volume.filter(x=>earlier(x,y,w)),off=hist.filter(x=>x.team===team).slice(-10),def=hist.filter(x=>x.opponent===opp).slice(-10);
 const s=scores.filter(x=>earlier(x,y,w)),a=s.filter(x=>x.team===team).slice(-10),b=s.filter(x=>x.team===opp).slice(-10);
 if(a.length<5||b.length<5)return null;
 // Prior score differential is a noisy strength proxy, not live spread or
 // actual game script. Shrink and cap the forecast of relative strength.
 const relativeMargin=cap((recent(a.map(x=>x.margin))-recent(b.map(x=>x.margin)))*.5,-14,14);
 const directTeam=.75*recent(off.map(x=>x.attempts))+.25*recent(def.map(x=>x.attempts));
 const qbMedian=median(h.slice(-15).map(x=>x.value));
 const script=v.expectedAttemptPlusCarryVolume*cap(v.passShare-relativeMargin*.004,.30,.80)*v.qbShare;
 return {base,variants:{teamVolume:v.projection,directTeam:directTeam*v.qbShare,qbMedian,scoreStrengthProxy:script},relativeMargin,priorGames:h.length,liveStartingQBVerified:false,actualTargetGameScoreUsed:false};
}
const LINES=[24.5,29.5,34.5],GRID=[0,.25,.5,.75,1];
function study(weekly,schedule,teamWeekly,events=[]){
 const pace=require('./nfl-qb-pace-proe-v1.cjs'),ablation=require('./matchup-factor-ablation-v1.cjs'),extra=ablation.create();
 const volume=teamVolume(weekly,teamWeekly,schedule),scores=scoreHistory(schedule),spec=SPECS.find(x=>x.id==="passing_attempts"),rows=matchupSample(weekly,schedule,2027,1,spec,"QB"),old=[],train=[],holdout=[],weeks=new Map(),paceRows=pace.build(events,volume);
 for(const r of rows){const k=r.y+"|"+r.w,a=weeks.get(k)||[];a.push(r);weeks.set(k,a);}
 for(const a of weeks.values()){for(const r of a){if(r.y<2025)continue;const f=features(old.filter(x=>x.playerId===r.playerId),volume,scores,r.team,r.opponent,r.y,r.w);if(f){(r.y<2026?train:holdout).push({...f,actual:r.value,gameId:r.gameId});const v=passingAttempts(old.filter(x=>x.playerId===r.playerId),volume,r.team,r.opponent,r.y,r.w);const z=v&&pace.features(paceRows,r.team,r.opponent,r.y,r.w,v.qbShare);if(z)ablation.observe(extra,{base:f.base,actual:r.value,gameId:r.gameId,lines:LINES,train:r.y<2026,candidates:z.variants});}}old.push(...a);}
 const names=Object.keys(train[0]?.variants||{}),candidates=names.flatMap(name=>GRID.map(weight=>({name,weight})));
 const tally=(rows,c)=>{let wins=0,baseWins=0,higher=0,lower=0,mae=0,baseMae=0,n=0;const games=new Set();
 for(const r of rows){const p=r.base+c.weight*(r.variants[c.name]-r.base);if(!num(p))continue;games.add(r.gameId);n++;mae+=Math.abs(p-r.actual);baseMae+=Math.abs(r.base-r.actual);for(const l of LINES){wins+=Number(p!==l&&(p>l)===(r.actual>l));baseWins+=Number(r.base!==l&&(r.base>l)===(r.actual>l));higher+=Number(r.actual>l);lower+=Number(r.actual<l);}}
 return {appearances:n,games:games.size,thresholds:n*LINES.length,wins,baseWins,alwaysHigher:higher,alwaysLower:lower,mae:n?mae/n:null,baseMae:n?baseMae/n:null};};
 // Fit a single choice before observing holdout. Tie-break toward smaller
 // adjustment, then lower training MAE. No holdout-based choice or promotion.
 const qualified=train.length>=100&&new Set(train.map(x=>x.gameId)).size>=30;
 const ranking=candidates.map(c=>({...c,train:tally(train,c)})).sort((a,b)=>b.train.wins-a.train.wins||a.weight-b.weight||a.train.mae-b.train.mae);
 const winner=qualified?ranking[0]:null;
 return {kind:"nfl_qb_attempt_directional_holdout_v1",trainingSeason:2025,holdoutSeason:2026,paceCoverage:{reconciledTeamGames:paceRows.length,proeTeamGames:paceRows.filter(x=>x.proePlays>=.8*x.designedPlays).length,neutralTeamGames:paceRows.filter(x=>x.neutralPlays>0).length},paceFactorHoldout:ablation.summarize(extra),trainingAppearances:train.length,holdoutAppearances:holdout.length,selected:winner?{...winner,holdout:tally(holdout,winner)}:null,alternatives:candidates.filter(c=>c.weight===1).map(c=>({...c,holdout:tally(holdout,c)})),syntheticThresholdsOnly:true,conditionalOnObservedOpportunity:true,calibrated:false,modelPromoted:false};
}
module.exports={scoreHistory,features,study};
