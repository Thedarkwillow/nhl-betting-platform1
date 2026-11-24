"use strict";
/**
 * First-Git NHL/NFL protection for repeated NFL collection triggers:
 * exact same original offer may be re-frozen seconds later with only a new
 * projectionRecordedAt; it is NEVER a new independent selected line.
 * A conflicting repeated id is an integrity failure, not a new pick.
 */
const {verifyCommitChronology}=require("./nfl-prospective-freeze.cjs");
const KIND="nfl_independent_partner_standard_directional_original_research_v1";
function equivalent(a,b){
 if(!a||!b||a.id!==b.id)return false;
 const strip=x=>Object.fromEntries(Object.entries(x)
   .filter(([k])=>k!=="projectionRecordedAt").sort(([a],[b])=>a.localeCompare(b)));
 return JSON.stringify(strip(a))===JSON.stringify(strip(b));
}
function firstOriginals(snapshots){
 if(!Array.isArray(snapshots))throw Error("Need original NFL source frames");
 const earliest=new Map(),byCommit=new Map();
 let exactRepeated=0;
 const ordered=[...snapshots].sort((a,b)=>
   Date.parse(a.firstCommittedAt)-Date.parse(b.firstCommittedAt));
 for(const item of ordered){
  if(item.gitHistoryCount!==1||
    item.snapshot?.kind!==KIND||
    !verifyCommitChronology(item.snapshot,item.firstCommittedAt).verified||
    !Array.isArray(item.snapshot.selections))
   throw Error("Refuse Unverified NFL original first-Git directional capture");
  const local=new Set();
  for(const p of item.snapshot.selections){
   if(typeof p?.id!=="string"||!p.id||local.has(p.id))
    throw Error("Duplicate or invalid id within one frozen NFL original");
   local.add(p.id);
   const src={p,firstCommittedAt:item.firstCommittedAt};
   const sourceKey=item.firstCommittedAt+"|"+p.id;
   if(byCommit.has(sourceKey))throw Error("Nonunique original first Git and id");
   byCommit.set(sourceKey,src);
   if(earliest.has(p.id)){
    if(!equivalent(earliest.get(p.id).p,p))
     throw Error("Conflicting later copy of originally frozen NFL quote");
    exactRepeated++;
   }else earliest.set(p.id,src);
  }
 }
 return {earliest,byCommit,exactRepeated,verifiedFrames:ordered.length};
}
module.exports={KIND,equivalent,firstOriginals};
