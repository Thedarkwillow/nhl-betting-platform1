(function(){
 "use strict";
 const root=document.getElementById("multiSportSprintEvidence");
 if(!root)return;
 fetch("./data/public-multi-sport-sprint.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(x=>{
  if(x.kind!=="public_multi_sport_sprint_evidence_v1"||x.rawRowsPublished!==0||x.modelPromoted!==false||!Array.isArray(x.items))throw Error();
  const stamp=document.createElement("p");stamp.className="minor";stamp.textContent="Evidence snapshot: "+x.asOf+" · no authenticated live offers or approved betting probabilities.";root.append(stamp);
  if(x.esportsResearch){const p=document.createElement("p");p.textContent="Esports sources: "+x.esportsResearch.providerPolicy+" · authenticated offers verified: "+x.esportsResearch.authenticatedOffersVerified+" · approved models: "+x.esportsResearch.modelsApproved;root.append(p);}
  if(x.esportsResearch?.independentCoverage?.kind==="authenticated_independent_coverage_counts_not_lines"){const c=x.esportsResearch.independentCoverage,p=document.createElement("p");p.textContent="Independent provider counts (archived "+c.observedAt+"): "+["PrizePicks","Underdog"].map(k=>k+" "+Object.values(c[k]).filter(Number.isInteger).reduce((a,b)=>a+b,0)).join(" · ")+"; not verified app lines.";root.append(p);}
  for(const item of x.items){const p=document.createElement("p");const strong=document.createElement("strong");strong.textContent=item.sport+" — ";p.append(strong,document.createTextNode(item.description+(Number.isInteger(item.historicalRows)?" Historical rows: "+item.historicalRows.toLocaleString()+".":"")));root.append(p);}
 }).catch(()=>{root.textContent="Multi-sport research evidence unavailable; no selections inferred.";});
})();
