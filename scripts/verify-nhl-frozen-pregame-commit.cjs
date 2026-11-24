"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {verifyFrozenCommit}=require("../src/nhl-frozen-commit-verifier.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function main(){
 const research=read("outputs/free-source/nhl/research-latest.json");
 const at=Date.parse(research.generatedAt);
 if(!Number.isFinite(at)||at>Date.now()||Date.now()-at>60*60000)
  throw Error("Latest research was not generated in the current pregame capture window");
 const stamp=research.generatedAt.slice(0,19).replace(/[-:]/g,"")+"Z";
 const relative="outputs/research/snapshots/"+stamp+".json";
 const snapshot=read(relative);
 const committed=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",relative],
  {cwd:ROOT,encoding:"utf8",timeout:10000}).trim();
 const historyCount=Number(execFileSync("git",["rev-list","--count","HEAD","--",relative],
  {cwd:ROOT,encoding:"utf8",timeout:10000}).trim());
 const official=read("outputs/official-nhl/season-schedules/2026-27.json");
 if(official.complete!==true)throw Error("Cached official NHL season schedule not complete");
 const proof=verifyFrozenCommit({research,snapshot,gitCommittedAt:committed,
  gitHistoryCount:historyCount,officialGames:official.games});
 console.log(JSON.stringify({frozenProspectiveCohortVerified:proof.verified,
  originalIndividualDirectionsPrecommitted:proof.eligible,
  failureReason:proof.reason,firstCommittedAt:proof.firstCommittedAt,
  snapshotFile:relative,payoutOrSettlementsVerified:false}));
 if(!proof.verified)throw Error("New NHL individual pregame selections lack immutable Git archival proof");
 return proof;
}
if(require.main===module)try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1;}
module.exports={main};
