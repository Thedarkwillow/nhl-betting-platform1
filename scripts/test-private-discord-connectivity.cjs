"use strict";
/**
 * One-time webhook connectivity ping only: no PrizePicks API requests, wagers,
 * followed-account access, or recurrence.
 */
const {safeDiscordWebhook}=require("../src/private-follow-discord-alerts.cjs");
async function main(env=process.env,post=fetch){
 const raw=env.PRIVATE_DISCORD_WEBHOOK_URL;
 if(!raw||!safeDiscordWebhook(raw))throw Error("PRIVATE_DISCORD_WEBHOOK_URL secret is missing or not a valid Discord incoming webhook");
 const payload={
  content:"✅ Private brigue research alerts: Discord connection verified. This is a one-time webhook test only. No PrizePicks slip has been detected, copied or submitted; live alerts remain disabled.",
  allowed_mentions:{parse:[]}
 };
 const res=await post(raw,{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify(payload),
  signal:AbortSignal.timeout(12000)
 });
 if(!res.ok)throw Error("Discord webhook test failed with HTTP "+res.status);
 console.log("Discord webhook connectivity check passed (one test message; no wagering or live monitoring).");
 return {webhookDelivered:true,liveMonitoringEnabled:false,entriesPlaced:0};
}
if(require.main===module)main().catch(e=>{
 console.error("Private Discord connection test failed: "+e.message);
 process.exitCode=1;
});
module.exports={main};
