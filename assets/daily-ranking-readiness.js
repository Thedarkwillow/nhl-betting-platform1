"use strict";
/* Read-only, publicly allowlisted evidence. Never fetch private player rows. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.NhlDailyReadiness=api;
 if(typeof document!=="undefined"){
  const start=()=>api.mount(document,root.fetch&&root.fetch.bind(root));
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
 }
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const validTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
 function pacificDay(at){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
   year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(at));
  const get=k=>parts.find(p=>p.type===k)?.value;
  return get("year")+"-"+get("month")+"-"+get("day");
 }
 function fresh(time,now,minutes){
  const t=Date.parse(time);
  return validTime(time)&&t<=now&&now-t<=minutes*60000;
 }
 function summarize({health,freeze,diagnostic}={},now=Date.now()){
  const today=pacificDay(now);
  const valid=health?.kind==="public_nhl_nfl_pacific_morning_collection_health_v1"&&
   health.pacificDate===today&&validTime(health.generatedAt)&&Date.parse(health.generatedAt)<=now;
  const slots=valid?health.slots||{}:{};
  const captured=slot=>slot?.status==="privately_archived_complete"&&
   fresh(slot.observedAt,now,24*60)&&pacificDay(Date.parse(slot.observedAt))===today&&
   Number.isInteger(slot.nhlOffers)&&slot.nhlOffers>0&&
   Number.isInteger(slot.nflOffers)&&slot.nflOffers>0;
  const six=captured(slots["06:00"]),nine=captured(slots["09:00"]);
  const source=valid&&[slots["06:00"],slots["09:00"]].some(x=>
   captured(x)&&x.observedAt===freeze?.sourceCaptureFinishedUTC);
  const frozen=source&&freeze?.kind==="public_safe_nhl_nfl_original_pregame_freeze_status_v1"&&
   freeze.firstGitAdditionVerified===true&&freeze.originalModelDirectionsBeforeKickoff===true&&
   validTime(freeze.originalPrivateGitCommitUTC)&&
   Date.parse(freeze.originalPrivateGitCommitUTC)<=now&&
   Number.isInteger(freeze.pregameSelections?.NHL?.count)&&
   Number.isInteger(freeze.pregameSelections?.NFL?.count)&&
   freeze.pregameSelections.NHL.count>=0&&freeze.pregameSelections.NFL.count>=0;
  const approved=diagnostic?.kind==="public_nhl_freshness_diagnostic_v1"&&
   diagnostic.publicExportApproved===true&&
   diagnostic.originalPlatformAvailabilityVerified===false&&
   Number.isInteger(diagnostic.publishedRows)&&diagnostic.publishedRows>0&&
   fresh(diagnostic.generatedAt,now,30)&&fresh(diagnostic.approvedArchiveAt,now,30);
  const reason=typeof diagnostic?.reason==="string"&&/^[a-z_]{3,80}$/.test(diagnostic.reason)?
   diagnostic.reason.replaceAll("_"," "):"fresh public source not verified";
  return {
   date:today,sourceStatus:six&&nine?"6 AM and 9 AM captured":six?"6 AM captured; 9 AM not yet verified":"Morning captures not yet verified",
   sourceDetail:six&&nine?"Original NHL/NFL source observations independently archived":"No missing or delayed capture is assumed successful",
   frozenStatus:frozen?freeze.pregameSelections.NHL.count+" NHL / "+freeze.pregameSelections.NFL.count+" NFL research directions frozen":"Pregame freeze not verified against the latest source",
   rankingStatus:approved?diagnostic.publishedRows+" fresh public research rows":"Fresh public player rankings withheld",
   rankingDetail:approved?
    "Independent-source research only; no calibrated probabilities, verified app availability or payouts":
    "Private capture does not authorize public player lines. Status: "+reason+".",
   six,nine,frozen,approved,originalAppVerified:false,calibrated:false
  };
 }
 function render(host,summary){
  host.replaceChildren();
  const heading=document.createElement("h3");heading.textContent="Today's capture and ranking readiness";
  const note=document.createElement("p");note.className="minor";
  note.textContent="Capture, frozen research and publishable player rankings have separate evidence checks.";
  host.append(heading,note);
  for(const [name,value,detail] of [
   ["Board capture",summary.sourceStatus,summary.sourceDetail],
   ["Original research",summary.frozenStatus,"Saved before games; not validated betting recommendations"],
   ["Public rankings",summary.rankingStatus,summary.rankingDetail]]){
   const p=document.createElement("p");p.className="minor";
   const label=document.createElement("strong");label.textContent=name+": ";
   const v=document.createElement("span");v.textContent=value+" — "+detail;
   p.append(label,v);host.append(p);
  }
 }
 async function mount(doc,fetchFn,now=Date.now){
  const host=doc.getElementById("dailyRankingReadiness");
  if(!host||typeof fetchFn!=="function")return;
  const refresh=async()=>{
   try{
    const names=["collection-health.json","nhl-nfl-freeze-status.json","nhl-freshness-diagnostic.json"];
    const values=await Promise.all(names.map(async name=>{
     const res=await fetchFn("./data/"+name,{cache:"no-store"});
     if(!res.ok)throw Error("status feed unavailable");
     return res.json();
    }));
    render(host,summarize({health:values[0],freeze:values[1],diagnostic:values[2]},now()));
   }catch{
    render(host,summarize({},now()));
   }
  };
  const button=doc.getElementById("refreshDailyRankingReadiness");
  if(button)button.addEventListener("click",refresh);
  await refresh();
 }
 return {pacificDay,fresh,summarize,mount};
});
