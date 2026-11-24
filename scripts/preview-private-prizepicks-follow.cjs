"use strict";
const fs=require("node:fs"),path=require("node:path");
const {evaluateSharedLineup}=require("../src/private-prizepicks-follow-review.cjs");
const {discordPayload,shouldNotify,safeDiscordWebhook}=
 require("../src/private-follow-discord-alerts.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
async function main(env=process.env){
 const target=read("config/private-prizepicks-follow-target.json");
 if(!env.USER_SHARED_SLIP_JSON)throw Error("Requires a manually supplied structured PrizePicks lineup; no feed is scraped");
 const slip=JSON.parse(env.USER_SHARED_SLIP_JSON);
 const board=read("outputs/free-source/nhl/latest.json");
 const result=evaluateSharedLineup(target,slip,board);
 const eligibility=shouldNotify(target,result,{
  explicitDispatchApproval:env.EXPLICIT_DISCORD_ALERT==="true",
  hasWebhook:Boolean(env.PRIVATE_DISCORD_WEBHOOK_URL)});
 const preview={kind:result.kind,username:result.username,
  fingerprint:result.fingerprint,readOnly:true,
  observedSourceAgeVerified:result.independentSourceFresh,
  possibleUnfavorableBumps:result.possibleUnfavorableBumps,
  unverifiableLegs:result.unverifiableLegs,
  status:result.status,legs:result.legs.map(l=>({
   player:l.player,market:l.market,line:l.line,side:l.side,tier:l.tier,
   state:l.state,action:l.action
  })),
  originalPlatformAuthenticated:false,
  originalFollowingFeedConnected:false,
  automatedWagersPlaced:0,
  discordNotification:{enabled:eligibility.allow,reasons:eligibility.reasons}};
 const out=path.join(root,"outputs/private-follow/manual-slip-review.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(preview,null,2)+"\n");
 const safeSummary={status:result.status,possibleUnfavorableBumps:result.possibleUnfavorableBumps,
  unverifiableLegs:result.unverifiableLegs,
  sourceFresh:result.independentSourceFresh,notifyPermitted:eligibility.allow,
  entriesPlaced:0};
 console.log(JSON.stringify(safeSummary));
 if(env.GITHUB_STEP_SUMMARY){
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY,[
   "## Private brigue slip preview",
   "Manual shared lineup only. Original account authorship and offer availability are unverified.",
   "Result: "+result.status,
   "Possible unfavorable differences: "+result.possibleUnfavorableBumps,
   "Unverifiable legs: "+result.unverifiableLegs,
   "No automatic wager submission or PrizePicks account access."
  ].join("\n")+"\n");
 }
 if(!eligibility.allow)return {result,notification:"disabled"};
 if(!safeDiscordWebhook(env.PRIVATE_DISCORD_WEBHOOK_URL))
  throw Error("Discord webhook secret missing or invalid. Require exact Discord webhook origin");
 const response=await fetch(env.PRIVATE_DISCORD_WEBHOOK_URL,{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify(discordPayload(result)),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Discord notification failed: HTTP "+response.status);
 return {result,notification:"sent_to_private_webhook"};
}
if(require.main===module)main().catch(e=>{
 console.error("Private share preview unavailable: "+e.message);process.exitCode=1;
});
module.exports={main};
