"use strict";
/**
 * Replay only the already archived, complete, independent-source NHL boards.
 * Usage: node scripts/replay-nhl-board-ledger.cjs [--write]
 * Default mode is a read-only validation report; --write creates private
 * immutable normalized observations and unverified source-change events.
 * This command never calls a provider, bills credits or makes a wager.
 */
const fs=require("node:fs"),path=require("node:path");
const {buildLedger,persistLedger}=require("../src/nhl-immutable-board-ledger.cjs");
const root=path.resolve(__dirname,"..");
const archiveDir=path.join(root,"outputs/free-source/nhl/snapshots");
const ledgerDir=path.join(root,"outputs/private-nhl-ledger");
function main(args=process.argv.slice(2)){
 if(args.some(a=>a!=="--write")||args.filter(a=>a==="--write").length>1)
  throw Error("Only the optional --write argument is supported");
 const files=fs.existsSync(archiveDir)?fs.readdirSync(archiveDir).
  filter(f=>/^\d{8}T\d{6}Z\.json$/.test(f)).sort():[];
 const archives=files.map(f=>({
  path:"outputs/free-source/nhl/snapshots/"+f,
  board:JSON.parse(fs.readFileSync(path.join(archiveDir,f),"utf8"))
 }));
 const ledger=buildLedger(archives);
 const result=args.includes("--write")?persistLedger(ledgerDir,ledger):
  {newFiles:0,unchangedFiles:0,snapshots:ledger.snapshots.length};
 const summary={schemaVersion:1,kind:ledger.kind,sourceSnapshotFiles:files.length,
  completeSnapshots:ledger.snapshots.length,
  normalizedOfferObservations:ledger.snapshots.reduce((n,s)=>n+s.observations.length,0),
  unverifiedObservedChanges:ledger.snapshots.reduce((n,s)=>n+s.events.length,0),
  originalPlatformRemovalsVerified:0,
  verifiedPlatformSettlementCount:0,
  providerCalls:0,paidCredits:0,persisted:args.includes("--write"),...result};
 console.log(JSON.stringify(summary));return summary;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
