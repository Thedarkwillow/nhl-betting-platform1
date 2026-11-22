"use strict";
/** Guard a quota-limited independent NFL Standard preview from delayed cron.
 * Research-only: none of these statuses authorize app quotes or active players.
 * Manual dispatch remains explicit; automatic polls may only run at the
 * originally intended local hour on NFL game days, no afternoon catch-up.
 */
const local=now=>{
 const t=typeof now==="number"?now:Date.parse(now);
 if(!Number.isFinite(t))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",weekday:"short",hour:"2-digit",hourCycle:"h23"
 }).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return {weekday:parts.weekday,hour:Number(parts.hour)};
};
function shouldCapture({event,now,freshArchive=false}={}){
 if(!["schedule","workflow_run","workflow_dispatch"].includes(event))return false;
 const context=local(now);
 if(!context)return false;
 if(event==="workflow_dispatch")return true; // explicit user-run, provider guards still apply
 if(freshArchive===true||!["Sun","Mon","Thu"].includes(context.weekday))return false;
 return event==="schedule"?context.hour===7:context.hour===6;
}
module.exports={shouldCapture,local};
