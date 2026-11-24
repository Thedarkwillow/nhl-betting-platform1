"use strict";
const fs=require("node:fs"),path=require("node:path");
const {assess}=require("../src/nba-fixed-holdout-gate-v1.cjs");
const {prepare,replay,compare}=require("../src/nba-sdv-context-replay-v1.cjs");
const {trainCalibration,scores}=require("../src/nba-context-calibration-v2.cjs");
const root=path.resolve(__dirname,".."),base=path.join(root,"outputs/nba/authorized-providers/cohort-v1");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const list=p=>fs.existsSync(p)?fs.readdirSync(p).filter(n=>n.endsWith(".json")).sort().map(n=>path.join(p,n)):[];
const docs=season=>{const a=list(path.join(root,"outputs/nba/private-context",String(season)));return a.length?read(a.at(-1)):null;};
function run(){
 const d25=docs(2025),d26=docs(2026);
 const a25=list(path.join(base,"calibration-history")).map(read),a26=list(path.join(base,"history")).map(read);
 const r25=d25?replay(prepare(d25),a25):{rows:[],excluded:{}},r26=d26?replay(prepare(d26),a26):{rows:[],excluded:{}};
 const development=r26.rows.filter(r=>r.date<"2026-01-20"&&!(r.playerId==="3112335"&&r.market==="player_points"&&r.date<="2025-12-07")),holdout=r26.rows.filter(r=>r.date>="2026-02-01"&&r.date<="2026-04-12");
 // Fixed candidate set; no use of holdout to choose feature. Prior-season calibration
 // is a separate diagnostic for the predeclared old baseline only.
 const calibration={};
 for(const m of ["player_points","player_rebounds","player_assists","player_threes","player_points_rebounds_assists"]){
  const a=r25.rows.filter(r=>r.market===m),h=holdout.filter(r=>r.market===m);
  const fit=trainCalibration(a,"old");
  const hs=fit?h.map(r=>{const b=fit.bins[Math.min(9,Math.floor(r.old*10))];return {...r,pCal:b.n>=fit.minBin?(b.wins+10*r.old)/(b.n+10):null};}).filter(r=>Number.isFinite(r.pCal)):[];
  calibration[m]={priorSeasonRows:a.length,holdoutRows:h.length,status:fit?"retrospective_fit_only":"insufficient_calibration_evidence",raw:scores(hs,"old"),calibrated:scores(hs,"pCal"),approved:false};
 }
 return {kind:"nba_sdv_extended_real_line_audit_v1",sourceSeasons:[d25?2025:null,d26?2026:null].filter(Boolean),archiveSeries:{calibration:a25.length,main:a26.length},exclusions:{calibration:r25.excluded,main:r26.excluded},development:compare(development),holdout:compare(holdout),featureRetention:assess(r26.rows),calibration,freezeReady:false,blockers:["source rights and namespace reconciliation not independently certified","prospective offers and outcomes unverified","feature coverage and held-out performance require review"],meteredRequests:0};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run};
