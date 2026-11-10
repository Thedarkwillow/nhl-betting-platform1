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
  let status=null;
  const draw=()=>render(host,viewModel(status,picker?.value||"NHL"));
  if(picker)picker.addEventListener("change",draw);
  draw();
  fetch("./data/nhl-nfl-freeze-status.json",{cache:"no-store"})
   .then(r=>{if(!r.ok)throw Error("No published freeze status");return r.json();})
   .then(d=>{status=d;draw();})
   .catch(()=>{status=null;draw();});
 }
 if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
 }
 return {viewModel,render};
});
