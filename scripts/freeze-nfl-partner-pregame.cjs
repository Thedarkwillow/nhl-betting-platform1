"use strict";
/**
 * Create one new original NFL Standard research snapshot from the exact live
 * preview generated during the same private partner collection workflow.
 * The public workflow must push it to private GitHub BEFORE game start.
 */
const fs=require("node:fs"),path=require("node:path");
const {freeze}=require("../src/nfl-prospective-freeze.cjs");
const root=path.resolve(__dirname,"..");
function main(args=process.argv.slice(2),now=new Date().toISOString()){
 const input=args[0];
 if(!input)throw Error("Specify freshly created private NFL research preview JSON");
 const absolute=path.resolve(root,input);
 const prefix=path.join(root,"outputs","nfl","research")+path.sep;
 if(!absolute.startsWith(prefix)||!fs.statSync(absolute).isFile())
   throw Error("NFL input must be a private original partner research preview");
 const preview=JSON.parse(fs.readFileSync(absolute,"utf8"));
 const snapshot=freeze(preview,{now});
 try{
  const injuryPath=path.join(root,"outputs/nfl/availability/official-report-latest.json");
  const injuries=fs.existsSync(injuryPath)?JSON.parse(fs.readFileSync(injuryPath,"utf8")):null;
  snapshot.usageDirectionShadowV3=require("../src/nfl-directional-usage-challenger-v3.cjs").freeze(
   snapshot,{now,injuries});
 }catch(e){snapshot.usageDirectionShadowV3={
   status:"shadow_abstained_invalid_source",reason:e.message,
   rows:[],autoPicksApproved:false};}
 // V4 is a second, forward-only workload research screen. It never
 // changes the original first-Git selected side or approves a wager.
 try{
  const {history}=require("./grade-nfl-precommitted.cjs");
  snapshot.rushingStabilityShadowV4=require("../src/nfl-rushing-stability-shadow-v4.cjs").freeze(
   snapshot,history("player_weekly"));
 }catch(e){snapshot.rushingStabilityShadowV4={
   status:"not_enrolled_history_or_evidence_missing",reason:e.message,
   rows:[],modelPromoted:false,bettingEligible:false};}
 // Separate kicker shadow: do not change standard freeze eligibility or original selections.
 try{
  const ml=require("../src/priority-common-ml-shadow-v1.cjs"),artifact=ml.readCommitted(now),{dataset}=require("./build-nfl-partner-board-research.cjs"),{reconcile}=require("../src/nfl-kicker-reconciled-appearances.cjs");
  const rows=artifact?[2024,2025,2026].flatMap(y=>reconcile({schedule:dataset(y,"schedule"),rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks:dataset(y,"kicking_pbp"),teams:dataset(y,"team_weekly")}).rows):[];
  const source=preview.rows.filter(p=>p.sport==="NFL"&&ml.KICK_MARKETS.has(p.market)&&p.playerSourceId&&p.observedProviderGameId&&p.sourceProjectionId&&p.capturedAt===preview.sourceBoardAsOfAt&&["Higher","Lower"].includes(p.side));
  const seen=new Set(),out=[];for(const p of source){const key=JSON.stringify([p.observedProviderGameId,p.historicalPlayerId,p.market,p.line,p.side]);if(seen.has(key))continue;seen.add(key);const model=ml.kicker(p,rows,artifact,now);if(model)out.push({sourceGameId:p.observedProviderGameId,sourceProjectionId:p.sourceProjectionId,playerId:p.historicalPlayerId,season:p.season,week:p.week,opponent:p.opponent,team:p.team,market:p.market,line:p.line,offeredSide:p.side,eventStartsAt:p.eventStartsAt,capturedAt:p.capturedAt,model});}
  snapshot.kickerCommonMLShadow={rows:out,researchOnly:true,modelPromoted:false,officialActiveRosterVerified:false};
 }catch(e){snapshot.kickerCommonMLShadow={rows:[],researchOnly:true,status:"missing_reconciled_history_or_artifact"};}
 try{
 const ml=require("../src/priority-common-ml-shadow-v1.cjs"),artifact=ml.readCommitted(now),{dataset}=require("./build-nfl-partner-board-research.cjs"),{matchupSample}=require("../src/nfl-partner-board-research.cjs"),{SPECS}=require("./backtest-nfl-historical-stats.cjs");
 const weekly=[2024,2025,2026].flatMap(y=>dataset(y,"player_weekly")),schedule=[2024,2025,2026].flatMap(y=>dataset(y,"schedule")),cache=new Map(),out=[];
 for(const p of snapshot.selections){const spec=SPECS.find(x=>x.id===p.market);if(!spec||!ml.F["nfl_"+p.market]||ml.KICK_MARKETS.has(p.market))continue;const prior=weekly.filter(x=>x.player_id===p.historicalPlayerId&&(x.season<p.season||x.season===p.season&&x.week<p.week)).sort((a,b)=>a.season-b.season||a.week-b.week),pos=prior.at(-1)?.position;if(!pos)continue;const k=[p.season,p.week,p.market,pos].join("|");if(!cache.has(k))cache.set(k,matchupSample(weekly,schedule,p.season,p.week,spec,pos));const own=cache.get(k).filter(x=>x.playerId===p.historicalPlayerId&&x.team===p.team),model=ml.nfl(p,own,artifact,now);if(model)out.push({...p,model});}
 snapshot.expandedCommonMLShadow={rows:out,researchOnly:true,modelPromoted:false};
 }catch{snapshot.expandedCommonMLShadow={rows:[],researchOnly:true,status:"missing_history_or_artifact"};}
 try{const {oddsFrames}=require("./report-expanded-common-ml-forward.cjs"),{freeze:marketFreeze,gameContext}=require("../src/sportsbook-matched-model-research.cjs"),odds=oddsFrames();for(const row of [...(snapshot.expandedCommonMLShadow?.rows||[]),...(snapshot.kickerCommonMLShadow?.rows||[])]){const p=preview.rows.find(x=>x.sourceProjectionId===row.sourceProjectionId&&x.historicalPlayerId===(row.historicalPlayerId||row.playerId)&&x.observedProviderGameId===row.sourceGameId&&x.line===row.line);if(p){row.sportsbookML=marketFreeze({...p,sourceGameId:row.sourceGameId},odds,now,row.model.higher);row.sportsbookGameContext=gameContext(p,odds,now);}}}catch{}
 if(!snapshot.selections.length)
   throw Error("No supported, offered, pregame Standard directional NFL selections");
 const dest=path.join(root,"outputs","nfl","prospective",now.replace(/[-:]/g,"").slice(0,15)+"Z.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(snapshot,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({path:path.relative(root,dest),
   selected:snapshot.selections.length,sourceObservedAt:snapshot.sourceBoardAsOfAt,
   pendingOriginalRemoteGitProof:true,calibrated:false,automaticWagers:0}));
 return snapshot;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
