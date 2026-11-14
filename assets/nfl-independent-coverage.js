"use strict";
(function(){
 const node=document.querySelector("[data-nfl-coverage]");
 if(!node)return;
 fetch("data/nfl-independent-coverage.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("unavailable");return r.json();}).then(d=>{
  const at=Date.parse(d.asOf),now=Date.now();
  if(d.kind!=="public_nfl_independent_scope_coverage_v1"||!Number.isFinite(at)||at>now||
    !Number.isInteger(d.scopedOffers)||d.scopedOffers<1||!Number.isInteger(d.conditionalResearchRows)||d.conditionalResearchRows<0||
    d.completeScope!==true||d.fullNflBoard!==false||d.calibrated!==false||d.playerPropsPublished!==0)
    throw Error("invalid coverage");
  const stamp=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",dateStyle:"medium",timeStyle:"short"}).format(new Date(at));
  node.textContent=d.scopedOffers.toLocaleString("en-US")+" Standard-scope offers archived · "+d.conditionalResearchRows.toLocaleString("en-US")+" conditional model rows matched · "+stamp+" Pacific. "+(now-at<=1800000?"Recent archived source capture.":"Historical capture, no current availability claim.")+" Full NFL board, player-level rankings and calibrated probabilities are not yet released.";
 }).catch(()=>{node.textContent="Verified independent NFL scope coverage is not currently published. NHL rankings are unaffected.";});
})();
