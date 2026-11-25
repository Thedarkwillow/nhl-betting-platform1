"use strict";
// Private pilot evidence only: counts and candidate name/line overlap, never identity certification.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),zlib=require("node:zlib"),{execFileSync}=require("node:child_process");
const {normalize}=require("./pickfinder-premium-archive.cjs");
const {files,validate}=require("./private-source-history-connections.cjs");
const {COLUMNS,offeredSides}=require("../src/partner-prizepicks-board.cjs");
const {market}=require("../src/nba-research-pipeline-v1.cjs");
const {immutableMaps}=require("./chronological-player-stat-audit.cjs");
const pilot="research/pickfinder-premium/2026-11-25/manual/browser-pilot-bb60508f.json.gz.b64";
const commit="c8e75087e2216b7347ef064c79876023b0696255",blob="06cde35845919e2ab185fbfaa03f31ff7a5cfb15";
const canon=x=>typeof x==="string"?x.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,""):"";
const valid=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const sum=(o,k)=>o[k]=(o[k]||0)+1;
function audit(doc,history,board,maps=[]){
 if(!doc||!Array.isArray(doc.partitions)||doc.partitions.length!==16)throw Error("pilot envelope");
 const groups={},names=new Map(),direct=new Map(),mapNames=new Map(),seen=new Set();
 for(const r of history){const n=canon(r.player);if(!n||!r.playerId)continue;if(!names.has(n))names.set(n,new Set());names.get(n).add(String(r.playerId));}
 for(const raw of board.rows||[]){
  if(!Array.isArray(raw)||raw.length!==COLUMNS.length)continue;
  const r=Object.fromEntries(COLUMNS.map((k,i)=>[k,raw[i]]));
  const m=market(r.market),n=canon(r.player);if(!m||!n||!Number.isFinite(r.line)||r.period!=="Full"||r.status!=="pre_game"||r.inGame!==false||r.isLive!==false||r.combo!==false)continue;
  for(const side of offeredSides(r.tier,r.offeredWagerTypes)){const key=JSON.stringify([n,m,r.line,canon(r.tier),side]);if(!direct.has(key))direct.set(key,[]);direct.get(key).push(r);}
 }
 for(const r of maps){const n=canon(r.playerName);if(!n||!r.playerId)continue;const k=r.title+"|"+n;if(!mapNames.has(k))mapNames.set(k,new Set());mapNames.get(k).add(String(r.playerId));}
 let offers=0,research=0,unresolved=0,sourceRows=0,normalizationDifferences=0;
 for(const p of doc.partitions){
  const original=p.normalized,n=normalize(p.source);
  const k=n.sport+"|"+n.book;if(seen.has(k)||n.slot!=="manual")throw Error("duplicate partition or invalid pilot slot");seen.add(k);
  if(original.schema!==n.schema||original.book!==n.book||original.sport!==n.sport||original.offers.length!==n.offers.length||original.researchObservations.length!==n.researchObservations.length)normalizationDifferences++;
  const g=groups[k]={offers:n.offers.length,research:n.researchObservations.length,unresolved:n.health.unresolvedRows,boardState:n.boardState,fields:{},missing:{},nameCandidates:{},sourceOverlap:{},originalOffersVerified:0,forecastEligible:0};
  offers+=n.offers.length;research+=n.researchObservations.length;unresolved+=n.health.unresolvedRows;sourceRows+=n.health.appearances;
  for(const o of n.offers){
   for(const f of ["eventId","startAt","period","mapRange","gameMode","tier","displayedPrice"])if(o[f]===null)sum(g.missing,f);
   if(n.sport==="nba"){
    const name=canon(o.player),ids=names.get(name);sum(g.nameCandidates,!ids?"missing":ids.size===1?"uniqueHistoricalName":"ambiguous");
    const m=market(o.market),matches=direct.get(JSON.stringify([name,m,o.line,canon(o.tier),o.side]))||[];
    // A name and identical line are only candidate corroboration, not event ID or original app proof.
    const near=matches.filter(r=>valid(o.observedAt)&&valid(board.capturedAt)&&Math.abs(Date.parse(o.observedAt)-Date.parse(board.capturedAt))<=900000&&valid(r.eventStartsAt)&&Date.parse(r.eventStartsAt)>Date.parse(o.observedAt));
    sum(g.sourceOverlap,near.length===1?"uniqueNearTimeNameLineTierSide":near.length?"ambiguousNearTime":"noNearTimeExactKey");
   }else if(["cs2","valorant","lol","dota2","cod"].includes(n.sport)){
    const ids=mapNames.get(n.sport.toUpperCase()+"|"+canon(o.player));sum(g.nameCandidates,!ids?"missing":ids.size===1?"uniqueMapName":"ambiguous");
   }
  }
  for(const r of n.researchObservations){sum(g.fields,r.origin);if(r.value===null)sum(g.missing,"researchValue");}
 }
 return {kind:"pickfinder_pilot_independent_audit_v1",partitions:seen.size,offers,research,unresolved,sourceRows,normalizationDifferences,groups,historyRows:history.length,verifiedMapRows:maps.length,originalOffersVerified:0,playerIdentitiesVerified:0,forecastFreezeVerified:false,manualPilotOnly:true,paidRequests:0,rawRowsPublished:0};
}
function main(root){
 const git=(args)=>execFileSync("git",args,{cwd:root,timeout:30000,maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]});
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git")))throw Error("private checkout required");
 if(git(["rev-parse",commit+":"+pilot]).toString().trim()!==blob||git(["rev-parse","HEAD:"+pilot]).toString().trim()!==blob)throw Error("pilot pin mismatch");
 const raw=git(["show",commit+":"+pilot]);
 if(crypto.createHash("sha1").update("blob "+raw.length+"\0").update(raw).digest("hex")!==blob)throw Error("pilot bytes mismatch");
 const doc=JSON.parse(zlib.gunzipSync(Buffer.from(raw.toString().trim(),"base64"),{maxOutputLength:32*1024*1024}));
 const history=[];
 for(const [season,name,sha] of files){const p=path.join(root,"outputs/nba/history",season,name);const bytes=fs.readFileSync(p);validate(bytes,season,sha);history.push(...JSON.parse(bytes).rows);}
 const board=JSON.parse(git(["show","fa80c41c103b8ccf401f46e1b19a74aa790ddece:outputs/nba/boards/20261125T075816293Z.json"]));
 if(board.kind!=="nba_private_partner_board_v1"||!Array.isArray(board.rows))throw Error("NBA board contract");
 console.log(JSON.stringify(audit(doc,history,board,immutableMaps(root))));
}
if(require.main===module){try{main(fs.realpathSync(process.argv[2]));}catch{console.error("PickFinder private pilot audit failed closed");process.exitCode=1;}}
module.exports={audit};
