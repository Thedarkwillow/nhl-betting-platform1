"use strict";
/**
 * NHL+NFL PrizePicks Game Lines quote importer.
 * Requires a legitimate, authorized provider export to be supplied as a file.
 * A successful import does NOT authenticate the original source by itself.
 * It cannot make Game Lines live, change official offers or place a wager.
 */
const fs=require("node:fs"),path=require("node:path");
const {assertTeamPick}=require("../src/prizepicks-game-lines.cjs");
const ROOT=path.resolve(__dirname,"..");
function pacificDate(d){
 return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function normalizeExport(payload,{now=new Date(),sport}={}){
 if(!["NHL","NFL"].includes(sport)||!Array.isArray(payload?.offers)||
    !payload.offers.length||payload.offers.length>5000)
  throw Error("Nonempty finite NHL/NFL authorized Team Pick export required");
 const offers=[],ids=new Set();
 for(const rec of payload.offers){
  if(rec.sport!==sport)throw Error("Cross-league Game Lines injection blocked");
  const quote=assertTeamPick(rec,{now});
  const identity=[rec.originalSourceOfferId,rec.market,rec.selection,
   rec.observedAt].join("|");
  if(ids.has(identity))throw Error("Duplicate original Game Line observation");
  ids.add(identity);offers.push(quote);
 }
 return {schemaVersion:1,kind:"prizepicks_team_picks_authorized_export_research_only",
  sport,marketTypes:["team_win","team_spread","game_total"],
  importedAt:now.toISOString(),
  datePacific:pacificDate(now),
  sourceDeclaration:payload.sourceDescription??null,
  providerIdentityIndependentlyVerified:false,
  noLicensedLiveTeamPickConnector:true,
  notACompleteLiveBoard:true,
  exactLineCount:offers.length,archivedFromAuthorizedFileOnly:true,
  platformOriginalOfferVerified:false,
  modelProbabilitiesComputed:false,autoPickEligible:false,
  mixedNhlTeamPicksEligibilityVerified:false,
  offers};
}
function writeArchive(payload,{now=new Date(),sport,root=ROOT}={}){
 const report=normalizeExport(payload,{now,sport});
 const filename=path.join(root,"outputs/game-lines/prizepicks",
  sport,report.datePacific,"manual-"+now.toISOString().replace(/[:.]/g,"-")+".json");
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 fs.writeFileSync(filename,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 return {path:filename,count:report.exactLineCount,sport,verifiedLive:false};
}
if(require.main===module){
 try{
  const sport=process.argv[2],filename=process.argv[3];
  if(!sport||!filename)throw Error("Usage: node scripts/import-prizepicks-game-lines.cjs NHL|NFL ./authorized-team-picks.json");
  console.log(JSON.stringify(writeArchive(JSON.parse(fs.readFileSync(filename,"utf8")),{sport})));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={pacificDate,normalizeExport,writeArchive};
