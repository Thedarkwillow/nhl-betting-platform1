"use strict";
/* Phone-first, aggregate-only accuracy and provider evidence.
 * No live prop quotes, person-level data or uncontrolled HTML injection.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.AccuracyPlatformEvidenceDesk=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const KIND="public_six_priority_accuracy_platform_evidence_desk_v1";
 const tiers=["Standard","Goblin","Demon"];
 const markets={assists:"Assists",blockedShots:"Blocked shots",
  shotsOnGoal:"Shots on goal",points:"Points"};
 const n=x=>Number.isInteger(x)&&x>=0?x.toLocaleString("en-US"):"—";
 const pct=x=>typeof x==="number"&&x>=0&&x<=1?(x*100).toFixed(1)+"%":"Not validated";
 const safe=x=>String(x??"").slice(0,180);
 function view(data){
  if(data?.kind!==KIND||data.schemaVersion!==1||
     data.noActualPlatformSettlementClaim!==true||
     data.privatePlayerRowsExposed!==0||data.automaticWagers!==0||
     !tiers.every(t=>Number.isInteger(data.dailyNhl?.tiers?.[t]?.decided))||
     typeof data.lastOfficialSlateDate!=="string")
   return {ready:false,message:"No validated aggregate grade is available."};
  const daily=data.dailyNhl,health=data.collection||{},proof=data.providerProof||{},
   trial=data.newProspectiveTrial||{};
  const slot=x=>{
   const v=health.slots?.[x]||{};
   return {name:x==="06:00"?"6 AM Pacific":"9 AM Pacific",
    status:v.complete===true?"Archived: "+n(v.nhlOffers)+" NHL / "+n(v.nflOffers)+" NFL source offers":
     v.status==="not_due"?"Not due in the published report":
     "No verified full capture"};
  };
  return {ready:true,slate:safe(data.lastOfficialSlateDate),
   generatedAt:data.generatedAt,
   tiers:tiers.map(t=>({name:t,...daily.tiers[t],
    cumulative:data.cumulativeNhlTiers?.[t]||null})),
   standardMarkets:Object.entries(markets).map(([k,label])=>({
    label,...(daily.standardMarkets?.[k]||{})})),
   nhlAll:daily.all,
   nflAll:data.dailyNfl?.all||null,
   nhlBaseline:daily.standardSameLineBaseline,
   nflBaseline:data.dailyNfl?.sameLineBaseline,
   nonappearances:daily.confirmedNoAppearance,
   remaining:daily.outstandingAppearanceReconciliation,
   originalPending:daily.originalPendingImmutable,
   slots:[slot("06:00"),slot("09:00")],
   sixNineVerified:health.comparableSixNineDeltaVerified===true,
   firstGit:health.firstGitFreezeVerified===true,
   firstGitNhl:health.firstGitCapturedNhl,
   firstGitNfl:health.firstGitCapturedNfl,
   proof:{sameThreshold:proof.exactSportsbookSameThresholdMatches,
    appOffers:proof.authenticatedOriginalAppOffers,
    payouts:proof.authenticatedSpecificEntryPayouts,
    settlements:proof.authenticatedFinalSettlements},
   trial:{reported:trial.reported===true,nhlDecided:trial.nhlDecided||0,
    nhlGames:trial.nhlDistinctGames||0,nflDecided:trial.nflDecided||0,
    nflGames:trial.nflDistinctGames||0},
   pages:proof.officialReferencePages||{},
   settlementVerified:false,calibrated:false,verifiedExpectedValue:null};
 }
 function el(tag,text,cls){
  const x=document.createElement(tag);
  if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;
  return x;
 }
 function line(container,heading,value,cls){
  const x=el("div",undefined,"ape-stat "+(cls||""));
  x.append(el("span",heading,"ape-label"),el("strong",value,"ape-value"));
  container.append(x);
 }
 function h3(container,text){
  container.append(el("h3",text,"ape-subhead"));
 }
 function tbl(headers,rows){
  const box=el("div",undefined,"ape-table-scroll"),table=el("table",undefined,"ape-table"),
   head=el("thead"),body=el("tbody"),hdr=el("tr");
  headers.forEach(s=>hdr.append(el("th",s)));head.append(hdr);table.append(head);
  rows.forEach(row=>{const tr=el("tr");row.forEach(s=>tr.append(el("td",String(s))));body.append(tr);});
  table.append(body);box.append(table);return box;
 }
 function render(host,d){
  if(!host)return;
  host.replaceChildren();
  const v=view(d);
  if(!v.ready){host.append(el("p",v.message,"ape-unavailable"));return;}
  const meta=el("p","Most recent completed archive: "+v.slate+
   ". All hit rates below are observed directional outcomes, not calibrated probabilities or returns.",
   "ape-explainer");
  host.append(meta);
  const stats=el("div",undefined,"ape-metrics");
  line(stats,"NHL decisions",n(v.nhlAll?.decided),"");
  line(stats,"NHL hit rate",pct(v.nhlAll?.rate),"");
  line(stats,"NFL decisions",n(v.nflAll?.decided),"");
  line(stats,"NFL hit rate",pct(v.nflAll?.rate),"");
  host.append(stats);
  h3(host,"NHL — Standard, Goblin and Demon");
  host.append(tbl(["Tier","Last slate","Cumulative","Decided"],v.tiers.map(t=>[
   t.name,pct(t.rate),pct(t.cumulative?.rate),n(t.decided)
  ])));
  host.append(el("p","Goblin/Demon original cohorts are Higher-only. Higher hit rates across tiers are not directly comparable as expected returns.","ape-footnote"));
  h3(host,"NHL Standard — market-level results");
  host.append(tbl(["Market","Correct","Incorrect","Hit rate"],v.standardMarkets.map(m=>[
   m.label,n(m.correct),n(m.incorrect),pct(m.rate)
  ])));
  const comparison=el("div",undefined,"ape-note");
  const bb=v.nhlBaseline||{},nb=v.nflBaseline||{};
  comparison.append(el("strong","Hypothetical same-line baselines"),
   el("p","NHL Standard — model "+pct(bb.model)+" · always Higher "+
     pct(bb.alwaysHigher)+" · always Lower "+pct(bb.alwaysLower)),
   el("p","NFL — model "+pct(nb.model)+" · always Higher "+
     pct(nb.alwaysHigher)+" · always Lower "+pct(nb.alwaysLower)),
   el("p","These use already-selected thresholds. They do not establish an executable full-board strategy."));
  host.append(comparison);
  const dnp=v.nonappearances===null?"Not verified":n(v.nonappearances);
  const remaining=v.remaining===null?"Not verified":n(v.remaining);
  host.append(el("p","Official-stat nonappearance reconciliation: "+dnp+
   " confirmed · "+remaining+" unresolved. Original pending ledger rows remain "+
   n(v.originalPending)+" for audit traceability; platform refunds are unverified.","ape-footnote"));
  h3(host,"Pacific morning capture verification");
  const slotGrid=el("div",undefined,"ape-captures");
  for(const slot of v.slots)line(slotGrid,slot.name,slot.status);
  host.append(slotGrid);
  host.append(el("p","First-Git pregame source proof: "+(v.firstGit?"verified":"not verified")+
   ". 6-to-9 AM changes: "+(v.sixNineVerified?"verified":"not verified")+
   ". A green GitHub workflow does not prove a completed board capture.","ape-footnote"));
  h3(host,"Exact app quotes, payout terms and settlements");
  const proofGrid=el("div",undefined,"ape-proof");
  line(proofGrid,"Sportsbook exact-threshold matches",n(v.proof.sameThreshold));
  line(proofGrid,"Authenticated fantasy-app offers",n(v.proof.appOffers));
  line(proofGrid,"Entry-specific payout quotes",n(v.proof.payouts));
  line(proofGrid,"Authenticated final settlements",n(v.proof.settlements));
  host.append(proofGrid);
  host.append(el("p","Official payout pages document general rules, but we cannot compute verified lineup EV or paper ROI without exact entry-specific terms and authenticated settlements.","ape-footnote"));
  const links=el("p",undefined,"ape-links");
  const known=[["PrizePicks payout rules","https://www.prizepicks.com/help-center/payouts"],
   ["PrizePicks DNP rules","https://www.prizepicks.com/help-center/dnps-reboots-and-ties"],
   ["Underdog payout rules","https://help.underdogsports.com/en/articles/13780101-pick-em-standard-flex-entry-payouts"],
   ["Underdog void rules","https://help.underdogsports.com/en/articles/13161362-pick-em-flex-flexed-payouts"]];
  for(const [label,url] of known){
   const a=el("a",label);a.href=url;a.target="_blank";a.rel="noopener noreferrer";
   links.append(a);
  }
  host.append(links);
  h3(host,"New future-frozen validation trial");
  host.append(el("p",(v.trial.reported?"Archived monitor: ":"Awaiting archived monitor: ")+
   n(v.trial.nhlDecided)+" NHL decisions ("+n(v.trial.nhlGames)+" games) · "+
   n(v.trial.nflDecided)+" NFL decisions ("+n(v.trial.nflGames)+
   " games). The new cohort starts November 21, 2026 UTC; independent outperformance remains unproven.",
   "ape-explainer"));
 }
 async function load(){
  const host=document.getElementById("accuracyEvidenceContent"),
   status=document.getElementById("accuracyEvidenceStatus");
  if(!host||!status)return;
  status.textContent="Refreshing archived evidence…";
  try{
   const response=await fetch("./data/accuracy-platform-evidence.json",{cache:"no-store"});
   if(!response.ok)throw Error("Missing published verified evidence JSON");
   const data=await response.json();
   const v=view(data);
   render(host,data);
   status.textContent=v.ready?"Archive loaded. No live fantasy-app access or automatic wagers.":v.message;
  }catch{
   render(host,null);
   status.textContent="Current verified accuracy archive unavailable; no confidence or payout claim shown.";
  }
 }
 function mount(){
  const refresh=document.getElementById("refreshAccuracyEvidence");
  if(refresh)refresh.addEventListener("click",load);
  load();
 }
 if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);
  else mount();
 }
 return {KIND,view,render,load};
});
