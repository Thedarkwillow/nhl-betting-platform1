"use strict";
// nflfastR's fixed drive groups may include the scoring opponent's try after
// a defensive TD. The try is not an offensive possession. Original NFL
// drive boundary fields describe a different grouping and are not rewritten.
const types=new Set(["pass","run","qb_spike","qb_kneel","punt","field_goal"]);
const flag=x=>x===0||x===1;
const validId=x=>Number.isInteger(x)&&x>=0;
function reconcile(filtered,full,team,opp,diagnostics=null){
 const fail=(reason,drive=null)=>{if(diagnostics)diagnostics.push({reason,drive});return null;};
 if(!full?.length||new Set(full.map(x=>x.play_id)).size!==full.length||full.some(x=>!validId(x.play_id)))return fail('invalid_source_identity');
 const byId=new Map(full.map(x=>[x.play_id,x]));
 if(filtered.some(x=>!byId.has(x.play_id)||byId.get(x.play_id).posteam!==x.posteam||byId.get(x.play_id).defteam!==x.defteam||byId.get(x.play_id).play_type!==x.play_type))return fail('filtered_identity_mismatch');
 const candidates=full.filter(x=>types.has(x.play_type)&&x.posteam===team&&x.defteam===opp);
 if(!candidates.length||candidates.some(x=>!flag(x.two_point_attempt)||!flag(x.extra_point_attempt)))return fail('invalid_candidate_try_flag');
 const isTry=x=>x.two_point_attempt===1||x.extra_point_attempt===1;
 const own=candidates.filter(x=>!isTry(x));
 if(!own.length||own.some(x=>!validId(x.fixed_drive)))return fail('missing_fixed_group');
 const groups=new Map();for(const x of [...full].sort((a,b)=>a.play_id-b.play_id)){if(!validId(x.fixed_drive))continue;const a=groups.get(x.fixed_drive)||[];a.push(x);groups.set(x.fixed_drive,a);}
 const ids=new Set(own.map(x=>x.fixed_drive)),drives=[];
 for(const id of ids){
  const rows=groups.get(id),off=rows.filter(x=>types.has(x.play_type));
  if(!rows.length||off.some(x=>!flag(x.two_point_attempt)||!flag(x.extra_point_attempt)))return fail('invalid_try_flag',id);
  const plays=off.filter(x=>!isTry(x));
  if(!plays.length||plays.some(x=>x.posteam!==team||x.defteam!==opp))return fail('mixed_non_try_ownership',id);
  // Verify fixed group is a contiguous run of labeled plays. Neutral source
  // rows without a fixed id do not establish possession or outcome.
  if(full.some(x=>x.play_id>rows[0].play_id&&x.play_id<rows.at(-1).play_id&&validId(x.fixed_drive)&&x.fixed_drive!==id))return fail('noncontiguous_group',id);
  const results=[...new Set(plays.map(x=>x.fixed_drive_result))];
  if(results.length!==1||!["Touchdown","Opp touchdown","Field goal","Missed field goal","Safety","Punt","Turnover","Turnover on downs","End of half"].includes(results[0]))return fail("unsupported_or_conflicting_result",id);
  const result=results[0];
  // Explicit terminal event evidence for scoring, punts, and turnovers.
  const supported=result==="Touchdown"?plays.some(x=>x.touchdown===1&&x.td_team===team):result==="Opp touchdown"?plays.some(x=>x.touchdown===1&&x.td_team===opp):result==="Field goal"?plays.some(x=>x.field_goal_result==="made"):result==="Missed field goal"?plays.some(x=>["missed","blocked"].includes(x.field_goal_result)):result==="Punt"?plays.some(x=>x.punt_attempt===1||x.play_type==="punt"):result==="Turnover"?plays.some(x=>x.interception===1||x.fumble_lost===1):result==="Safety"?plays.some(x=>x.safety===1):result==="Turnover on downs"?plays.some(x=>x.down===4&&Number.isFinite(x.yards_gained)&&Number.isFinite(x.ydstogo)&&x.yards_gained<x.ydstogo):rows.some(x=>x.game_seconds_remaining===0||x.game_seconds_remaining===1800);
  if(!supported)return fail('terminal_evidence_missing',id);
  const yard=plays.map(x=>x.yardline_100);
  if(yard.some(x=>!Number.isFinite(x)||x<0||x>100))return fail('invalid_yardline',id);
  drives.push({result,redZone:yard.some(x=>x<=20),fixedDriveId:id,observedFirstPlayId:rows[0].play_id,observedLastPlayId:rows.at(-1).play_id});
 }
 return {verifiedObservedDrives:drives.length,verifiedObservedRedZoneDrives:drives.filter(x=>x.redZone).length,verifiedObservedRedZoneTouchdowns:drives.filter(x=>x.redZone&&x.result==="Touchdown").length,verifiedObservedPuntDrives:drives.filter(x=>x.result==="Punt").length,verifiedObservedFieldGoalDrives:drives.filter(x=>x.result==="Field goal").length,fullSourceBoundaryVerified:true,fixedGroupReconciled:true,redZoneDefinition:"observed offensive snap at or inside 20",completeDriveChartVerified:false};
}
module.exports={reconcile};
