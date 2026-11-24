"use strict";
const norm=s=>String(s??"").trim().toLowerCase();
const key=r=>[r.projectionId,r.tier,r.side].map(norm).join("|");
function diffFreeBoards(previous,current){
 if(!Array.isArray(current?.rows)||!Array.isArray(previous?.rows))throw Error("Invalid archived boards");
 const old=new Map(previous.rows.map(r=>[key(r),r])),fresh=new Map(current.rows.map(r=>[key(r),r]));
 const changes=[],observed=Date.parse(current.generatedAt);
 for(const [k,r] of fresh){
  const prior=old.get(k);
  if(!prior){
   changes.push({type:"new_offer",projectionId:r.projectionId,player:r.player,team:r.team,
    market:r.market,tier:r.tier,side:r.side,line:r.line,previousLine:null,
    eventStartsAt:r.eventStartsAt,capturedAt:r.capturedAt});
   continue;
  }
  if(Number(prior.line)!==Number(r.line)){
   changes.push({type:r.line>prior.line?"increased":"decreased",
    projectionId:r.projectionId,player:r.player,team:r.team,market:r.market,tier:r.tier,
    side:r.side,line:r.line,previousLine:prior.line,eventStartsAt:r.eventStartsAt,capturedAt:r.capturedAt});
  }
 }
 for(const [k,r] of old){
  if(fresh.has(k)||Date.parse(r.eventStartsAt)<=observed)continue;
  // Missing from an independent feed is NOT a verified removal from PrizePicks.
  changes.push({type:"not_seen_unverified",projectionId:r.projectionId,player:r.player,team:r.team,
   market:r.market,tier:r.tier,side:r.side,previousLine:r.line,line:null,
   eventStartsAt:r.eventStartsAt,capturedAt:current.generatedAt});
 }

 // Detect an actual change in a *stable third-party projection identity*
 // only if both complete boards contain exactly one otherwise-identical row.
 // A renamed player, changed underlying threshold, ambiguous duplicate or
 // replacement provider ID must NOT be presented as a tier promotion.
 const identity=r=>JSON.stringify([norm(r.projectionId),norm(r.side),
  norm(r.player),norm(r.team),norm(r.market),norm(r.period),
  norm(r.eventStartsAt),r.line]);
 const group=rows=>{
  const result=new Map();
  for(const r of rows){const k=identity(r);
   if(!result.has(k))result.set(k,[]);
   result.get(k).push(r);
  }
  return result;
 };
 const oldByIdentity=group(previous.rows),newByIdentity=group(current.rows);
 const replace=new Set(),tiers=[];
 for(const [k,oldRows] of oldByIdentity){
  const newRows=newByIdentity.get(k);
  if(oldRows.length!==1||newRows?.length!==1)continue;
  const a=oldRows[0],b=newRows[0];
  if(norm(a.tier)===norm(b.tier)||!["standard","goblin","demon"].includes(norm(a.tier))||
      !["standard","goblin","demon"].includes(norm(b.tier)))continue;
  const oldIndex=changes.findIndex(x=>x.type==="not_seen_unverified"&&
   x.projectionId===a.projectionId&&x.side===a.side&&x.tier===a.tier);
  const newIndex=changes.findIndex(x=>x.type==="new_offer"&&
   x.projectionId===b.projectionId&&x.side===b.side&&x.tier===b.tier);
  if(oldIndex<0||newIndex<0)continue;
  replace.add(oldIndex);replace.add(newIndex);
  tiers.push({type:"observed_tier_change",projectionId:b.projectionId,
   player:b.player,team:b.team,market:b.market,side:b.side,
   previousTier:a.tier,tier:b.tier,line:b.line,previousLine:a.line,
   eventStartsAt:b.eventStartsAt,capturedAt:b.capturedAt,
   originalAppTierChangeVerified:false});
 }
 const observedChanges=changes.filter((_,i)=>!replace.has(i)).concat(tiers);
 return {previousAt:previous.generatedAt,currentAt:current.generatedAt,
  source:"Independent PrizePicks API archived boards",removalsVerified:false,
  changes:observedChanges,summary:{increased:observedChanges.filter(x=>x.type==="increased").length,
   decreased:observedChanges.filter(x=>x.type==="decreased").length,
   newOffers:observedChanges.filter(x=>x.type==="new_offer").length,
   tierChangesObserved:tiers.length,
   notSeenUnverified:observedChanges.filter(x=>x.type==="not_seen_unverified").length},
  warning:"Third-party missing offers are NOT independently verified PrizePicks removals."};
}
module.exports={diffFreeBoards};
