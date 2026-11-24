"use strict";
const MARKETS = {
  "shots on goal":"shotsOnGoal","shots":"shotsOnGoal",
  "goals":"goals","assists":"assists","points":"points",
  "blocked shots":"blockedShots","blocks":"blockedShots",
  "goalie saves":"saves","saves":"saves"
};
function normalizeBoard(payload, capturedAt) {
  if (!Array.isArray(payload?.data)) throw new Error("Invalid PrizePicks response: data array missing");
  const included = new Map((payload.included || []).map(x=>[x.type+":"+x.id,x]));
  const rows=[],skipped=[];
  for (const item of payload.data) {
    const a=item.attributes||{};
    const relation=item.relationships?.new_player?.data || item.relationships?.player?.data;
    const player=relation && included.get(relation.type+":"+relation.id);
    const name=a.player_name || player?.attributes?.name || player?.attributes?.display_name;
    const stat=String(a.stat_type||a.stat_display_name||"").trim().toLowerCase();
    const market=MARKETS[stat];
    const value=Number(a.line_score);
    const tier=String(a.odds_type||a.odds_tier||(a.adjusted_odds?"demon":"standard")).toLowerCase();
    if (!name || !market || !Number.isFinite(value) || value<0 || a.is_live || a.in_game) {
      skipped.push({projectionId:String(item.id),reason:"missing or unsupported pregame market"});continue;
    }
    rows.push({
      source:"PrizePicks",projectionId:String(item.id),playerName:name,
      providerPlayerId:relation?.id||null,team:a.team||player?.attributes?.team||null,
      market,line:value,tier,capturedAt,
      startTime:a.start_time||null
    });
  }
  return {source:"PrizePicks",capturedAt,rows,skipped};
}
module.exports={normalizeBoard};
