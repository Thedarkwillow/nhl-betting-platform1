"use strict";
// Read-only derivative of a single immutable private NHL freeze; never a new pick,
// never changes the ledger, never publishes source rows or calibrated confidence.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {assessNhlOpponentOpportunity}=require("../src/nhl-opponent-opportunity-gate-v1.cjs");
const {assess:assessMultifactor}=require("../src/nhl-multifactor-position-matchup-v1.cjs");
const {beforeFreeze}=require("../src/archived-prop-market-benchmark.cjs");
const ROOT=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,".."),DIR="outputs/research/snapshots",OUT="outputs/research/compact-nhl";
const TIERS=["Standard","Goblin","Demon"],dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier]);
const round=x=>Number.isFinite(x)?Number(x.toFixed(4)):null;
const prob=x=>Number.isFinite(x)&&x>0&&x<1;
const text=x=>typeof x==="string"?x.slice(0,100):null;
function summarize(s,{now,firstCommittedAt,sourcePath,sourceSha,validation=null,opponentAttemptArchives=[],oddsArchives=[]}={}){
 const t=dt(now),built=dt(s?.generatedAt),commit=dt(firstCommittedAt);
 if(!Number.isFinite(t))throw Error("Invalid export clock");
 const valid=s?.source==="partner-api.prizepicks.com"&&s?.boardFresh===true&&s?.projectionsFresh===true&&s?.boardCoverageComplete===true&&
 s?.individualPropSelectionPolicy==="nhl-individual-prop-max-available-direction-v1"&&
 Array.isArray(s.individualPropSelections)&&Array.isArray(s.rankedProps)&&
 built<=commit+999&&commit<=t&&t-built<=1800000&&commit-built<900000;
 const raw=new Map(),dupes=new Set(),shadow=new Map(),shadowDupes=new Set();
 for(const p of s?.rankedProps||[]){if(!p)continue;const k=key(p)+"|"+p.lean;
  if(raw.has(k))dupes.add(k);else raw.set(k,p);}
 const triple=s?.standardTripleChallenger;
 if(triple?.originalSnapshotGeneratedAt===s?.generatedAt&&Array.isArray(triple.rows)){
  for(const x of triple.rows){const k=key(x);if(shadow.has(k))shadowDupes.add(k);else shadow.set(k,x);}
 }
 const selected=new Map(),duplicates=new Set();
 for(const p of s?.individualPropSelections||[]){const k=key(p);if(selected.has(k))duplicates.add(k);else selected.set(k,p);}
 const rows=Object.fromEntries(TIERS.map(x=>[x,[]]));
 const audit=Object.fromEntries(TIERS.map(x=>[x,{exactLineBenchmark:0,independentExactLineBenchmark:0,incorporatedBenchmark:0,missingMatchupReasons:{}}]));
 if(valid)for(const [k,p] of selected){
  const rk=k+"|"+p.lean,r=raw.get(rk),cap=dt(p.capturedAt),start=dt(p.gameStartAt);
  if(!rows[p.tier]||duplicates.has(k)||dupes.has(rk)||!r||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
   !["Higher","Lower"].includes(p.lean)||!prob(p.probability)||p.probability<=.5||!Number.isFinite(p.line)||
   !Number.isFinite(cap)||cap>built||t-cap>1800000||!(start>t+900000)||
   r.capturedAt!==p.capturedAt||r.gameStartAt!==p.gameStartAt||r.probability!==p.probability||
   r.researchEligibility==="watchlist"||r.probabilitySafety?.researchLineupEligible===false||r.roleEvidence?.eligibleForResearchLineup===false)continue;
  const x=shadowDupes.has(k)?null:shadow.get(k);
  const m=x?.originalSelectedSide===p.lean&&x?.originalCapturedAt===p.capturedAt&&x?.gameStartAt===p.gameStartAt?x:null;
  const variant=n=>{const z=m?.variants?.[n],d=m?.decisions?.[n];return z?.status==="research_only"&&["Higher","Lower"].includes(d?.side)?{direction:d.side,projection:round(z.estimate),modelEstimate:prob(d.probability)?round(d.probability):null}:null;};
  const opponentEvidence=assessNhlOpponentOpportunity({market:p.market,line:p.line,direction:p.lean,
   projection:r.projection,observations:r.observations,opponent:p.opponent,
   capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,matchup:variant("matchup")},
   opponentAttemptArchives.filter(a=>a._firstGitAt==null||dt(a._firstGitAt)<=cap));
  const multifactor=assessMultifactor(s,p,{opponentOpportunity:opponentEvidence});
  const ac=audit[p.tier],frozen=beforeFreeze({...r,...p},oddsArchives,s.generatedAt);
  if(frozen){ac.exactLineBenchmark++;if(frozen.source==="SportsGameOdds")ac.independentExactLineBenchmark++;}
  const contextRows=(s.matchupContextReviewV1?.generatedAt===s.generatedAt?s.matchupContextReviewV1.rows||[]:[]).filter(z=>key(z)===k&&z.capturedAt===p.capturedAt&&z.gameStartAt===p.gameStartAt&&z.side===p.lean);
  const b=contextRows.length===1?contextRows[0].context?.benchmark:null;
  if(frozen&&b?.conditionalNameTeamGameLine===true&&b.books===frozen.bookCount&&b.higher===frozen.higher&&b.observedAt===frozen.quoteAt)ac.incorporatedBenchmark++;
  for(const reason of new Set([...(multifactor.reasons||[]),...(opponentEvidence.reasons||[])]))ac.missingMatchupReasons[reason]=(ac.missingMatchupReasons[reason]||0)+1;
  rows[p.tier].push({player:text(r.player),team:text(p.team),opponent:text(p.opponent),gameId:p.gameId,
   market:text(p.market),line:p.line,direction:p.lean,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   modelEstimate:round(p.probability),projection:round(r.projection),observations:Number.isInteger(r.observations)?r.observations:null,
   usage:variant("usage"),matchup:variant("matchup"),distribution:variant("distribution"),
   shotAttempts:variant("sogAttempts"),shadowAgreement:Number.isInteger(m?.researchFilter?.agreedWithOriginal)?m.researchFilter.agreedWithOriginal:null,
   multifactorMatchup:{status:multifactor.status,position:multifactor.position,
    opponentByPosition:multifactor.positionOpponent?.last10??null,
    opponentPositionFactor:multifactor.positionOpponent?.defenseFactor??null,
    ownTeamByPosition:multifactor.teamOwnPosition?.last10??null,
    playerPriorGames:multifactor.playerUsage?.priorGames??null,
    playerExpectedIceSeconds:multifactor.playerUsage?.expectedIceSeconds??null,
    coverage:multifactor.coverage??null,reasons:multifactor.reasons},
   opponentOpportunity:{kind:opponentEvidence.kind,verified:opponentEvidence.opponentOpportunityVerified,
    evidenceQualified:opponentEvidence.evidenceQualified,priorGames:opponentEvidence.opponentAttempts?.priorDistinctGames??0,
    shotAttemptsPerGame:opponentEvidence.opponentAttempts?.attemptsForPerGame??null,
    reasons:opponentEvidence.reasons},highConfidenceEligible:false,
   approvedConfidence:null,automaticRecommendationEligible:false});
 }
 const snapshots=Object.fromEntries(TIERS.map(tier=>{
  const list=rows[tier].sort((a,b)=>b.modelEstimate-a.modelEstimate||(b.observations||0)-(a.observations||0)||a.gameId-b.gameId||String(a.player).localeCompare(String(b.player)));
  return [tier,{kind:"private_nhl_compact_original_research_v1",tier,generatedAt:now,sourceSnapshot:sourcePath,sourceCommit:sourceSha,sourceResearchAt:s?.generatedAt??null,
   status:!valid?"stale_or_unverified_original_snapshot":list.length?"current_research_only":"no_eligible_future_rows",
   totalEligible:list.length,rows:list.slice(0,10),calibrated:false,originalPlatformAvailabilityVerified:false,verifiedExpectedValue:null,researchOnly:true}];
 }));
 const v=validation?.kind==="private_nhl_prospective_probability_validation_v1"?validation:null;
 return {snapshots,health:{kind:"private_nhl_compact_status_v1",generatedAt:now,sourceSnapshot:sourcePath,sourceCommit:sourceSha,
   sourceResearchAt:s?.generatedAt??null,sourceFresh:valid,eligibleByTier:Object.fromEntries(TIERS.map(k=>[k,rows[k].length])),
   positionContextVerifiedByTier:Object.fromEntries(TIERS.map(k=>[k,rows[k].filter(p=>p.multifactorMatchup?.coverage?.opponentVersusExactPosition===true).length])),
   allRequiredMatchupEvidenceByTier:Object.fromEntries(TIERS.map(k=>[k,rows[k].filter(p=>p.multifactorMatchup?.status==="historical_multifactor_research_supported").length])),
   allRequiredEvidenceIsResearchOnly:true,evidenceAuditByTier:audit,
   validationAt:v?.generatedAt??null,standardGraded:v?.allStandardDescriptive?.decided??null,standardFutureHoldout:v?.futureHoldout?.decided??null,
   standardTraining:v?.training?.decided??null,calibrated:v?.calibrated===true,releaseBlockers:v?.releaseBlockers??[],approvedConfidence:null}};
}
// Immutable source archives must have existed before the original model freeze.
// Per-offer cutoff is checked again for historical opponent evidence.
function loadEvidence(git,asOf){
 const limit=dt(asOf),opponentAttemptArchives=[],oddsArchives=[];
 if(!Number.isFinite(limit))return {opponentAttemptArchives,oddsArchives};
 function load(dir,pattern,max,visit){
  const abs=path.join(ROOT,dir);if(!fs.existsSync(abs))return;
  for(const n of fs.readdirSync(abs).filter(n=>pattern.test(n)).sort().slice(-max)){
   try{const p=dir+"/"+n,c=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(c.length!==1)continue;
    const firstCommittedAt=git(["show","-s","--format=%cI",c[0]]),t=dt(firstCommittedAt);
    if(!Number.isFinite(t)||t>limit)continue;
    const archive=JSON.parse(git(["show",c[0]+":"+p]));visit(archive,firstCommittedAt);
   }catch{}
  }
 }
 for(const dir of ["outputs/research/nhl-block-exposure-history","outputs/research/nhl-opponent-concessions-history"])
  load(dir,/^\d{4}-\d{2}-\d{2}(?:__\d+)?\.json$/,120,(archive,firstCommittedAt)=>{
   if(dt(archive.observedAt)<=dt(firstCommittedAt)+999)opponentAttemptArchives.push({...archive,_firstGitAt:firstCommittedAt});
  });
 for(const dir of ["outputs/sportsbooks/bounded-live","outputs/sportsbooks/independent-nhl"])
  load(dir,/^\d{8}T\d{9}Z\.json$/,8,(archive,firstCommittedAt)=>{
   if(limit-dt(firstCommittedAt)<=1800000)oddsArchives.push({archive,firstCommittedAt,gitHistoryCount:1});
  });
 return {opponentAttemptArchives,oddsArchives};
}
function encodeBounded(doc,limit=24000){
 const copy={...doc};if(Array.isArray(doc.rows))copy.rows=[...doc.rows];
 let data=JSON.stringify(copy)+"\n";
 while(Buffer.byteLength(data)>limit&&copy.rows?.length){copy.rows.pop();copy.byteLimitTruncated=true;data=JSON.stringify(copy)+"\n";}
 if(Buffer.byteLength(data)>limit)throw Error("compact_size");
 return data;
}
function main(){
 let stage="snapshot_scan";
 try{
 const now=new Date().toISOString(),git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:30000,maxBuffer:128*1024*1024}).trim();
 const candidates=fs.existsSync(path.join(ROOT,DIR))?fs.readdirSync(path.join(ROOT,DIR)).filter(n=>/^\d{8}T\d{6,9}Z\.json$/.test(n)).sort((a,b)=>b.replace("Z","").padEnd(20,"0").localeCompare(a.replace("Z","").padEnd(20,"0"))):[];
 let s=null,sourcePath=null,sourceSha=null,firstCommittedAt=null;
 for(const n of candidates.slice(0,20)){
  const rel=DIR+"/"+n,commits=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);
  if(commits.length!==1)continue;
  const sha=commits[0],candidate=JSON.parse(git(["show",sha+":"+rel]));
  if(candidate.source!=="partner-api.prizepicks.com")continue;
  s=candidate;sourcePath=rel;sourceSha=sha;firstCommittedAt=git(["show","-s","--format=%cI",sha]);break;
 }
 let validation=null;try{validation=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/health/nhl-prospective-validation-latest.json"),"utf8"));}catch{}
 stage="opponent_archive";
 const {opponentAttemptArchives,oddsArchives}=loadEvidence(git,s?.generatedAt);
 stage="summarize";
 const out=summarize(s,{now,firstCommittedAt,sourcePath,sourceSha,validation,opponentAttemptArchives,oddsArchives});
 stage="encode";
 const encoded=Object.entries({...out.snapshots,status:out.health}).map(([k,v])=>[k,encodeBounded(v)]);
 stage="write";
 fs.mkdirSync(path.join(ROOT,OUT),{recursive:true});
 for(const [k,data] of encoded){
  const dest=path.join(ROOT,OUT,"latest-"+k.toLowerCase()+".json");
  fs.writeFileSync(dest+".tmp",data,{mode:0o600});fs.renameSync(dest+".tmp",dest);
 }
 console.log(JSON.stringify({kind:out.health.kind,sourceFresh:out.health.sourceFresh,eligibleByTier:out.health.eligibleByTier,calibrated:out.health.calibrated}));
 }catch(e){console.error(JSON.stringify({kind:"compact_export_failure_v1",stage,errorClass:["TypeError","SyntaxError","RangeError"].includes(e?.name)?e.name:"Error",sizeLimit:e?.message==="compact_size"}));throw Error("compact_export_failed");}
}
if(require.main===module)try{main();}catch{console.error("Compact NHL export failed closed");process.exitCode=1;}
module.exports={summarize,loadEvidence,encodeBounded};
