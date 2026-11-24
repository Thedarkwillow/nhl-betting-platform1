"use strict";
const {dataset}=require("./build-nfl-partner-board-research.cjs"),{matchupSample}=require("../src/nfl-partner-board-research.cjs"),{SPECS,forecast}=require("./backtest-nfl-historical-stats.cjs"),{project}=require("../src/nfl-receiver-dropback-participation-v1.cjs");
function main(){
 const years=[2024,2025,2026],weekly=years.flatMap(y=>dataset(y,"player_weekly")),schedule=years.flatMap(y=>dataset(y,"schedule")),participation=[2024,2025].flatMap(y=>dataset(y,"receiver_dropback_participation"));
 const spec=SPECS.find(x=>x.id==="receiving_yards"),results={};
 for(const pos of ["WR","TE","RB"]){
  const rows=matchupSample(weekly,schedule,2027,1,spec,pos),a={appearances:0,games:new Set(),baselineMAE:0,proxyMAE:0,thresholds:0,baseWins:0,proxyWins:0,alwaysHigher:0,alwaysLower:0};
  for(const r of rows.filter(x=>x.y===2026)){
   const h=rows.filter(x=>x.playerId===r.playerId&&x.team===r.team&&(x.y<r.y||x.y===r.y&&x.w<r.w));
   const b=forecast(h.map(x=>x.value))?.shrunk_last5,p=project(h,participation,r.playerId,r.team,r.y,r.w);
   if(!Number.isFinite(b)||!p)continue;
   a.appearances++;a.games.add(r.gameId);a.baselineMAE+=Math.abs(b-r.value);a.proxyMAE+=Math.abs(p.projection-r.value);
   for(const l of [24.5,49.5,74.5]){a.thresholds++;a.baseWins+=Number((b>l)===(r.value>l));a.proxyWins+=Number((p.projection>l)===(r.value>l));a.alwaysHigher+=Number(r.value>l);a.alwaysLower+=Number(r.value<l);}
  }
  results[pos]={...a,games:a.games.size,baselineMAE:a.appearances?a.baselineMAE/a.appearances:null,proxyMAE:a.appearances?a.proxyMAE/a.appearances:null};
 }
 console.log(JSON.stringify({receiverParticipationHoldout:results,historicalSyntheticThresholdsOnly:true,conditionalOnTargetAppearance:true,actualRoutesVerified:false,modelPromoted:false}));
}
if(require.main===module)main();
