"use strict";
function normalizePickFinder(payload,capturedAt){
  if(!Array.isArray(payload?.items))throw new Error("PickFinder response missing items array");
  const rows=[],skipped=[];
  for(const item of payload.items){
    const name=item.player_name||item.player?.name;
    const rawMarket=String(item.market_name||item.market||item.stat_type||item.groupKey||"").toLowerCase();
    const markets={"shots on goal":"shotsOnGoal","shots":"shotsOnGoal","goals":"goals","assists":"assists","points":"points","blocked shots":"blockedShots","blocks":"blockedShots","saves":"saves","goalie saves":"saves"};
    const market=markets[rawMarket];
    const value=Number(item.line??item.line_score??item.prop_line);
    if(!name||!market||!Number.isFinite(value)||value<0){skipped.push({reason:"unrecognized field or market"});continue;}
    rows.push({source:"PickFinder",providerPlayerId:item.player_id||null,playerName:name,
      team:item.team?.abbreviation||item.team||null,market,line:value,capturedAt,
      providerMarket:rawMarket});
  }
  return {source:"PickFinder",capturedAt,rows,skipped,totalItems:payload.items.length};
}
module.exports={normalizePickFinder};
