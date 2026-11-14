/* Public aggregate-only NHL/NFL scorecard. Not a betting recommendation. */
(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.PublicFrozenScorecards=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const KIND="public_nhl_nfl_original_git_frozen_model_scorecards_v1";
 const count=x=>Number.isInteger(x)&&x>=0?x.toLocaleString("en-US"):"—";
 const percent=x=>typeof x==="number"&&x>=0&&x<=1?(100*x).toFixed(1)+"%":"Not yet established";
 function tierView(rows){
  if(!Array.isArray(rows)||rows.length!==3||
   JSON.stringify(rows.map(x=>x?.tier))!==JSON.stringify(["Standard","Goblin","Demon"]))return [];
  if(rows.some(x=>!["frozenSelections","decided","correct","incorrect","push","pending","distinctGames"].every(k=>Number.isInteger(x[k])&&x[k]>=0)||
   x.decided!==x.correct+x.incorrect||x.frozenSelections!==x.decided+x.push+x.pending||
   x.platformSettlementVerified!==false||x.payoutAdjustedROI!==null||
   x.originalCohortHigherOnly!==(x.tier!=="Standard")))return [];
  return rows.map(x=>({tier:x.tier,decided:x.decided,correct:x.correct,incorrect:x.incorrect,push:x.push,pending:x.pending,
   distinctGames:x.distinctGames,rate:x.decided?x.correct/x.decided:null,originalCohortHigherOnly:x.originalCohortHigherOnly}));
 }
 function viewModel(data,sport="NHL"){
  const name=sport==="NFL"?"NFL":"NHL";
  if(data?.kind!==KIND||data.schemaVersion!==1||
   data.evidenceWarnings?.originalGitPrecommitRequired!==true||
   data.evidenceWarnings?.payoutAdjustedEV!==null||
   data.evidenceWarnings?.calibratedHigherLowerProbabilities!==false)
   return {sport:name,available:false,heading:"Verified results unavailable",
    summary:"No verified original pregame results can be shown.",
    baseline:"No same-line comparison available.",detail:"Model probabilities and platform settlement unverified.",
    markets:[]};
  if(name==="NHL"){
   const d=data.nhl?.standardOriginalSelections,p=data.nhl?.postPolicyStandardOnly;
   if(!d||!p||!Number.isInteger(d.decided)||!Number.isInteger(d.correct)||
    d.correct>d.decided||d.frozenSelections!==d.decided+d.push+d.pending)
    return viewModel(null,name);
   const challenge=data.nhl.threeChallengerFuture||{};
   return {sport:name,available:true,
    heading:"NHL Standard · "+count(d.decided)+" decided of "+count(d.frozenSelections)+" original selections",
    summary:count(d.correct)+" correct · "+count(d.decided-d.correct)+" incorrect · "+
      count(d.push)+" pushes · "+count(d.pending)+" pending · "+count(d.distinctGames)+" NHL games",
    baseline:"On those exact "+count(d.decided)+" thresholds: model "+
      percent(d.modelObservedRate)+" · hypothetical always Higher "+
      percent(d.hypotheticalHigherRate)+" · always Lower "+
      percent(d.hypotheticalLowerRate)+".",
    detail:"Locked forward-policy cohort: "+count(p.correct)+"/"+count(p.decided)+
      " decided across "+count(p.distinctGames)+" games. Three new challengers: "+
      count(challenge.decided)+"/"+count(challenge.registered)+" decided. Neither comparison establishes an edge.",
    tiers:tierView(data.nhl.originalTierCounts),
    markets:(data.nhl.postPolicyMarkets||[]).map(m=>({
      title:m.market,decided:m.decided,distinctGames:m.distinctGames,
      modelRate:m.modelRate,higher:m.hypotheticalAlwaysHigherRate,
      lower:m.hypotheticalAlwaysLowerRate})),
    publishedAt:data.generatedAt,calibrated:false,verifiedPlatformSettlement:false};
  }
  const d=data.nfl?.explicitlyFrozenDirections,n=data.nfl?.separateNumericForecasts;
  if(!d||!n||!Number.isInteger(d.decided)||!Number.isInteger(d.correct)||
    d.correct>d.decided||d.frozenSelections!==d.decided+d.push+d.pending)
   return viewModel(null,name);
  return {sport:name,available:true,
   heading:"NFL Standard · "+count(d.decided)+" decided of "+count(d.frozenSelections)+" frozen directions",
   summary:count(d.correct)+" correct · "+count(d.incorrect)+" incorrect · "+
    count(d.push)+" pushes · "+count(d.pending)+" pending",
   baseline:d.decided?
    "On identical frozen thresholds: model "+percent(d.modelObservedRate)+
     " · hypothetical always Higher "+count(d.hypotheticalHigherWins)+
     " correct · always Lower "+count(d.hypotheticalLowerWins)+" correct.":
    "No original preselected NFL Higher/Lower outcomes are decided yet. A win rate is unavailable.",
   detail:count(n.registered)+" earlier numerical forecasts stored; "+count(n.decided)+
    " evaluated by nflverse-derived stats. Directions inferred afterward are NOT preselected Higher/Lower wins.",
   markets:[],publishedAt:data.generatedAt,calibrated:false,verifiedPlatformSettlement:false};
 }
 function render(host,v){
  if(!host)return;
  host.replaceChildren();
  const title=document.createElement("h3");title.textContent=v.heading;
  host.append(title);
  for(const [key,value] of [["summary",v.summary],["baseline",v.baseline],["detail",v.detail]]){
   const line=document.createElement("p");line.className="minor";
   line.dataset.scorecard=key;line.textContent=value;host.append(line);
  }
  if(v.tiers?.length){
   const heading=document.createElement("h4");heading.textContent="Original NHL results by tier";
   host.append(heading);
   const ul=document.createElement("ul");ul.className="model-market-evidence";
   for(const t of v.tiers){
    const li=document.createElement("li");
    li.textContent=t.tier+": "+count(t.correct)+"/"+count(t.decided)+" correct ("+percent(t.rate)+") · "+
     count(t.incorrect)+" incorrect · "+count(t.push)+" pushes · "+count(t.pending)+" pending · "+count(t.distinctGames)+" games";
    ul.append(li);
   }
   host.append(ul);
   const note=document.createElement("p");note.className="minor";
   note.textContent="Historical Goblin and Demon cohorts contain Higher-only selections. Different tiers have different payout terms; observed rates are not a ranking of profitability.";
   host.append(note);
  }
  if(v.markets?.length){
   const heading=document.createElement("h4");heading.textContent="Post-policy Standard market evidence";
   host.append(heading);
   const ul=document.createElement("ul");ul.className="model-market-evidence";
   for(const m of v.markets){
    const li=document.createElement("li");
    li.textContent=m.title+": "+count(m.decided)+" decided across "+
     count(m.distinctGames)+" games · "+(m.modelRate===null?
      "rate suppressed (small or correlated sample)":
      "model "+percent(m.modelRate)+" vs Higher "+percent(m.higher)+
       " / Lower "+percent(m.lower));
    ul.append(li);
   }
   host.append(ul);
  }
  const label=document.createElement("p");label.className="minor";
  label.textContent="Counts are official-NHL-stat or nflverse-derived outcomes, not verified fantasy-app settlements. Same-line baseline comparisons are not full-board executable strategies. No calibrated EV or automatic picks.";
  host.append(label);
 }
 function init(){
  const host=document.getElementById("modelScorecardEvidence"),
   picker=document.getElementById("multiSportPicker");
  if(!host||!picker)return;
  let data=null;const draw=()=>render(host,viewModel(data,picker.value));
  picker.addEventListener("change",draw);draw();
  fetch("./data/model-scorecards.json",{cache:"no-store"})
   .then(r=>{if(!r.ok)throw Error("Scorecard file missing");return r.json()})
   .then(x=>{data=x;draw()})
   .catch(()=>{data=null;draw()});
 }
 if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
 }
 return {viewModel,render,tierView};
});
