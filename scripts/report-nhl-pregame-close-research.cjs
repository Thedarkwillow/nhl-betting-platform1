"use strict";
// Offline audit of original partner-board snapshots, no new provider calls.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {eligibleManifest,loadStoredNhl}=require("../src/nhl-sog-line-movement.cjs");
const {compare}=require("../src/pregame-source-close-research.cjs");
const root=path.resolve(__dirname,".."),dir="outputs/manual-board-captures",dt=Date.parse;
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.lean,p.capturedAt]);
function main(now=new Date().toISOString()){
 const cutoff=dt(now)-7*86400000,archives=[],reject={};const skip=k=>reject[k]=(reject[k]||0)+1;
 for(const day of fs.readdirSync(path.join(root,dir)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&dt(x+"T23:59:59Z")>=cutoff)){
  for(const stamp of fs.readdirSync(path.join(root,dir,day)).filter(x=>/^\d{8}T\d{6}Z$/.test(x))){
   const rel=path.join(dir,day,stamp),prefix=path.join(root,rel);
   try{const m=JSON.parse(fs.readFileSync(path.join(prefix,"manifest.json")));if(!eligibleManifest(m))continue;
    const ref=execFileSync("git",["log","--format=%H%x09%cI","--",rel+"/manifest.json"],{cwd:root,encoding:"utf8",timeout:12000}).trim().split("\n");
    if(ref.length!==1)continue;const [hash,first]=ref[0].split("\t");
    if(!hash||dt(first)<dt(m.captureFinishedUTC)-1500||dt(first)>dt(now))continue;
    // All chunk files must share the one original archive commit, and that
    // commit must still contain their exact current blobs.
    const entry=m.sports.find(x=>x.sport==="NHL");
    let proven=true;for(let i=1;i<=entry.parts;i++){const file=rel+"/nhl-"+String(i).padStart(2,"0")+".json";
     const log=execFileSync("git",["log","--format=%H","--",file],{cwd:root,encoding:"utf8",timeout:12000}).trim();
     if(log!==hash){proven=false;break;}}
    if(!proven)continue;
    const board=loadStoredNhl(rel,{root,now:m.captureFinishedUTC});if(board.completePagination!==true||board.sourceStatus!=="fresh")continue;
    const map=new Map();for(const x of board.rows){const a=map.get(x.projectionId)||[];a.push({...x,completeOriginalBoard:true,singleGitAddition:true,firstCommittedAt:first});map.set(x.projectionId,a);}
    archives.push({at:board.boardAsOfAt,map});
   }catch{skip("archive_refused");}
  }
 }
 const counts={},seen=new Set();
 for(const f of originalFrames().sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(s.source!=="partner-api.prizepicks.com"||f.gitHistoryCount!==1||!Number.isFinite(dt(f.firstCommittedAt))||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps))continue;
  for(const p of s.individualPropSelections){if(dt(p.gameStartAt)<cutoff||dt(p.gameStartAt)>dt(now)||dt(p.gameStartAt)-dt(f.firstCommittedAt)<900000)continue;
   const k=key(p);if(seen.has(k))continue;seen.add(k);
   const ranked=s.rankedProps.filter(x=>key(x)===k);if(ranked.length!==1){skip("ambiguous_original_model_row");continue;}
   const x=ranked[0], originalBoards=archives.filter(z=>z.at===p.capturedAt);
   if(originalBoards.length!==1){skip("original_board_not_proven");continue;}
   const match=(originalBoards[0].map.get(x.projectionId)||[]).filter(y=>y.providerPlayerId===x.providerPlayerId&&y.providerGameId===x.providerGameId&&y.eventStartsAt===p.eventStartsAt&&y.tier===p.tier&&y.side===p.lean&&y.line===p.line);
   if(match.length!==1||dt(match[0].firstCommittedAt)>dt(f.firstCommittedAt)){skip("exact_original_source_row_not_proven");continue;}
   const result=compare({...match[0],firstCommittedAt:f.firstCommittedAt},archives.flatMap(z=>z.map.get(x.projectionId)||[]));
   const label=p.tier, a=counts[label]??={originalExact:0,nearStart:0,earlierOnly:0,missing:0,favorable:0,unfavorable:0,unchanged:0};
   a.originalExact++;
   if(result.status==="near_start_source_observation"){a.nearStart++;a.favorable+=Number(result.signedThresholdMovement>0);a.unfavorable+=Number(result.signedThresholdMovement<0);a.unchanged+=Number(result.signedThresholdMovement===0);}
   else if(result.status==="earlier_source_observation_not_close")a.earlierOnly++;else a.missing++;
  }
 }
 const report={kind:"private_nhl_pregame_source_close_research_v1",generatedAt:now,windowDays:7,verifiedArchives:archives.length,byTier:counts,excluded:reject,authenticatedClose:false,modelPromoted:false,originalPlatformSettlementVerified:false};
 const file=path.join(root,"outputs/health/nhl-pregame-source-close-latest.json");fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+"\n");
 return report;
}
if(require.main===module)try{main();console.log("PASS: private archive movement audit completed without provider calls");}catch(e){console.error("Archive research audit failed");process.exitCode=1;}
module.exports={main};
