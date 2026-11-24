"use strict";
const MARKETS = {
  skater: ["shotsOnGoal", "goals", "assists", "points", "blockedShots"],
  goalie: ["saves"]
};
const MODELS=new Set(["weighted-form-v1","stable-shrink-v2","prior-mean-v2"]);
function projectPlayer(player, options = {}) {
  const model=options.model??"weighted-form-v1";
  if(!MODELS.has(model))throw new Error("Unsupported NHL projection model");
  const minGames = options.minGames ?? 5;
  if (!player || !MARKETS[player.type] || !Array.isArray(player.games)) throw new Error("Invalid player history");
  const games = [...player.games].sort((a,b)=>a.gameDate.localeCompare(b.gameDate) || a.gameId-b.gameId);
  const fields = MARKETS[player.type];
  const projections = {};
  for (const field of fields) {
    const valid = games.map(g=>g[field]).filter(Number.isFinite);
    const n = valid.length;
    const last5 = valid.slice(-5);
    const last10 = valid.slice(-10);
    const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
    // Weighted short- and medium-term form, with season baseline.
    // Challenger: shrink short-term trends toward the full available past.
    // The weight is frozen before evaluation; zero future-game inputs.
    const seasonMean=n?mean(valid):null;
    const shortForm=n?0.6*mean(last5)+0.4*mean(last10):null;
    const weight=Math.min(0.35,n/(n+30));
    const estimate=n < minGames ? null : model==="stable-shrink-v2"
      ? Math.max(0,seasonMean+weight*(shortForm-seasonMean))
      : model==="prior-mean-v2" ? seasonMean
      : 0.5*mean(last5)+0.3*mean(last10)+0.2*mean(valid);
    projections[field] = {
      estimate: estimate === null ? null : Math.round(estimate*1000)/1000,
      observations:n, ready:n>=minGames,
      last5: last5.length ? Math.round(mean(last5)*1000)/1000 : null,
      last10: last10.length ? Math.round(mean(last10)*1000)/1000 : null
    };
  }
  return {
    playerId:player.playerId,name:player.name,team:player.team,
    type:player.type,gamesPlayed:games.length,
    latestGameDate:games.at(-1)?.gameDate || null,
    model,minGames,projections
  };
}
function buildProjections(history, options = {}) {
  if (!history || !history.players) throw new Error("Missing historical player database");
  const players = Object.fromEntries(Object.entries(history.players).map(([id,p])=>[id,projectPlayer(p,options)]));
  return {schemaVersion:1,model:options.model??"weighted-form-v1",minGames:options.minGames??5,
    playerCount:Object.keys(players).length,
    readyPlayers:Object.values(players).filter(p=>Object.values(p.projections).some(x=>x.ready)).length,
    players};
}
module.exports={projectPlayer,buildProjections,MODELS};
