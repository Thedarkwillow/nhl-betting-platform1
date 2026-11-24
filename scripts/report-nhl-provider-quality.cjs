"use strict";
const fs=require("node:fs"),path=require("node:path");
const {auditProviderQuality}=require("../src/nhl-provider-quality-manifest.cjs");
const ROOT=path.resolve(__dirname,".."),OUTPUT=
 path.join(ROOT,"outputs/health/nhl-provider-quality-latest.json");
const read=relative=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,relative),"utf8"));}
 catch{return null;}};
function reportFromArchive({now=new Date().toISOString()}={}){
 const statsdir=path.join(ROOT,"outputs/player-stats"),files=
  fs.existsSync(statsdir)?fs.readdirSync(statsdir).filter(x=>
   /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort():[];
 return auditProviderQuality({now,
  primary:read("outputs/free-source/nhl/latest.json"),
  backup:read("outputs/prizepicks-backup/nhl/latest.json"),
  grading:read("outputs/grading/nhl-latest.json"),
  officialStats:files.length?read("outputs/player-stats/"+files.at(-1)):null});
}
function main(){
 const r=reportFromArchive();
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
 fs.writeFileSync(OUTPUT,JSON.stringify(r,null,2)+"\n");
 const pp=r.providers.primary,alt=r.providers.backup;
 const summary=[
  "# NHL Private Provider Quality (read-only)",
  "",
  "No odds, fantasy-provider, or paid API calls were made.",
  "",
  "| Evidence | Latest archive status |",
  "|---|---|",
  "| Primary PrizePicks-labelled feed | "+(pp.generatedAt||"missing")+
    " · "+(pp.ageMinutes??"unknown")+"m old · "+
    (pp.freshForResearch?"current":"not-current")+" |",
  "| Alternative NHL event subset | "+(alt.generatedAt||"missing")+
    " · "+(alt.ageMinutes??"unknown")+"m old · "+
    (alt.freshForResearch?"current":"not-current")+" |",
  "| Primary observed rows | "+pp.sourceRows+" |",
  "| Alternative observed rows | "+alt.sourceRows+" |",
  "| Official last complete NHL final games | "+
    (r.officialFinals.latestDate||"unknown")+" · "+
    (r.officialFinals.complete?"yes":"not confirmed")+" |",
  "| Original precommitted picks graded | "+r.prospective.decided+" |",
  "| Original-platform settlements authenticated | No |",
  "| Source quality issues | "+r.actionNeeded.join(", ")+" |",
  "",
  "An absent backup is not a completed run; old credits remaining are not a live balance. A successful workflow does not itself establish a complete or current board.",
  ""
 ].join("\n");
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+"\n");
 console.log(JSON.stringify({primaryFresh:pp.freshForResearch,
  backupFresh:alt.freshForResearch,prospectiveDecided:r.prospective.decided,
  officialFinalsComplete:r.officialFinals.complete,
  issueCount:r.actionNeeded.length,
  providerRequests:0,providerCreditsSpent:0,wagersPlaced:0}));
 return r;
}
if(require.main===module)try{main()}catch(e){
 console.error("::error::NHL private provider quality audit failed: "+e.message);
 process.exitCode=1;
}
module.exports={main,reportFromArchive};
