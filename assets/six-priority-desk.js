"use strict";
/**
 * Public research-only operations desk. Everything displayed is drawn from
 * backend-sanitized aggregate data, with fail-closed freshness/error states.
 */
(function(root){
const SOURCE_KIND="public_nhl_six_priority_evidence_brief_v1";
const isISO=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const formatAt=x=>isISO(x)?new Intl.DateTimeFormat("en-US",{
 timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",
 minute:"2-digit",timeZoneName:"short"}).format(new Date(x)):"Not archived";
const count=n=>Number.isInteger(n)&&n>=0?n.toLocaleString("en-US"):"Not verified";
const displayRate=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1?
 (100*x).toFixed(1)+"%":"Not established";
const read=brief=>brief&&brief.kind===SOURCE_KIND&&brief.schemaVersion===1?brief:null;
const safe=label=>String(label??"").slice(0,110);
function viewModel(brief,now=new Date().toISOString()){
 const d=read(brief);
 if(!d)return {status:"unavailable",title:"Research status not yet published",
  summary:"The verified aggregate report is missing. No collector, model or lineup is assumed healthy.",
  sections:[]};
 const created=isISO(d.generatedAt)?Date.parse(d.generatedAt):null,
  epoch=Date.parse(now),reportAge=created===null||!Number.isFinite(epoch)?Infinity:(epoch-created)/60000,
  reportCurrent=reportAge>=0&&reportAge<=30;
 const ops=d.operations||{},move=d.movements||{},score=d.scorecard||{},
  models=d.markets||{},risk=d.lineupRisk||{};
 const boardCurrent=reportCurrent&&ops.freshIndependentBoardAtExport===true&&
  isISO(ops.lastBoardCapturedAt)&&epoch-Date.parse(ops.lastBoardCapturedAt)<=30*60000;
 const opRows=[
  ["6 AM Pacific board",ops.sixAm==="archived_on_time"?"Captured on time":"Not verified"],
  ["9 AM Pacific board",ops.nineAm==="archived_on_time"?"Captured on time":"Not verified"],
  ["6 AM to 9 AM comparison",ops.sameDayDelta==="compared"?"Archived comparison":"Not verified"],
  ["Independent board",boardCurrent?"Current (under 30 minutes)":"Archived / unavailable"],
  ["Last source observation",formatAt(ops.lastBoardCapturedAt)],
  ["Provider allowance (archived)",ops.archivedQuotaUnit==="credits"&&
   Number.isInteger(ops.lastArchivedCreditsRemaining)?
   count(ops.lastArchivedCreditsRemaining)+" credits reported at capture (not live)":
   ops.archivedQuotaUnit==="requests"?
   "Request-metered; remaining allowance not verified":"Not verified"]
 ];
 const movements=move.counts?[
  ["Newly observed",count(move.counts.new_offer)],
  ["Higher thresholds",count(move.counts.increased)],
  ["Lower thresholds",count(move.counts.decreased)],
  ["Tier changes, stable source ID",count(move.counts.observed_tier_change)],
  ["Not observed again (unverified)",count(move.counts.not_seen_unverified)]
 ]:[["Comparison","No complete comparable snapshots"]];
 const scoreRows=score.status==="original_frozen_predictions_official_stat_grading"?[
  ["Precommitted model decisions",count(score.precommitted)],
  ["Official-stat wins",count(score.correct)],
  ["Official-stat losses",count(score.incorrect)],
  ["Pushes",count(score.push)],
  ["Pending official outcomes",count(score.pending)],
  ["Observed hit rate (not ROI)",displayRate(score.observedHitRate)],
  ["95% Wilson interval",score.wilson95?
   displayRate(score.wilson95.lower)+"–"+displayRate(score.wilson95.upper):
   "Insufficient verified decisions"]
 ]:[["Prospective scorecard","Original frozen pregame cohort unavailable or unverified"]];
 const marketRows=(Array.isArray(models.markets)?models.markets:[]).slice(0,9).map(m=>[
  safe(m.label),count(m.officialFinalGameRows)+" official player-games · "+
  count(m.athletesWithEightGames)+" players with ≥8 games · "+
  (typeof m.pastOnlyLast5MAE==="number"&&typeof m.pastOnlyLast10MAE==="number"?
   "Backtest MAE: last 5 "+m.pastOnlyLast5MAE+" / last 10 "+m.pastOnlyLast10MAE+
   " "+safe(m.errorUnit):m.modelStatus==="research_candidate_needs_holdout"?
   "Needs prospective holdout":"Needs data")
 ]);
 const riskRows=[
 ["Research lineups available",(Array.isArray(risk.lineupSizesWithResearchCards)?
  risk.lineupSizesWithResearchCards.join(", "):"")||"None"],
 ["Players reused across sizes",count(risk.crossLineupPlayersRepeated)],
 ["Highest appearances for one player",count(risk.maxLineupAppearancesForOnePlayer)],
 ["Measured correlation", "Not verified"],
 ["Lineup payout / joint win probability","Unavailable"]
 ];
 const lineupSizeRows=(Array.isArray(risk.bySize)?risk.bySize:[]).map(x=>
  [x.size+" picks",x.status==="research_only_source_timestamp_checked"?
   (x.sameGameOverlap?"Source-timed, same-game exposure":"Source-timed, distinct-game research"):
   x.status==="stale_or_structurally_unverified"?"Expired or incomplete":"Unavailable"]);
 const sections=[
  {key:"collection",label:"Collections",title:"6 AM / 9 AM capture health",
   rows:opRows,help:"On-time archive evidence is separate from a scheduled or successful GitHub job. The Cloudflare deployment alone does not confirm today's board. Source is third-party."},
  {key:"movement",label:"Movements",title:"Observed source-line changes",
   rows:movements,help:"Comparisons of independent snapshots only. Missing rows are not confirmed PrizePicks removals. Reposts and gaps between captures are unknown."},
  {key:"accuracy",label:"Accuracy",title:"Original pregame model scorecard",
   rows:scoreRows.concat(Array.isArray(score.byMarket)?score.byMarket.slice(0,6).map(m=>
    [safe(m.market)+" · "+count(m.decided)+" decisions",
     displayRate(m.observedRate)+" observed; "+count(m.pending)+" pending"]):[]),
   help:"Official NHL stat Higher/Lower outcomes, not original PrizePicks or Underdog settlement. Small samples and same-game dependence limit certainty."},
  {key:"markets",label:"Market lab",title:"Official NHL historical sample coverage",
   rows:marketRows.length?marketRows:[["Historical stat coverage","Not available"]],
   help:"Research coverage counts are not offered lines or calibrated probabilities. PrizePicks goalie-fantasy scoring values are user-provided and lack independent platform confirmation."},
  {key:"lineups",label:"Lineup risk",title:"2–6 pick concentration checks",
   rows:riskRows.concat(lineupSizeRows),
   help:"Source timestamps, repeated players and same-game overlaps are structural tests—not validated correlations, payout multipliers or EV."}
 ];
 return {status:reportCurrent?"research_saved":"archived_or_stale",
  title:"Research operations & model validation",
  summary:"Report "+formatAt(d.generatedAt)+" · "+
   (boardCurrent?"A recently archived independent board exists.":
    "No currently verified independent board.")+" No original-platform offers or payouts verified.",
  sections};
}
function text(tag,value,className){
 const e=document.createElement(tag);e.textContent=String(value);
 if(className)e.className=className;
 return e;
}
function renderSection(section,content){
 content.replaceChildren();
 content.append(text("h3",section.title,"desk-panel-title"));
 const list=document.createElement("dl");list.className="ops-data-grid";
 for(const [label,value] of section.rows){
  const box=document.createElement("div");box.className="ops-data-item";
  box.append(text("dt",label),text("dd",value));list.append(box);
 }
 content.append(list,text("p",section.help,"ops-help"));
}
function renderDesk(target,data,now=new Date().toISOString()){
 const model=viewModel(data?.sixPriorityBrief,now);
 const message=target.querySelector("[data-ops-summary]"),
 tabs=target.querySelector("[data-ops-tabs]"),
 content=target.querySelector("[data-ops-content]");
 if(!message||!tabs||!content)return;
 message.textContent=model.summary;
 tabs.replaceChildren();content.replaceChildren();
 if(!model.sections.length){content.append(text("p",model.summary,"ops-help"));return;}
 const buttons=[];
 for(const section of model.sections){
  const button=text("button",section.label,"ops-tab");
  button.type="button";button.setAttribute("role","tab");
  button.setAttribute("aria-selected","false");
  button.addEventListener("click",()=>{
   for(const b of buttons){b.setAttribute("aria-selected","false");b.classList.remove("active");}
   button.setAttribute("aria-selected","true");button.classList.add("active");
   content.setAttribute("aria-label",section.title);
   renderSection(section,content);
  });
  buttons.push(button);tabs.append(button);
 }
 buttons[0].click();
}
async function refresh(target){
 const status=target.querySelector("[data-ops-summary]");
 try{
  const result=await fetch("./data.json",{cache:"no-store"});
  if(!result.ok)throw Error("Published research unavailable");
  const data=await result.json();
  renderDesk(target,data);
 }catch(error){
  if(status)status.textContent="Unable to load verified research aggregates. No offers or accuracy are assumed current.";
  const c=target.querySelector("[data-ops-content]");if(c)c.replaceChildren();
 }
}
function bootstrap(){
 const target=document.getElementById("researchOperationsDesk");
 if(!target)return;
 target.querySelector("[data-ops-refresh]")?.addEventListener("click",()=>refresh(target));
 refresh(target);
}
if(typeof module==="object"&&module.exports)module.exports={viewModel};
if(root&&typeof root.addEventListener==="function")
 root.addEventListener("DOMContentLoaded",bootstrap);
})(typeof window!=="undefined"?window:null);
