"use strict";
// Diagnostic only: identify explicit flags behind remaining mixed drive ownership.
const fs=require("node:fs"),{dataset}=require("./build-nfl-partner-board-research.cjs");
function main(){
 const path="outputs/nfl/research/drive-exceptions-private-latest.json",ex=JSON.parse(fs.readFileSync(path,"utf8")).exceptions;
 const events=[2024,2025,2026].flatMap(y=>dataset(y,"drive_boundary_plays")),counts={},details=[],failureReasons={};
 const reconcile=require('../src/nfl-fixed-drive-reconciliation-v2.cjs').reconcile;
 for(const e of ex){const full=events.filter(x=>x.game_id===e.gameId),d=[];reconcile([],full,e.team,e.opponent,d);for(const x of d)failureReasons[x.reason]=(failureReasons[x.reason]||0)+1;}
 for(const e of ex)for(const d of e.full.drives||[]){
  const a=events.filter(x=>x.game_id===e.gameId&&x.fixed_drive===d.id).sort((a,b)=>a.play_id-b.play_id);
  const rows=a.map(x=>({playId:x.play_id,owner:x.posteam,defense:x.defteam,playType:x.play_type,try:x.two_point_attempt,extra:x.extra_point_attempt,td:x.touchdown,tdTeam:x.td_team,interception:x.interception,fumbleLost:x.fumble_lost,down:x.down,yardline:x.yardline_100,rawDrive:x.drive,result:x.fixed_drive_result}));
  const k=JSON.stringify(rows.map(x=>[x.owner===e.team?"own":x.owner===e.opponent?"opp":"none",x.playType,x.try??null,x.extra??null,x.td??null,x.interception??null,x.fumbleLost??null]));
  counts[k]=(counts[k]||0)+1;details.push({gameId:e.gameId,team:e.team,drive:d.id,rows});
 }
 fs.writeFileSync("outputs/nfl/research/drive-six-exception-audit-private.json",JSON.stringify({generatedAt:new Date().toISOString(),details,verificationChanged:false},null,2)+"\n");
 console.log(JSON.stringify({unresolvedTeamGames:ex.length,exceptionPatterns:counts,failureReasons,verificationChanged:false}));
}
if(require.main===module)main();