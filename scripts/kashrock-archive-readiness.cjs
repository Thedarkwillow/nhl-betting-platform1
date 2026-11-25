"use strict";
// Offline read-only aggregate audit. Source identifiers are never output.
// Does not verify original availability, grade bets, or freeze predictions.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {parseProjectionToken}=require("./prizepicks-projection-token.cjs");
const date=x=>typeof x==="string"&&/(Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const string=x=>typeof x==="string"&&x.length>0&&x.length<=300;
const key=x=>JSON.stringify([x.book,x.providerEventId,x.providerPlayerId,x.market,x.maps,x.line]);
const sideKey=x=>JSON.stringify([key(x),x.side]);
const safe=x=>x&&x.provider==="KashRock"&&["prizepicks","underdog"].includes(x.book)&&["providerPropId","providerPlayerId","providerEventId"].every(k=>string(x[k]))&&["kills","headshotKills","deaths","assists","killsPlusAssists"].includes(x.market)&&Array.isArray(x.maps)&&x.maps.length>0&&x.maps.length<=5&&x.maps.every((v,i)=>Number.isInteger(v)&&v>=1&&v<=5&&(!i||v===x.maps[i-1]+1))&&Number.isFinite(x.line)&&x.line>=0&&Number.isInteger(x.line*2)&&["Higher","Lower"].includes(x.side)&&Number.isInteger(x.sourceAgeSeconds)&&x.sourceAgeSeconds>=0&&x.sourceAgeSeconds<=900&&Number.isFinite(date(x.observedAt))&&date(x.startAt)>=date(x.observedAt)+900000&&x.originalOfferVerified===false&&x.bettingEligible===false;
function audit(files,now){
 const rows=[],bad={files:0,rows:0},put=(m,k,v)=>{if(!m.has(k))m.set(k,new Set());m.get(k).add(v);};
 for(const f of files){
  if(f?.kind!=="restricted_kashrock_source_observations_v1"||f.originalOffersVerified!==false||!Array.isArray(f.rows)||f.rows.length>20000){bad.files++;continue;}
  for(const x of f.rows){if(!safe(x)){bad.rows++;continue;}rows.push(x);}
 }
 const ids=new Map(),projectionIds=new Map(),propIds=new Map(),events=new Map(),sides=new Set(),props=new Set(),markets={};let candidates=0,fixtureRows=0,tokenRejected=0;
 for(const x of rows){const k=key(x);props.add(k);sides.add(sideKey(x));put(propIds,x.providerPropId,k);put(events,x.providerEventId,date(x.startAt));if(x.sourceFixtureMatched===true)fixtureRows++;
  if(x.originalSelectionIdCandidate!=null){const t=x.book==="prizepicks"?parseProjectionToken(x.originalSelectionIdCandidate,x.side,x.line):null;if(t){candidates++;put(ids,x.originalSelectionIdCandidate,k);put(projectionIds,t.projectionIdCandidate,JSON.stringify([x.providerEventId,x.providerPlayerId,x.market,x.maps]));}else tokenRejected++;}
  const m=x.book+":"+x.market+":"+x.maps.join(",");markets[m]=(markets[m]||0)+1;
 }
 const timing={upcoming:0,startedOrUnverified:0,conflictingStart:0};
 for(const v of events.values()){if(v.size!==1)timing.conflictingStart++;else if([...v][0]>date(now))timing.upcoming++;else timing.startedOrUnverified++;}
 return {kind:"restricted_kashrock_archive_readiness_v1",archiveFiles:files.length-bad.files,archivedRows:rows.length,uniqueNumericalProps:props.size,uniqueDirectionalOffers:sides.size,selectionCandidateRows:candidates,distinctSelectionIdCandidates:ids.size,conflictingSelectionIdCandidates:[...ids.values()].filter(v=>v.size>1).length,distinctProjectionIdCandidates:projectionIds.size,conflictingProjectionIdCandidates:[...projectionIds.values()].filter(v=>v.size>1).length,rejectedSelectionTokens:tokenRejected,providerPropIdsWithMultipleThresholdKeys:[...propIds.values()].filter(v=>v.size>1).length,providerEvents:events.size,sourceFixtureMatchedRows:fixtureRows,eventTiming:timing,marketObservationCounts:markets,rejected:bad,originalOffersVerified:0,independentPlayerIdentitiesVerified:0,scoringRulesVerified:0,finalResultsVerified:0,frozenPredictions:0,decidedPredictions:0,platformSettlementVerified:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
function main(root){
 const dir="research/kashrock-source-captures",base=path.join(root,dir),git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:16*1024*1024}).trim();
 const files=[];let rejectedImmutable=0;
 for(const n of fs.readdirSync(base).filter(x=>/^\d+-\d+\.json$/.test(x)).sort().slice(-90)){
  try{const rel=dir+"/"+n,p=path.join(root,rel);if(fs.lstatSync(p).isSymbolicLink()||fs.statSync(p).size>8_000_000)throw Error();const c=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);if(c.length!==1||git(["status","--porcelain","--",rel]))throw Error();files.push(JSON.parse(git(["show",c[0]+":"+rel])));}catch{rejectedImmutable++;}
 }
 console.log(JSON.stringify({...audit(files,new Date().toISOString()),rejectedImmutable}));
}
if(require.main===module){try{main(process.argv[2]);}catch{console.error("Restricted archive unavailable or invalid");process.exitCode=1;}}
module.exports={audit};
