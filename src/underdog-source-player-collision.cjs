"use strict";
/* Detect ambiguous identities in a bounded third-party Underdog response.
 * A source player id that refers to two names/teams, or one exact name/team
 * with two source IDs, must never match a PrizePicks line. */
const name=s=>typeof s==="string"?s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,""):"";
const team=s=>String(s||"").trim().toUpperCase();
function audit(doc){
 const rows=Array.isArray(doc?.data)?doc.data:[];
 const byId=new Map(),byIdentity=new Map(),bad=new Set();
 const counts={sourceIdCollision:0,identitySplit:0,blankSourceIdentity:0};
 for(const r of rows){
  const id=r?.player?.id,identity=name(r?.player?.name)+"|"+team(r?.player?.team);
  const key=r?.line_id;
  if(typeof key!=="string"||!key)continue;
  if((typeof id!=="string"&&typeof id!=="number")||!String(id)||identity.startsWith("|")||identity.endsWith("|")){
   bad.add(key);counts.blankSourceIdentity++;continue;
  }
  const x=String(id),a=byId.get(x)||[],b=byIdentity.get(identity)||[];
  a.push({identity,key});b.push({id:x,key});byId.set(x,a);byIdentity.set(identity,b);
 }
 for(const rows of byId.values())if(new Set(rows.map(x=>x.identity)).size>1){
  counts.sourceIdCollision++;
  rows.forEach(x=>bad.add(x.key));
 }
 for(const rows of byIdentity.values())if(new Set(rows.map(x=>x.id)).size>1){
  counts.identitySplit++;
  rows.forEach(x=>bad.add(x.key));
 }
 return {kind:"bounded_underdog_source_identity_consistency_v1",
  candidateOfferRows:rows.length,rejectedOfferIds:bad,
  rejectedCount:bad.size,reasons:counts,
  sourceIdentityAuthenticated:false,
  currentRosterParticipationVerified:false,
  productionEligible:false,publicRows:0};
}
module.exports={audit};
