"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process"),crypto=require("node:crypto");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {shadowFrames}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {evaluate}=require("../src/nhl-specialist-blend-research.cjs");
const {nhlProxy}=require("../src/lineup-dependence-bounds-research.cjs");
const {esports}=require("./public-eight-evidence.cjs");
function audit(root,pinned){
 const read=(r,p)=>JSON.parse(fs.readFileSync(path.join(r,p),"utf8"));
 const count=(r,p,re)=>fs.existsSync(path.join(r,p))?fs.readdirSync(path.join(r,p)).filter(n=>re.test(n)).length:0;
 const git=(r,a)=>execFileSync("git",a,{cwd:r,encoding:"utf8",timeout:20000,maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
 const history=read(root,"outputs/history/players.json"),frames=originalFrames();
 const s=shadowFrames(frames,history,{mode:"original_precommitted_only"});console.log(JSON.stringify(evaluate(s.rows)));console.log(JSON.stringify(require("../src/nhl-original-pair-dependence-research.cjs").assess(s.rows)));
 const dep=nhlProxy(history);console.log(JSON.stringify({kind:"nhl_dependence_proxy_aggregate_v1",...dep,modelPromoted:false,paidRequests:0,rawRowsPublished:0}));
 const paperPath="outputs/health/nhl-validation-and-paper-audit-latest.json";
 if(fs.existsSync(path.join(root,paperPath))){
  const d=read(root,paperPath),p=d.paperProspective||{},cal=d.calibrationTrial||{};
  if(d.kind!=="private_nhl_validation_and_paper_audit_v1"||d.modelPromoted!==false||d.optimizedLineupsApproved!==false)throw Error("Invalid paper contract");
  const groups=Object.values(cal.byGroup||{});
  const formats=Object.fromEntries(Object.entries(p.formats||{}).map(([k,v])=>[k,{registered:v.registered,decided:v.decided,pending:v.pending,voidOrMissing:v.voidOrMissing,independentSlateMinimumMet:v.independentSlateReview?.minimumMet===true,pairedEntries:v.baselineComparison?.pairedEntries??0}]));
  console.log(JSON.stringify({kind:"nhl_paper_calibration_archive_counts_v1",paperSourceAt:d.generatedAt,formats,uniqueResolvedSlates:p.uniqueCalendarSlatesResolvedAcrossFormats??null,calibrationRegistered:cal.registered??null,calibrationDecided:groups.reduce((a,x)=>a+(x.decided||0),0),calibrationGroups:groups.length,modelPromoted:false,verifiedROI:null,paidRequests:0}));
 }else console.log(JSON.stringify({kind:"nhl_paper_calibration_archive_counts_v1",status:"archive_missing",modelPromoted:false,verifiedROI:null}));
 console.log(JSON.stringify(esports(root)));
 const nbaPath="outputs/nba/research/pinnacle-injury-coverage-20261124.json",csv="outputs/nba/research/pinnacle-2026-10-24-to-31-nba.csv",prior=read(pinned,nbaPath);
 const sha=git(pinned,["rev-parse","HEAD"]);if(sha!=="d02aa363ebbfbf5619411cf46a01efcd5ddc6299"||prior.kind!=="nba_historical_injury_coverage_audit_v1"||prior.unmappedOutRows!==135||prior.archiveGames!==57)throw Error("Pinned NBA evidence mismatch");
 const bytes=fs.readFileSync(path.join(pinned,csv)),blob=crypto.createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
 if(blob!==git(pinned,["rev-parse","HEAD:"+csv]))throw Error("Pinned NBA archive blob mismatch");
 const tree=git(pinned,["ls-tree","-r","--name-only","HEAD","outputs/nba"]),paths=tree.split("\n");
 const rankings=count(root,"outputs/nba/rankings",/^\d{8}T\d{9}Z\.json$/),grades=count(root,"outputs/nba/paper-grades",/^\d{8}T\d{9}Z\.json$/);
 console.log(JSON.stringify({kind:"nba_original_archive_provenance_gap_v1",pinnedCommitVerified:true,sourceCsvBlobVerified:true,originalAuditGames:prior.archiveGames,originalAuditUnmapped:prior.unmappedOutRows,originalAuditMapped:prior.mappedOutRows,pinnedResearchFileCount:paths.filter(x=>x.startsWith("outputs/nba/research/")).length,currentRankingFiles:rankings,currentGradeFiles:grades,originalImmutableInjuryRowsVerified:false,untouchedHoldoutVerified:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0}));
}
if(require.main===module)try{const root=fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT),pin=fs.realpathSync(process.env.NBA_PINNED_ARCHIVE_ROOT);if(root===pin||root===path.resolve(__dirname,"..")||pin===path.resolve(__dirname,".."))throw Error("Private archive required");audit(root,pin);}catch{console.error("Original evidence followup failed closed");process.exitCode=1;}
