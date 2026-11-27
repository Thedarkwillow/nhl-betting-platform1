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
 function pacificHour(at){
  return Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
   hour:"2-digit",hourCycle:"h23"}).format(new Date(at)));
 }
 function summarize({health,freeze,diagnostic}={},now=Date.now()){
  const today=pacificDay(now);
  const valid=health?.kind==="public_nhl_nfl_pacific_morning_collection_health_v1"&&
   health.pacificDate===today&&validTime(health.generatedAt)&&Date.parse(health.generatedAt)<=now;
  const slots=valid?health.slots||{}:{};
  const captured=(slot,hour)=>slot?.status==="privately_archived_complete"&&
   fresh(slot.observedAt,now,24*60)&&pacificDay(Date.parse(slot.observedAt))===today&&
   pacificHour(Date.parse(slot.observedAt))===hour&&Date.parse(slot.observedAt)<=Date.parse(health.generatedAt)&&
   Number.isInteger(slot.nhlOffers)&&slot.nhlOffers>0&&
   Number.isInteger(slot.nflOffers)&&slot.nflOffers>0;
  const describeSlot=(key,hour)=>{
   const slot=slots[key], verified=captured(slot,hour), localHour=pacificHour(now);
   const outcome=verified?"verified":localHour<hour?"not yet due":localHour===hour?"awaiting verification":
    slot?.status==="no_verified_full_capture"&&pacificHour(Date.parse(health.generatedAt))>hour?
     "no verified archive":"post-window audit pending";
   return {key,hour,verified,outcome};
  };
  const captureSlots=[describeSlot("06:00",6),describeSlot("09:00",9)];
  const [six,nine]=captureSlots.map(x=>x.verified);
  const source=captureSlots.some(x=>x.verified&&x.key===freeze?.captureSlotPacific&&
   slots[x.key].observedAt===freeze.sourceCaptureFinishedUTC);
  const frozen=source&&freeze?.kind==="public_safe_nhl_nfl_original_pregame_freeze_status_v1"&&
   freeze.firstGitAdditionVerified===true&&freeze.originalModelDirectionsBeforeKickoff===true&&
   validTime(freeze.originalPrivateGitCommitUTC)&&
   Date.parse(freeze.originalPrivateGitCommitUTC)>=Date.parse(freeze.sourceCaptureFinishedUTC)&&
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
   date:today,sourceStatus:captureSlots.map(x=>x.hour+" AM "+x.outcome).join(" · "),
   sourceDetail:six&&nine?"Original NHL/NFL source observations independently archived":"A delayed run alone does not verify a board capture",
   frozenStatus:frozen?freeze.pregameSelections.NHL.count+" NHL / "+freeze.pregameSelections.NFL.count+" NFL research directions frozen":"Pregame freeze not verified against the latest source",
   rankingStatus:approved?diagnostic.publishedRows+" fresh public research rows":"Fresh public player rankings withheld",
   rankingDetail:approved?
    "Independent-source research only; no calibrated probabilities, verified app availability or payouts":
    "Private capture does not authorize public player lines. Status: "+reason+".",
   six,nine,captureSlots,frozen,approved,originalAppVerified:false,calibrated:false
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
    const settled=await Promise.allSettled(names.map(async name=>{
     const res=await fetchFn("./data/"+name,{cache:"no-store"});
     if(!res.ok)throw Error("status feed unavailable");
     return res.json();
    }));
    const values=settled.map(item=>item.status==="fulfilled"?item.value:null);
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
