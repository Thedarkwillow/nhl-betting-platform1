"use strict";
/** Fail closed when primary capture has not *finished and failed* today.
 * A green GitHub job alone is not proof of original pregame frozen picks.
 * This guards against delayed GitHub schedule runs and parallel API spending.
 */
const NAME="One-Shot NHL Pregame Prospective Freeze (2026-11-03)";
const stamp=x=>typeof x==="string"?Date.parse(x):NaN;
function primaryFailedBeforeBackup(runs,now=new Date().toISOString()){
 const t=stamp(now);
 if(!Array.isArray(runs)||!Number.isFinite(t))
  throw Error("GitHub primary workflow run metadata unavailable");
 const day=new Date(t).toISOString().slice(0,10);
 const recent=runs.filter(x=>x?.name===NAME&&x?.event==="schedule"&&
  x?.head_branch==="main"&&Number.isFinite(stamp(x.created_at))&&
  stamp(x.created_at)<=t&&x.created_at.slice(0,10)===day)
  .sort((a,b)=>stamp(b.created_at)-stamp(a.created_at));
 const last=recent[0]||null;
 const eligible=last?.status==="completed"&&last.conclusion==="failure";
 return {eligible,source:"GitHub Actions scheduled primary workflow only",
  primaryRunId:Number.isSafeInteger(last?.id)?last.id:null,
  primaryConclusion:last?.conclusion||null,
  primaryStatus:last?.status||null,
  primaryCreatedAt:last?.created_at||null,
  decision:eligible?"primary_failed_before_backup":
   !last?"no_primary_run_confirmed_today":
   last.status!=="completed"?"primary_still_running_or_queued":
   "primary_not_failed_or_unknown",
  billedProviderRequests:0,originalFrozenSelectionsNotImplied:true};
}
module.exports={NAME,primaryFailedBeforeBackup};
