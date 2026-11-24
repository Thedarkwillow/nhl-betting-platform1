"use strict";
/**
 * Discord alert preview for manually supplied, privately reviewed shares.
 * No connection to the PrizePicks Following tab; no wager-submit path.
 */
const ALLOWED_STATES=new Set(["possible_unfavorable_line_bump",
 "different_but_potentially_favorable_line","matching_independent_line",
 "source_offer_not_matched","source_stale_or_unavailable",
 "ambiguous_source_lines","game_started_or_closed"]);
function discordPayload(report){
 if(report?.kind!=="private_follow_shared_slip_bump_review_v1"||
  report.username!=="brigue"||!Array.isArray(report.legs)||report.legs.length<2||
  report.legs.length>6||report.legs.some(l=>!ALLOWED_STATES.has(l.state)))
  throw Error("Only supported private manual follow-share reviews can be formatted");
 const label={
  possible_unfavorable_line_bump:"POSSIBLE WORSE LINE (review before copy)",
  different_but_potentially_favorable_line:"Different independent quote (verify)",
  matching_independent_line:"Independent observation matches (not app verified)",
  source_offer_not_matched:"No exact independent source match",
  source_stale_or_unavailable:"No fresh independent quote",
  ambiguous_source_lines:"Multiple inconsistent source lines",
  game_started_or_closed:"Game already started / closed"
 };
 const legs=report.legs.map((l,i)=>{
  const p=String(l.player||"").replace(/[\r\n@<>]/g," ").replaceAll(String.fromCharCode(96)," ").slice(0,60);
  return (i+1)+". "+p+" "+String(l.market||"").slice(0,25)+
   " "+l.side+" "+l.line+" ("+l.tier+") — "+label[l.state];
 });
 const status=report.possibleUnfavorableBumps?
  "Possible less favorable line(s) detected in an independent source.":
  report.unverifiableLegs?
   "Unverified/stale lines. Do not assume the shared slip can be copied unchanged.":
   "Independent source match only; verify the original app.";
 const body=[
  "**Private brigue shared-lineup research check**",
  "Source was manually submitted; account authorship and original offers NOT authenticated.",
  status,...legs,
  "**No entries placed.** Open the original PrizePicks app to verify every current offer.",
  "No payout, amount, or submission automation."
 ].join("\n");
 return {content:body.slice(0,1850),allowed_mentions:{parse:[]},
  flags:4,username:"Private Lineup Research Alerts"};
}
function shouldNotify(target,report,{explicitDispatchApproval=false,hasWebhook=false}={}){
 const reasons=[];
 if(target?.username!=="brigue"||target?.sourceMode!=="user_supplied_share_links_only")
  reasons.push("invalid_private_target");
 if(target?.alertsEnabled!==true||!Number.isInteger(target.maxDailyNotifications)||
    target.maxDailyNotifications<=0)reasons.push("notification_opt_in_disabled");
 if(!explicitDispatchApproval)reasons.push("not_explicitly_approved_for_this_dispatch");
 if(!hasWebhook)reasons.push("discord_webhook_secret_not_connected");
 if(report?.kind!=="private_follow_shared_slip_bump_review_v1"||
    report.username!=="brigue")reasons.push("invalid_shared_slip_report");
 return {allow:reasons.length===0,reasons,manualDispatchOnly:true,
  noFollowingFeedAccess:true,noWagersSubmitted:true};
}
function safeDiscordWebhook(url){
 try{
  const u=new URL(url);
  return u.protocol==="https:"&&u.hostname==="discord.com"&&
   /^\/api\/webhooks\/\d{16,22}\/[a-zA-Z0-9._-]{20,}$/.test(u.pathname)&&
   !u.username&&!u.password&&!u.search&&!u.hash;
 }catch{return false;}
}
module.exports={discordPayload,shouldNotify,safeDiscordWebhook};
