"use strict";
/**
 * Public GitHub PrizePicks NFL mirror: point-in-time quote provenance AUDIT.
 * Third-party mirror is not an official platform or a licensed commercial
 * data service. Research aggregate audit only, no bulk copying/rehosting.
 * Git commit timestamp and provider fetch must both be BEFORE event kickoff.
 * Does not provide our model's pregame side, exact payout or settlement.
 */
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const OWNER="enkday",REPO="prizepicks-data-mirror";
const FILE="data/prizepicks-nfl.json";
const githubUrl="https://api.github.com/repos/"+OWNER+"/"+REPO+"/commits?path="+encodeURIComponent(FILE)+"&per_page=12";
const rawUrl=sha=>"https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+sha+"/"+FILE;
function stamp(v){const t=Date.parse(v);return Number.isFinite(t)?t:null;}
function checkQuote(row,snapshot,commitDate){
 const line=Number(row?.line);
 const observed=stamp(row?.providerFetchedAt||snapshot?.collectionStatus?.providerFetchedAt||snapshot?.scrapedAt);
 const start=stamp(row?.startTimeIso);
 const published=stamp(commitDate),captured=stamp(snapshot?.scrapedAt);
 if(!row||!/^\d+$/.test(String(row.projectionId||""))||
  !/^\d+$/.test(String(row.playerId||""))||!/^\d+$/.test(String(row.gameId||""))||
  typeof row.player!=="string"||typeof row.stat!=="string"||
  row.sport!=="NFL"||!Number.isFinite(line)||line<0||
  row.status!=="pre_game"||!observed||!start||!published||!captured||
  observed>captured||captured>published+60*1000||published>=start)
  return {eligible:false,reason:"identity_or_github_timestamp_not_verified"};
 if(!["standard","goblin","demon"].includes(String(row.oddsType||"").toLowerCase()))
  return {eligible:false,reason:"unknown_tier"};
 return {eligible:true,line,observedAt:new Date(observed).toISOString(),
  githubPublishedAt:new Date(published).toISOString(),
  eventStartsAt:new Date(start).toISOString(),
  platformClaim:"prizepicks",tier:row.oddsType,
  originalPlatformAuthenticated:false,selectedSide:null,
  payoutTerms: null,finalSettlement:null,precommittedPick:false};
}
function summarize(snapshot,sha,commitDate){
 if(!/^[a-f0-9]{40}$/.test(sha)||snapshot?.sport!=="NFL"||
  !Array.isArray(snapshot.props)||!stamp(snapshot.scrapedAt))
  throw Error("Invalid pinned NFL mirror snapshot");
 let prior=0,invalid=0;
 const markets={},tiers={},reasons={};
 for(const r of snapshot.props){
  const check=checkQuote(r,snapshot,commitDate);
  if(check.eligible){
   prior++;
   const m=String(r.stat);
   markets[m]=(markets[m]||0)+1;
   tiers[check.tier]=(tiers[check.tier]||0)+1;
  }else {invalid++;reasons[check.reason]=(reasons[check.reason]||0)+1;}
 }
 return {gitCommitSha:sha,gitCommitTimestamp:commitDate,sourceReportedFetchedAt:
  snapshot.collectionStatus?.providerFetchedAt||null,
  sourceReportedScrapedAt:snapshot.scrapedAt,
  originalRepo:"https://github.com/"+OWNER+"/"+REPO,
  sourcePinnedPath:FILE,
  totalOffers: snapshot.props.length,qualifiedPregameMirrorRows:prior,
  rejected:invalid,reasons,
  marketTypes:Object.keys(markets).length,
  markets,tiers,originPlatformVerified:false,
  originalModelSideFrozen:false,exactSlipPayoutVerified:false,
  finalSettlementVerified:false,
  commercialMirroredDataRightsUnverified:true};
}
async function fetchJson(url,fetcher=fetch){
 const res=await fetcher(url,{headers:{"Accept":"application/vnd.github+json",
  "User-Agent":"NFL-Research-Source-Audit/1.0"},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error("Mirror source HTTP "+res.status);
 return res.json();
}
async function run({fetcher=fetch,limit=5}={}){
 if(!Number.isInteger(limit)||limit<1||limit>12)throw Error("Mirror commit sample limit 1..12");
 const commits=await fetchJson(githubUrl,fetcher);
 if(!Array.isArray(commits))throw Error("Mirror commit API did not return list");
 const out=[],skipped=[];
 for(const c of commits.slice(0,limit)){
  const sha=c.sha,at=c.commit?.committer?.date;
  if(!/^[a-f0-9]{40}$/.test(sha||"")||stamp(at)===null){skipped.push("invalid_commit_metadata");continue;}
  try{out.push(summarize(await fetchJson(rawUrl(sha),fetcher),sha,at));}
  catch(e){skipped.push(String(e.message||e).slice(0,140));}
 }
 const total=out.reduce((n,r)=>n+r.qualifiedPregameMirrorRows,0);
 return {schemaVersion:1,kind:"public_nfl_prizepicks_git_history_pregame_quote_audit_v1",
  asOf:new Date().toISOString(),source:OWNER+"/"+REPO,
  publicRepositoryContainsNoExplicitCommercialLicenseVerified:true,
  historicalCommitSnapshotsRead:out.length,
  totalPregameQuoteRowsInSample:total,
  provenance:"self-reported partner API fetch timestamp plus independently timestamped git commit, third-party mirror",
  canAuthenticateOriginalPlatformQuotes:false,
  exactOfferedLineMarketSideExists:false,
  originallySavedModelHigherLowerPick:false,
  perSelectionPayoutTermsCaptured:false,
  originalLineFinalSettlementCaptured:false,
  validProspectiveWinningBetEvidence:false,
  snapshots:out,skipped,
  note:"Each row is a historical third-party-observed line, not a precommitted prediction. No player-level data is copied to this aggregate report."};
}
async function main(){
 const report=await run();
 const dest=path.join(ROOT,"outputs/nfl/research/free-prizepicks-github-mirror-audit.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({source:report.source,read:report.historicalCommitSnapshotsRead,
  recordedPregameQuotes:report.totalPregameQuoteRowsInSample,
  originalPlatformVerified:false,settlementAndModelSides:false,skipped:report.skipped}));
 if(report.historicalCommitSnapshotsRead<1||report.totalPregameQuoteRowsInSample<1)
  throw Error("No actual time-qualified public NFL mirror records");
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={checkQuote,summarize,run,rawUrl,githubUrl};
