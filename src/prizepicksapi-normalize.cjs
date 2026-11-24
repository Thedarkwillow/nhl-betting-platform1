"use strict";
// The live /projections endpoint supports TWO documented shapes:
// view=full: nested player/event/market objects and selections[] objects
// view=compact: flat player,team,stat,period,starts_at,tier,sides[] fields.
// Never infer absent team, game time, offered side or payout from a compact row.
// Source and demo fields are omitted in compact mode; use the authenticated
// /projections response only after the caller verifies meta.mode=live.
function parseProjection(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||p.league!=="NHL"||
    p.status!=="active"||p.is_demo===true||
    (p.source!==undefined&&p.source!=="prizepicks")||
    typeof p.id!=="string"||!/^pp_[A-Za-z0-9_-]{1,100}$/.test(p.id)||
    !Number.isFinite(p.line)||p.line<0||
    !Number.isFinite(Date.parse(p.observed_at)))return null;
 const compact=typeof p.player==="string";
 if(!compact){
  if(typeof p.player?.name!=="string"||typeof p.player?.team!=="string"||
     typeof p.market?.stat!=="string"||
     typeof p.event?.starts_at!=="string"||
     !Array.isArray(p.selections))return null;
  return {
   id:p.id,player:p.player.name.trim(),team:p.player.team.trim(),
   market:p.market.stat.trim(),period:p.market.period??null,
   opponent:p.event.opponent??null,startsAt:p.event.starts_at,
   observedAt:p.observed_at,line:p.line,sourceFields:p.source_fields||null,
   selectionRows:p.selections,lineContext:p.line_context||null
  };
 }
 // Compact data intentionally does not contain nested "source", "event"
 // or "selections". Restrict to exact documented keys/enum values.
 if(typeof p.team!=="string"||typeof p.stat!=="string"||
    typeof p.period!=="string"||typeof p.starts_at!=="string"||
    typeof p.tier!=="string"||!["standard","goblin","demon"].includes(p.tier)||
    !Array.isArray(p.sides)||p.sides.length<1||p.sides.length>2||
    p.sides.some(s=>s!=="more"&&s!=="less")||
    new Set(p.sides).size!==p.sides.length)return null;
 const selections=p.sides.map(side=>({
  side,available:true,tier:p.tier,payout_multiplier:null
 }));
 return {
  id:p.id,player:p.player.trim(),team:p.team.trim(),
  market:p.stat.trim(),period:p.period,opponent:p.opponent??null,
  startsAt:p.starts_at,observedAt:p.observed_at,line:p.line,
  // Compact gives only opening_line and line_moves; it does not prove
  // detailed movements, opening timestamp or individual side payouts.
  lineContext:null,sourceFields:null,selectionRows:selections
 };
}
function normalizeProjections(data,at,{validatedAsOfAt=null}={}){
 const rows=[],skipped={invalid:0,stale:0,started:0,unavailable:0,duplicate:0};
 const now=Date.parse(at),seen=new Set();
 // /board?as_of= supplies active board membership at the verified time.
 // Its per-row observed_at can be the LAST LINE-CHANGE time, not the last
 // board confirmation. Only an explicitly validated immutable as-of
 // traversal may bypass the row-age filter; never bypass started-game
 // filtering or future observations.
 const fixedAsOf=validatedAsOfAt===null?null:Date.parse(validatedAsOfAt);
 if(!Number.isFinite(now)||!Array.isArray(data)||
    (validatedAsOfAt!==null&&(!Number.isFinite(fixedAsOf)||
     fixedAsOf>now||now-fixedAsOf>300000)))
  throw Error("Invalid NHL normalization clock or verified as-of provenance");
 for(const p of data){
  const item=parseProjection(p);
  if(!item||!item.player||!item.team||!item.market||
     !Number.isFinite(Date.parse(item.startsAt))){
   skipped.invalid++;continue;
  }
  const obs=Date.parse(item.observedAt),start=Date.parse(item.startsAt);
  if(obs>now+60000||(fixedAsOf!==null&&obs>fixedAsOf+1000)||(fixedAsOf===null&&now-obs>1800000)){
   skipped.stale++;continue;
  }
  if(start<=now||obs>=start||
     item.sourceFields?.in_game===true||item.sourceFields?.is_live===true){
   skipped.started++;continue;
  }
  let count=0;
  for(const s of item.selectionRows){
   const tier=String(s?.tier||"").toLowerCase(),side=String(s?.side||"").toLowerCase();
   if(s?.available!==true||!["standard","goblin","demon"].includes(tier)||
      !["more","less"].includes(side)||(tier!=="standard"&&side!=="more"))continue;
   const key=[item.id,item.line,tier,side].join("|");
   if(seen.has(key)){skipped.duplicate++;continue;}
   seen.add(key);count++;
   const payout=Number.isFinite(s.payout_multiplier)?s.payout_multiplier:null;
   rows.push({projectionId:item.id,player:item.player,team:item.team,
     market:item.market,line:item.line,matchup:item.opponent,
     period:item.period,tier:tier[0].toUpperCase()+tier.slice(1),
     side:side==="more"?"Higher":"Lower",isLive:false,
     payoutMultiplier:payout,tierPayoutVerified:payout!==null,
     eventStartsAt:item.startsAt,observedAt:item.observedAt,capturedAt:at,
     source:"prizepicks",provider:"prizepicksapi.com",lineContext:item.lineContext});
  }
  if(!count)skipped.unavailable++;
 }
 return {rows,skipped};
}
module.exports={normalizeProjections,parseProjection};
