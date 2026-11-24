"use strict";
// Private paper-only evidence contract. Never calls a wagering endpoint.
// A public schedule of standard multipliers is reference-only: the actual
// pre-entry details screen and independent official settlement are required.
const crypto=require("node:crypto");
const num=x=>typeof x==="number"&&Number.isFinite(x),dt=x=>typeof x==="string"?Date.parse(x):NaN;
const sha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const key=x=>JSON.stringify([x.gameId,x.playerId,x.market,x.period,x.line,x.tier,x.side]);
const artifact=x=>x&&sha(x.sha256)&&x.reviewedByOwner===true&&typeof x.privateReference==="string"&&x.privateReference.trim().length>0;
function quote(q){
 if(!q||q.paperOnly!==true||q.platform!=="PrizePicks"||!["power","flex"].includes(q.format)||!Array.isArray(q.legs)||q.legs.length<(q.format==="flex"?3:2)||q.legs.length>6||!num(q.paperStake)||q.paperStake<=0||!artifact(q.quoteEvidence)||!artifact(q.termsEvidence)||typeof q.termsVersion!=="string"||!q.termsVersion||!Number.isFinite(dt(q.quoteAt))||!Number.isFinite(dt(q.frozenAt))||!Number.isFinite(dt(q.firstEventStart))||!(dt(q.quoteAt)<=dt(q.frozenAt)&&dt(q.frozenAt)<dt(q.firstEventStart)))return null;
 if(q.legs.some(x=>x.gameId==null||x.playerId==null||!x.market||!x.period||!num(x.line)||!["Standard","Goblin","Demon"].includes(x.tier)||!["Higher","Lower"].includes(x.side)||(x.tier!=="Standard"&&x.side!=="Higher")||!(dt(x.startAt)>=dt(q.firstEventStart)))||new Set(q.legs.map(key)).size!==q.legs.length||Math.min(...q.legs.map(x=>dt(x.startAt)))!==dt(q.firstEventStart))return null;
 // Actual quote must include every return multiplier for the all-active
 // scenario. Complex void/tie cases require a matching documented outcome.
 if(!Array.isArray(q.quotedGrossMultipliers)||q.quotedGrossMultipliers.length!==q.legs.length+1||q.quotedGrossMultipliers.some(x=>!num(x)||x<0))return null;
 return {...q,id:crypto.createHash("sha256").update(JSON.stringify([q.platform,q.format,q.quoteAt,q.legs.map(key).sort(),q.quoteEvidence.sha256])).digest("hex"),termsAuthenticated:false,reviewedQuoteEvidence:true};
}
function settle(q,s){
 const x=quote(q);if(!x||!s||s.quoteId!==x.id||!artifact(s.settlementEvidence)||!artifact(s.officialOutcomeEvidence)||!Array.isArray(s.legs)||s.legs.length!==x.legs.length||!num(s.documentedGrossReturn)||s.documentedGrossReturn<0||!(dt(s.settledAt)>Math.max(...x.legs.map(z=>dt(z.startAt)))))return null;
 const ids=new Map(s.legs.map(z=>[key(z),z.status]));
 if(ids.size!==x.legs.length||x.legs.some(z=>!["hit","miss","tie","dnp","reboot"].includes(ids.get(key(z)))))return null;
 const statuses=x.legs.map(z=>ids.get(key(z))),hits=statuses.filter(z=>z==="hit").length;
 const simple=statuses.every(z=>["hit","miss"].includes(z));
 if(simple&&Math.abs(s.documentedGrossReturn-x.paperStake*x.quotedGrossMultipliers[hits])>1e-6)return null;
 if(!simple&&!artifact(s.adjustmentRuleEvidence))return null;
 // Owner-reviewed records are evidence-ready, not independent platform
 // authentication. Review must occur outside this calculation.
 return {...x,settledAt:s.settledAt,reviewedSettlementEvidence:true,officialPaperReturn:s.documentedGrossReturn,settlementAuthenticated:false,termsAuthenticated:false,readyForIndependentReview:true};
}
module.exports={quote,settle};
