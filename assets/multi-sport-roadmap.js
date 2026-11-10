/* Public, counts-only, versioned NHL/NFL research status. No private props. */
(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.MultiSportRoadmap=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const KIND="public_safe_nhl_nfl_original_pregame_freeze_status_v1";
 function viewModel(data,sport="NHL",now=Date.now()){
  const code=["NHL","NFL"].includes(sport)?sport:"NHL";
  if(data?.schemaVersion!==1||data.kind!==KIND||
     data.firstGitAdditionVerified!==true||
     data.originalModelDirectionsBeforeKickoff!==true||
     data.sameCommitForBothSports!==true||
     !Number.isInteger(data.pregameSelections?.[code]?.count)||
     !Number.isInteger(data.pregameSelections?.[code]?.standard))
   return {sport:code,available:false,title:"Verified pregame data unavailable",
    explanation:"No qualifying original NHL/NFL freeze has been published. Do not infer current offers.",
    counts:null,sourceFresh:false};
  const captured=Date.parse(data.sourceCaptureFinishedUTC),
   commit=Date.parse(data.originalPrivateGitCommitUTC),
   clock=typeof now==="number"?now:Date.parse(now);
  if(!Number.isFinite(captured)||!Number.isFinite(commit)||commit<captured||
    !Number.isFinite(clock)||clock<captured)
    return {sport:code,available:false,title:"Research chronology not verified",
     explanation:"Source and original Git commit timestamps do not reconcile.",
     counts:null,sourceFresh:false};
  const recent=clock-captured<=30*60000,summary=data.pregameSelections[code];
  return {sport:code,available:true,
   title:code+" · "+summary.count+" original pregame directions",
   explanation:(recent?"Recently captured independent source":"Archived source; NOT current live availability")+
    ". Original Higher/Lower research selections were committed before games. Their outcomes, platform quote eligibility and betting value remain unverified.",
   counts:{frozen:summary.count,standard:summary.standard,
     distinctGames:summary.distinctGames,offers:data.capturedOffers?.[code]??null},
   capturedAt:data.sourceCaptureFinishedUTC,committedAt:data.originalPrivateGitCommitUTC,
   sourceFresh:recent,calibrated:false,platformOffersVerified:false,
   paidLineupEVAvailable:false,underdogConnected:false};
 }
 function healthView(d,now=Date.now()){
  if(d?.schemaVersion!==1||
     d.kind!=="public_nhl_nfl_pacific_morning_collection_health_v1")
   return "6 AM / 9 AM collection status: unavailable";
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",
   year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  if(d.pacificDate!==date)
   return "6 AM / 9 AM archive monitor: previous day's record; not today's board";
  const status=k=>d.slots?.[k]?.status==="privately_archived_complete"?"archived":"missing / unverified";
  return "6 AM "+status("06:00")+" · 9 AM "+status("09:00")+
   " · 6-to-9 comparison "+(d.sixToNineChangesVerified===true?"archived":"unavailable");
 }
 function movementView(d,sport="NHL",now=Date.now()){
  const code=["NHL","NFL"].includes(sport)?sport:"NHL",
   m=d?.sports?.[code],before=Date.parse(d?.earlierCaptureAt),
   after=Date.parse(d?.laterCaptureAt);
  const count=x=>Number.isInteger(x)&&x>=0;
  if(d?.kind!=="public_safe_nhl_nfl_board_line_movement_counts_v1"||
   d.schemaVersion!==1||d.privateOfferIDsPublished!==0||
   d.rawLinesPublished!==0||d.previouslyFrozenDirectionsRetained!==true||
   d.originalOffersFromPartnerSourceNotVerifiedPrizePicksApp!==true||
   ![before,after].every(Number.isFinite)||after<=before||
   !m||!["existingLineChanged","existingSideAvailabilityChanged",
    "newSourceOfferIDs","noLongerSeenSourceIDsUnverified","unchanged",
    "firstObserved","secondObserved"].every(k=>count(m[k])))
   return "NHL/NFL line movement: no verified comparison published.";
  const label=d.genuineSixToNineComparison===true?
    "genuine same-day 6-to-9 AM":
    d.crossDayComparison===true?"cross-day":"other same-day";
  const time=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
   month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(after));
  const extra=m.newSourceOfferIDs===m.secondObserved?
   " No shared offer IDs across these captures.":"";
  const stale=Number.isFinite(now)&&now-after>30*60000?
   " Archived research; not current app availability.":"";
  return code+" "+label+" source comparison ("+time+" PT): "+
   m.existingLineChanged+" matching-offer lines changed, "+
   m.existingSideAvailabilityChanged+" offered-side changes, "+
   m.newSourceOfferIDs+" newly observed IDs, "+
   m.noLongerSeenSourceIDsUnverified+
   " IDs absent in the later source (NOT confirmed removals)."+
   extra+stale;
 }
 function render(rootEl,view){
  if(!rootEl)return;
  const byId=x=>rootEl.querySelector('[data-multi="'+x+'"]');
  const put=(k,v)=>{const el=byId(k);if(el)el.textContent=v;};
  put("title",view.title);
  put("description",view.explanation);
  put("frozen",view.counts?String(view.counts.frozen):"—");
  put("standard",view.counts?String(view.counts.standard):"—");
  put("games",view.counts?String(view.counts.distinctGames):"—");
  put("offers",view.counts&&Number.isInteger(view.counts.offers)?
   view.counts.offers.toLocaleString("en-US"):"—");
  put("status",view.available?(view.sourceFresh?"Recent source — research only":
   "Archived research · new capture required"):"Evidence unavailable");
  const note=byId("scope");
  if(note)note.textContent=view.sport==="NFL"?
   "NFL individual props and lineup EV are not published until platform evidence, calibration and postgame grading pass.":
   "The detailed board below is NHL-only. Its model estimates are uncalibrated research, not authenticated PrizePicks offers.";
 }
 function init(){
  const host=document.getElementById("multiSportEvidence");
  if(!host)return;
  const picker=host.querySelector("#multiSportPicker");
  let status=null,movement=null;
  const movements=host.querySelector('[data-multi="movement"]');
  const draw=()=>{
   render(host,viewModel(status,picker?.value||"NHL"));
   if(movements)movements.textContent=movementView(movement,picker?.value||"NHL");
  };
  const ops=host.querySelector('[data-multi="operations"]');
  if(ops){
   ops.textContent=healthView(null);
   fetch("./data/collection-health.json",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("Health unavailable");return r.json();})
    .then(d=>{ops.textContent=healthView(d);})
    .catch(()=>{ops.textContent=healthView(null);});
  }
  if(picker)picker.addEventListener("change",draw);
  draw();
  if(movements)fetch("./data/source-line-movement.json",{cache:"no-store"})
   .then(r=>{if(!r.ok)throw Error("No source movement report");return r.json()})
   .then(d=>{movement=d;draw()})
   .catch(()=>{movement=null;draw()});
  fetch("./data/nhl-nfl-freeze-status.json",{cache:"no-store"})
   .then(r=>{if(!r.ok)throw Error("No published freeze status");return r.json();})
   .then(d=>{status=d;draw();})
   .catch(()=>{status=null;draw();});
 }
 if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
 }
 return {viewModel,healthView,movementView,render};
});
