"use strict";
const fs=require("node:fs"),path=require("node:path");
const {diffFreeBoards}=require("../src/nhl-free-line-movement.cjs");
const {summarizeMorningNhlDelta,selectMorningBaselineFilename}=require("../src/nhl-morning-source-delta.cjs");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/free-source/nhl");
function main(){
 const prevdir=path.join(dir,"snapshots"),files=fs.readdirSync(prevdir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort();
 const current=JSON.parse(fs.readFileSync(path.join(dir,"latest.json"),"utf8"));
 const previous=files.length>=2?JSON.parse(fs.readFileSync(path.join(prevdir,files[files.length-2]),"utf8")):null;
 const movement=previous?diffFreeBoards(previous,current):{previousAt:null,currentAt:current.generatedAt,removalsVerified:false,
  changes:[],summary:{increased:0,decreased:0,newOffers:0,notSeenUnverified:0},warning:"Awaiting second archived independent feed snapshot"};
 // Keep the generic chronological diff against the immediate predecessor,
 // but the 09:25 audit must use THAT DAY'S 06:00 capture, not the penultimate
 // archive; intervening snapshots can otherwise conceal actual additions.
 const baseline=selectMorningBaselineFilename(files,current.generatedAt);
 const early=baseline?JSON.parse(fs.readFileSync(path.join(prevdir,baseline),"utf8")):null;
 movement.morningDelta=summarizeMorningNhlDelta(early,current);
 if(movement.morningDelta.status==="valid_independent_source_delta_only")
  console.log(JSON.stringify({morningDeltaOnly:true,
   source:"independent_archived_observations",
   ...movement.morningDelta.summary}));
 else console.log(JSON.stringify({morningDeltaOnly:false,
  reason:movement.morningDelta.reason,
  newPaidRequestsByDeltaAnalyzer:0}));
 const output=path.join(dir,"movement-latest.json");
 fs.writeFileSync(output,JSON.stringify(movement,null,2)+"\n");
 const archive=path.join(dir,"movement-snapshots");
 fs.mkdirSync(archive,{recursive:true});
 const stamp=String(current.generatedAt).slice(0,19).replace(/[-:]/g,"")+"Z";
 if(!/^\d{8}T\d{6}Z$/.test(stamp))throw Error("Invalid snapshot time for append-only movement archive");
 fs.writeFileSync(path.join(archive,stamp+".json"),JSON.stringify(movement,null,2)+"\n");
 console.log(JSON.stringify(movement.summary));
}
if(require.main===module)main();
module.exports={main};
