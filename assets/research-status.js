/* Public-only research quality presentation. No hidden model inputs,
   credentials, source dumps, wagering actions, or external services. */
(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.NhlResearchStatus=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function summarize(d,now=Date.now()){
  const data=d||{},q=data.researchQuality||{},recognized=
   q.kind==="public_nhl_seven_workstream_brief_v1";
  const board=Date.parse(q.sourceCapturedAt||data.boardAt),
   research=Date.parse(data.researchAt);
  const recent=Number.isFinite(board)&&Number.isFinite(research)&&
   board<=now&&research<=now&&now-board<=30*60000&&now-research<=30*60000&&
   data.researchFreshAtBuild===true&&
   (recognized?q.sourcePaginationComplete===true:
    data.boardCoverage?.apiPaginationComplete===true||data.boardCoverageComplete===true);
  const age=Number.isFinite(board)&&board<=now?Math.floor((now-board)/60000):null;
  const cohort=data.prospectiveCohort||{},verified=cohort.cohortVerified===true;
  const decided=verified&&Number.isInteger(cohort.decided)?cohort.decided:0;
  const interval=recognized&&verified&&q.prospectiveDecided===decided&&decided>=10&&
   Number.isFinite(q.descriptiveWilson95?.lower)&&
   Number.isFinite(q.descriptiveWilson95?.upper)?
   Math.round(q.descriptiveWilson95.lower*100)+"–"+
   Math.round(q.descriptiveWilson95.upper*100)+"% descriptive 95% range":
   "Verified interval unavailable";
  return {
   cards:[
    ["1 · Board","Source "+(recent?"recent":"archived / unavailable"),
     "Independent pagination "+(recognized&&q.sourcePaginationComplete?"complete":"not confirmed")+
     "; "+(recognized?q.sourceOfferedSideRows:"—")+" archived offered-side rows"+
     (age===null?"":" · "+age+" min old")],
    ["2 · Model","Validation pending",
     "Experimental estimates; no calibrated edge or verified return"],
    ["3 · Pregame results",verified?decided+" decided":"Verification pending",
     interval+" · official NHL stat direction only"],
    ["4 · Website","Research tools available",
     "Player history, game filters, lineup drafts and saved source timestamps"],
    ["5 · Lineups","Structural risk flags",
     "No verified joint probability, payout EV or automatic wagering"],
    ["6 · Goalies","Starter check required",
     "Team confirmation, availability and Reboot/DNP conditions unverified"],
    ["7 · Platform comparison",
     recognized&&recent&&q.underdogStatus==="fresh_authorized_derived_comparisons"?
      "Matched independent quotes":"Underdog unavailable",
     "Only source-fresh authorized lines; no fabricated price or tier"]
   ],
   notes:[
    "Original PrizePicks/Underdog app availability and true platform settlements remain unverified.",
    "Only originally saved pregame selections with official final NHL statistics are graded. Pending and pushes are not losses.",
    "A descriptive confidence interval may understate correlations between picks in the same game.",
    "Historical goalie minutes do not confirm a future start; role uncertainty prevents confident research lineups.",
    "Line changes and no-longer-seen offers describe independent provider snapshots, not confirmed app removals."
   ],recent,sourceAgeMinutes:age,verifiedCohort:verified,
   publicSourceOnly:true,originalAppVerified:false
  };
 }
 function render(data,{cards,notes},now=Date.now()){
  if(!cards||!notes)throw Error("NHL quality view missing its containers");
  const view=summarize(data,now);
  cards.replaceChildren();notes.replaceChildren();
  for(const [name,value,description] of view.cards){
   const article=document.createElement("article");article.className="quality-card";
   const label=document.createElement("span");label.className="quality-title";label.textContent=name;
   const strong=document.createElement("strong");strong.textContent=value;
   const small=document.createElement("small");small.textContent=description;
   article.append(label,strong,small);cards.append(article);
  }
  for(const note of view.notes){
   const p=document.createElement("p");p.className="minor";p.textContent=note;notes.append(p);
  }
  return view;
 }
 return {summarize,render};
});
