"use strict";
// Private, read-only input contracts; only immutable aggregates may leave the runner.
// A reviewed source envelope is a claim requiring independent source review,
// not a substitute for platform settlement. No network calls in this script.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const model=require("../src/esports-research-v1.cjs");
const at=Date.parse,sha=x=>crypto.createHash("sha256").update(x).digest("hex"),hash=x=>sha(JSON.stringify(x));
const dirs={offers:"outputs/esports/authorized-original-offers",maps:"outputs/esports/authorized-map-statistics",freeze:"outputs/esports/prospective-frozen"};
const realRoot=path.resolve(__dirname,"..");
function load(root,dir){
 const base=path.join(root,dir),out=[],counts={read:0,rejected:0};
 if(!fs.existsSync(base))return {out,counts};
 const git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:12*1024*1024}).trim();
 for(const name of fs.readdirSync(base).filter(x=>/^[A-Za-z0-9_-]{1,120}\.json$/.test(x)).sort().slice(-200)){
  const rel=dir+"/"+name;
  try{
   const p=path.join(root,rel);if(fs.lstatSync(p).isSymbolicLink()||fs.statSync(p).size>8_000_000)throw Error("file");
   const commits=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);
   if(commits.length!==1||git(["status","--porcelain","--",rel]))throw Error("not immutable");
   const first=git(["show","-s","--format=%cI",commits[0]]),raw=git(["show",commits[0]+":"+rel]);
   if(!Number.isFinite(at(first)))throw Error("clock");
   out.push({doc:JSON.parse(raw),first,digest:sha(raw),commit:commits[0]});counts.read++;
  }catch{counts.rejected++;}
 }
 return {out,counts};
}
const sourceHash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const verifiedMap=r=>model.validMap(r)&&r.sourceAuthorized===true&&r.officialFinalVerified===true&&r.scoringContractVerified===true&&sourceHash(r.sourceDocumentSha256)&&r.scheduleDispositionVerified===true&&r.chronobreakResolved===true&&r.forfeit===false&&(["CS2","VALORANT"].includes(r.title)?r.overtimeIncluded===true&&r.participationThresholdVerified===true:r.playedFullMap===true);
function collectMaps(files){
 const rows=[];
 for(const x of files){
  const d=x.doc;
  if(d?.kind!=="authorized_esports_map_statistics_v1"||d.sourceAuthorized!==true||d.independentReviewVerified!==true||!sourceHash(d.sourceDocumentSha256)||!Array.isArray(d.rows)||d.rows.length>50000)continue;
  for(const r of d.rows)if(verifiedMap(r)&&r.sourceDocumentSha256===d.sourceDocumentSha256&&at(r.observedAt)<=at(x.first))rows.push({...r,archiveFirstGitAt:x.first,archiveDigest:x.digest});
 }
 // Identical copies may recur; conflicting semantic records cannot be selected.
 const dedup=new Map(),bad=new Set();
 for(const r of rows){const k=JSON.stringify([r.title,r.seriesId,r.mapIndex,r.playerId]);const semantic=hash([r.title,r.seriesId,r.mapIndex,r.playerId,r.teamId,r.opponentId,r.ruleset,r.startAt,r.endAt,r.exposure,r.exposureUnit,r.stats,r.edition,r.mode]);const prev=dedup.get(k);
  if(prev&&prev.semantic!==semantic){bad.add(k);continue;}if(!prev||at(r.archiveFirstGitAt)<at(prev.r.archiveFirstGitAt))dedup.set(k,{r,semantic});
 }
 return [...dedup].filter(([k])=>!bad.has(k)).map(([,x])=>x.r);
}
const identity=o=>hash([o.platform,o.title,o.offerId,o.seriesId,o.playerId,o.market,o.maps,o.line,o.tier,o.ruleVersion,o.ruleset]);
const validSourceOffer=o=>model.validOffer(o)&&o.originalPlatformOfferVerified===true&&o.authorizedExportVerified===true;
function originalOffers(files){
 const out=[];
 for(const x of files){
  const d=x.doc;
  if(d?.kind!=="authorized_esports_original_offer_export_v1"||d.authenticatedExportTransport!==true||d.isDemo!==false||!sourceHash(d.sourceResponseSha256)||!Array.isArray(d.rows)||d.rows.length>5000)continue;
  for(const o of d.rows)if(validSourceOffer(o)&&o.platform===d.platform&&at(o.capturedAt)<=at(d.capturedAt)&&at(d.capturedAt)<=at(d.receivedAt)&&at(d.receivedAt)<=at(x.first)&&at(x.first)+900000<=at(o.seriesStartAt))out.push({offer:o,offerDigest:x.digest,offerFirstGitAt:x.first});
 }
 return out;
}
function build(offers,maps,previous,now,rev){
 const rows=[],excluded={staleOrLate:0,duplicate:0,noHistory:0,noOfferedDirection:0};
 const existing=new Set(previous.flatMap(x=>x.doc?.kind==="esports_prospective_frozen_v2"&&Array.isArray(x.doc.rows)?x.doc.rows.map(r=>r.key):[]));
 for(const x of offers.sort((a,b)=>at(a.offer.capturedAt)-at(b.offer.capturedAt))){
  const o=x.offer,key=identity(o);
  if(at(x.offerFirstGitAt)>at(now)||at(o.capturedAt)>at(now)||at(now)-at(o.capturedAt)>900000||at(now)+900000>at(o.seriesStartAt)){excluded.staleOrLate++;continue;}
  if(existing.has(key)){excluded.duplicate++;continue;}
  const eligible=maps.filter(r=>at(r.archiveFirstGitAt)<=at(o.capturedAt)&&at(r.observedAt)<=at(o.capturedAt));
  const p=model.predict(o,eligible);
  if(p.status!=="research_only"){excluded.noHistory++;continue;}
  const b=p.baseline,side=b.higher>b.lower?"Higher":b.lower>b.higher?"Lower":null;
  if(!side||!o.sides.includes(side)){excluded.noOfferedDirection++;continue;}
  existing.add(key);
  rows.push({key,offer:o,forecast:p,frozenDirection:side,offerDigest:x.offerDigest,offerFirstGitAt:x.offerFirstGitAt,mapArchiveDigests:[...new Set(eligible.filter(r=>r.title===o.title&&r.playerId===o.playerId&&p.priorSeriesIds.includes(r.seriesId)).map(r=>r.archiveDigest))].sort()});
 }
 return {kind:"esports_prospective_frozen_v2",generatedAt:now,modelRevision:rev,rows,excluded,researchOnly:true,platformSettlementVerified:false,modelPromoted:false};
}
function grade(files,maps,offers=[]){
 const offerProof=new Map();for(const x of offers){const k=JSON.stringify([identity(x.offer),x.offerDigest,x.offerFirstGitAt]);offerProof.set(k,x.offer);}
 const group={},seen=new Set(),counts={registered:0,decided:0,pending:0,push:0,lateOrInvalid:0,duplicate:0};let totalBrier=0;const challenger={};
 for(const f of files){
  const d=f.doc;if(d?.kind!=="esports_prospective_frozen_v2"||!Array.isArray(d.rows)||!Number.isFinite(at(d.generatedAt))||at(d.generatedAt)>at(f.first)||!/^[a-f0-9]{40}$/.test(d.modelRevision||""))continue;
  for(const r of d.rows){
   const o=r.offer,p=r.forecast?.baseline;
   if(!validSourceOffer(o)||r.key!==identity(o)||!sourceHash(r.offerDigest)||!Array.isArray(r.mapArchiveDigests)||!r.mapArchiveDigests.length||!r.mapArchiveDigests.every(sourceHash)||!p||![p.higher,p.lower,p.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||Math.abs(p.higher+p.lower+p.push-1)>1e-8||at(r.offerFirstGitAt)>at(d.generatedAt)||at(f.first)+900000>at(o.seriesStartAt)){counts.lateOrInvalid++;continue;}
   const original=offerProof.get(JSON.stringify([r.key,r.offerDigest,r.offerFirstGitAt]));
   const prior=maps.filter(x=>at(x.archiveFirstGitAt)<=at(o.capturedAt)&&at(x.observedAt)<=at(o.capturedAt));
   const check=original?model.predict(original,prior):null;
   const expected=p.higher>p.lower?"Higher":p.lower>p.higher?"Lower":null;
   const digests=[...new Set(prior.filter(x=>x.title===o.title&&x.playerId===o.playerId&&check?.priorSeriesIds?.includes(x.seriesId)).map(x=>x.archiveDigest))].sort();
   if(!original||hash(original)!==hash(o)||check?.status!=="research_only"||hash(check.baseline)!==hash(p)||hash(check.priorSeriesIds)!==hash(r.forecast.priorSeriesIds)||hash(digests)!==hash([...r.mapArchiveDigests].sort())||!expected||r.frozenDirection!==expected||!o.sides.includes(expected)){counts.lateOrInvalid++;continue;}
   const actualStarts=maps.filter(x=>x.title===o.title&&x.seriesId===o.seriesId&&o.maps.includes(x.mapIndex)).map(x=>at(x.startAt));
   if(actualStarts.some(x=>x<at(f.first)+900000)){counts.lateOrInvalid++;continue;}
   if(seen.has(r.key)){counts.duplicate++;continue;}seen.add(r.key);counts.registered++;
   const k=JSON.stringify([o.title,o.market,o.maps,o.platform,o.tier]),g=group[k]??={registered:0,pending:0,push:0,decided:0,wins:0,higher:0,brierSum:0,series:new Set(),dates:new Set()};g.registered++;
   const final=model.grade(o,maps);
   if(final.status!=="statistical_result_only"){counts.pending++;g.pending++;continue;}
   if(final.outcome==="Push"){counts.push++;g.push++;continue;}
   const den=p.higher+p.lower;if(!den){counts.pending++;g.pending++;continue;}
   const y=Number(final.outcome==="Higher"),q=p.higher/den;
   counts.decided++;g.decided++;g.higher+=y;g.wins+=Number(r.frozenDirection===final.outcome);g.brierSum+=(q-y)**2;totalBrier+=(q-y)**2;g.series.add(o.seriesId);g.dates.add(o.seriesStartAt.slice(0,10));
   const alt=r.forecast.lolCountChallenger;if(o.title==="LOL"&&alt&&[alt.higher,alt.lower,alt.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(alt.higher+alt.lower+alt.push-1)<1e-8&&alt.higher+alt.lower>0){const v=alt.higher/(alt.higher+alt.lower),z=challenger[k]??={n:0,baselineBrierSum:0,countBrierSum:0,baselineWins:0,countWins:0};z.n++;z.baselineBrierSum+=(q-y)**2;z.countBrierSum+=(v-y)**2;z.baselineWins+=Number(Number(q>.5)===y);z.countWins+=Number(Number(v>.5)===y);}
  }
 }
 // Only groups by market/platform/scope; no players, offers, or private IDs.
 return {counts,lolCountMatched:Object.fromEntries(Object.entries(challenger).map(([k,z])=>[k,{n:z.n,baselineBrier:z.baselineBrierSum/z.n,countBrier:z.countBrierSum/z.n,baselineWins:z.baselineWins,countWins:z.countWins,approved:false}])),brier:counts.decided?totalBrier/counts.decided:null,groups:Object.fromEntries(Object.entries(group).map(([k,g])=>[k,{registered:g.registered,pending:g.pending,push:g.push,decided:g.decided,wins:g.wins,hitRate:g.decided?g.wins/g.decided:null,alwaysHigher:g.decided?g.higher/g.decided:null,alwaysLower:g.decided?1-g.higher/g.decided:null,brier:g.decided?g.brierSum/g.decided:null,distinctSeries:g.series.size,dates:g.dates.size,evidenceMinimumMet:g.decided>=100&&g.series.size>=30&&g.dates.size>=10,approved:false}]))};
}
function main(){
 const [rootArg,mode]=process.argv.slice(2),root=fs.realpathSync(rootArg);
 if(root===realRoot||!fs.existsSync(path.join(root,".git"))||!["audit","freeze"].includes(mode))throw Error("restricted archive required");
 const a=load(root,dirs.offers),m=load(root,dirs.maps),f=load(root,dirs.freeze),maps=collectMaps(m.out),offers=originalOffers(a.out);
 const now=new Date().toISOString(),rev=execFileSync("git",["rev-parse","HEAD"],{cwd:realRoot,encoding:"utf8"}).trim(),next=build(offers,maps,f.out,now,rev);
 if(mode==="freeze"&&next.rows.length){
  const dest=path.join(root,dirs.freeze);fs.mkdirSync(dest,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dest,now.replace(/[-:.]/g,"")+".json"),JSON.stringify(next)+"\n",{flag:"wx",mode:0o600});
 }
 const out={kind:"esports_prospective_archive_audit_v2",offerFiles:a.counts,mapFiles:m.counts,frozenFiles:f.counts,eligibleOffers:offers.length,verifiedMapRows:maps.length,freezeCandidates:next.rows.length,freezeExcluded:next.excluded,grade:grade(f.out,maps,offers),paidRequests:0,rawRowsPublished:0,platformSettlementVerified:false,modelPromoted:false};
 console.log(JSON.stringify(out));
}
if(require.main===module){try{main()}catch{console.error("Restricted prospective evidence audit failed closed");process.exitCode=1;}}
module.exports={build,grade,collectMaps,originalOffers,verifiedMap,identity};
