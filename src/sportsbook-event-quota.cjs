"use strict";
const dt=x=>Date.parse(x);
const SPORT_CAP=6,DAY_CAP=12;
// A legacy whole-day reservation can only be split when the immutable completed
// archive proves a clean single-sport batch; otherwise charge the entire day.
function allowance({sport,date,marker,legacy,completed}){
 if(!["NHL","NFL"].includes(sport)||marker)return 0;
 if(!legacy)return SPORT_CAP;
 if(legacy.pacificDate!==date||legacy.reservedCredits!==DAY_CAP||completed?.pacificDate!==date||completed?.status!=="fresh_bounded_archive"||completed.failure||completed.reservedCredits!==DAY_CAP||!Number.isInteger(completed.plannedCreditsAttempted)||completed.plannedCreditsAttempted!==completed.quotaCreditsReported||completed.quotaCreditsReported<1||completed.quotaCreditsReported>SPORT_CAP)return 0;
 const other=sport==="NHL"?"NFL":"NHL",results=completed.results||{};
 if(Object.keys(results).length!==1||!results[other]||results[other].status!=="fresh_two_sided_quotes"||!Array.isArray(completed.rows)||!completed.rows.length||completed.rows.some(r=>r.sport!==other))return 0;
 if(!(dt(legacy.createdAt)<=dt(completed.generatedAt)))return 0;
 return SPORT_CAP;
}
// All bridge matches are anchored to exact canonical home/away teams and unique
// official NHL ID. The sportsbook's separate start timestamp is retained.
function selectEvents({sport,events,board,official,officialFresh,now,club,pair,norm}){
 const diag={boardRows:board.length,providerEvents:Array.isArray(events)?events.length:0,matchedEvents:0,noBoardTeam:0,noTimeMatch:0,ambiguous:0,notFuture:0,officialMissing:0,officialBridged:0,teamMatches:[]};
 const out=[];
 for(const e of Array.isArray(events)?events:[]){
  const eAt=dt(e.commence_time),clubs=pair(norm(e.home_team),norm(e.away_team));
  if(!e.id||!clubs||!(eAt>now+20*60000&&eAt<=now+36*3600000)){diag.notFuture++;continue;}
  const same=board.filter(r=>r.teams===clubs);
  if(!same.length){diag.noBoardTeam++;continue;}
  let matched=[],officialId=null,officialTime=null,method="direct_5m";
  if(sport==="NHL"){
   const g=(official||[]).filter(x=>Number.isInteger(x.id)&&["FUT","PRE"].includes(x.gameState)&&club(sport,x.home)===norm(e.home_team)&&club(sport,x.away)===norm(e.away_team)&&dt(x.startTimeUTC)>now+20*60000&&Math.abs(dt(x.startTimeUTC)-eAt)<=(officialFresh?30:5)*60000&&same.some(r=>Math.abs(r.start-dt(x.startTimeUTC))<=5*60000));
   if(g.length!==1){if(g.length>1)diag.ambiguous++;else diag.officialMissing++;diag.teamMatches.push({teams:clubs,providerStart:e.commence_time,boardStarts:[...new Set(same.map(r=>new Date(r.start).toISOString()))],reason:g.length>1?"ambiguous_official":"no_unique_official_schedule"});continue;}
   officialId=g[0].id;officialTime=g[0].startTimeUTC;
   matched=same.filter(r=>Math.abs(r.start-dt(officialTime))<=5*60000&&r.start>now+20*60000);
   if(Math.abs(dt(officialTime)-eAt)>5*60000||matched.some(r=>Math.abs(r.start-eAt)>5*60000)){if(!officialFresh){diag.noTimeMatch++;continue;}method="official_schedule_bridge";}
  }else matched=same.filter(r=>Math.abs(r.start-eAt)<=5*60000);
  const ids=new Set(matched.map(r=>r.game).filter(Boolean));
  if(ids.size!==1||matched.some(r=>!r.game)){diag[ids.size>1?"ambiguous":"noTimeMatch"]++;continue;}
  const game=[...ids][0],marketCounts=new Map();
  for(const p of matched){const a=marketCounts.get(p.marketKey)||new Set();if(p.tier==="standard")a.add(JSON.stringify([p.playerId,p.line]));marketCounts.set(p.marketKey,a);}
  const priority=["player_total_saves","player_shots_on_goal","player_blocked_shots","player_assists","player_points","player_goals"];
  const markets=[...marketCounts].sort((a,b)=>{if(sport==="NHL"){const ap=priority.indexOf(a[0]),bp=priority.indexOf(b[0]);if(ap!==bp)return ap-bp;}else{const special=k=>["player_field_goals","player_kicking_points"].includes(k)?0:1;if(special(a[0])!==special(b[0]))return special(a[0])-special(b[0]);}return b[1].size-a[1].size||a[0].localeCompare(b[0]);}).filter(x=>x[1].size>0).slice(0,3).map(x=>x[0]);
  if(markets.length)out.push({sport,e,markets,coverage:matched.length,boardGame:game,officialId,officialTime,method,boardStart:new Date(matched[0].start).toISOString()});
 }
 const unique=out.filter(x=>out.filter(y=>y.boardGame===x.boardGame).length===1);
 diag.ambiguous+=out.length-unique.length;diag.matchedEvents=unique.length;diag.officialBridged=unique.filter(x=>x.method==="official_schedule_bridge").length;
 return {targets:unique.sort((a,b)=>dt(a.e.commence_time)-dt(b.e.commence_time)||b.coverage-a.coverage).slice(0,2),diag};
}
// Keep each event at <=3 markets, each sport at <=6 credits/day. Rotate one context batch, preserve specialist opportunity.
function planMarkets(markets,{first,date,sport}){const p=[...new Set(markets)].slice(0,3);if(!first)return p;const day=Number(String(date).slice(-2));if(!p.length)return [];return day%2===0&&p.length>=2?[...p.slice(0,2),"h2h"]:[p[0],"spreads","totals"];}
// Two independently reserved three-credit batches. Legacy reservations
// consume the whole sport allowance; uncertain receipts are never refunded.
function slotAllowance({legacy,legacyMarker,first,second,now}){
 if(legacy||legacyMarker||second)return {credits:0,slot:null};
 if(!first)return {credits:3,slot:"first"};
 if(first.kind!=="private_sportsbook_slot_reservation_v3"||first.reservedCredits!==3||!Array.isArray(first.markets)||first.markets.length<1||first.markets.length>3||new Set(first.markets).size!==first.markets.length||!first.eventId||!Number.isFinite(dt(first.createdAt))||now-dt(first.createdAt)<3600000)return {credits:0,slot:null};
 return {credits:3,slot:"repeat",eventId:first.eventId,markets:first.markets};
}
module.exports={allowance,selectEvents,planMarkets,slotAllowance,SPORT_CAP,DAY_CAP};
