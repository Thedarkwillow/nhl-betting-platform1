"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process"),{review}=require("../src/nhl-official-preview-abstention.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(now=new Date().toISOString()){
 const dir="outputs/research/snapshots",abs=path.join(root,dir),files=fs.readdirSync(abs).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().reverse();
 const fresh=files.map(n=>({file:n,snapshot:read(dir+"/"+n)})).find(x=>{const t=Date.parse(x.snapshot.generatedAt),at=Date.parse(now);return Number.isFinite(t)&&t<=at&&at-t<=45*60000;});
 let preview=null;try{preview=read("outputs/pregame-availability/official-preview-latest.json");}catch{}
 const counts={injured:0,scratched:0,ambiguous:0,unverified:0};
 let inspected=0,eligibleSnapshot=false;const blocked=[];
 let sourceFirstGitAt=null;try{if(fresh){const git=(...args)=>cp.execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:10000}).trim(),rel=dir+"/"+fresh.file;const n=Number(git("rev-list","--count","HEAD","--",rel)),first=git("log","--diff-filter=A","-1","--format=%cI","--",rel);if(n===1&&Number.isFinite(Date.parse(first))&&Date.parse(first)<=Date.parse(now)&&Date.parse(first)>=Date.parse(fresh.snapshot.generatedAt)-999)sourceFirstGitAt=first;}}catch{}
 if(fresh&&sourceFirstGitAt&&Array.isArray(fresh.snapshot.rankedProps)){
  eligibleSnapshot=true;
  const seen=new Set();
  for(const p of fresh.snapshot.rankedProps){
   const key=JSON.stringify([p.gameId,p.playerId,p.market,p.tier,p.line,p.lean]);
   if(seen.has(key))continue;seen.add(key);
   if(!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||!p.eventStartsAt||!p.team)continue;
   if(Date.parse(p.eventStartsAt)-Date.parse(now)<15*60000||Date.parse(p.eventStartsAt)<=Date.parse(sourceFirstGitAt)||Date.parse(p.capturedAt)>Date.parse(sourceFirstGitAt))continue;
   inspected++;const s=review(p,preview,now);
   if(s.blocksResearch)blocked.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
    originalFrozenLine:p.line,originalSide:p.lean,reason:s.status});
   counts[s.status]=(counts[s.status]||0)+1;
  }
 }
 const out={kind:"private_nhl_last_minute_original_board_scratch_risk_audit_v1",
  generatedAt:now,originalResearchSnapshot:fresh?.file??null,originalFirstGitCommitAt:sourceFirstGitAt,
  sourceSnapshotEligible:eligibleSnapshot,officialPreviewAt:preview?.capturedAt??null,
  inspectedUniqueSourceDirections:inspected,blockedConfirmedInjuryOrScratch:blocked.length,
  unknownIsNotCleared:true,counts,blockedPrivateOnly:blocked,
  validPregameAvailabilityProvenForEveryOtherPlayer:false,
  platformAppOfferStillAvailableUnverified:true,modelChanged:false,wagersPlaced:0};
 const target=path.join(root,"outputs/health/nhl-pregame-scratch-risk-latest.json");fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({kind:out.kind,sourceSnapshotEligible:out.sourceSnapshotEligible,inspected,blocked:blocked.length,unverified:counts.unverified,paidCalls:0}));
 return out;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
