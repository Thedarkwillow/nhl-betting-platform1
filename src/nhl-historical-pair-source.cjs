"use strict";
/**
 * Use ONLY already cached official 2025-26 NHL player game logs.
 * No paid or free network requests; do not infer absent historical team IDs.
 * Provenance ties to the same graded historical archive that produced the cache.
 */
const FIELDS=["shotsOnGoal","goals","assists","points","blockedShots","saves","shotsAgainst"];
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"));
const integer=x=>Number.isInteger(x)&&x>0;
function mergePriorOfficialPairHistory(history,supplement,audit){
 const base={history,metadata:{status:"cached_prior_official_log_not_verified",
  addedOfficialPlayerGames:0,playersWithSupplement:0,
  historicalTeamLabelsAvailable:false,
  sourceErrorCount:0,officialSeasonCompletenessVerified:false,
  providerCallsMade:0}};
 if(!history?.players||supplement?.schemaVersion!==2||
  !supplement?.source?.startsWith("NHL Web game logs")||
  !supplement?.logs||typeof supplement.logs!=="object"||
  !audit?.generatedAt||audit.generatedAt!==supplement.lineOutcomeAuditGeneratedAt||
  audit.archiveGeneratedAt!==supplement.archiveGeneratedAt)return base;
 const players={...history.players},seenIds=new Set(),stats={added:0,invalid:0,duplicates:0};
 for(const [rawId,gameLogs]of Object.entries(supplement.logs)){
  const id=Number(rawId);
  if(!integer(id)||!Array.isArray(gameLogs)){stats.invalid++;continue;}
  const original=players[rawId]||{playerId:id,name:null,team:null,type:null,games:[]};
  const existing=new Map((original.games||[]).map(g=>[g.gameId,g])),
   append=[];
  for(const g of gameLogs){
   if(!integer(g?.gameId)||!date(g.gameDate)||g.gameDate<"2025-07-01"||
    g.gameDate>="2026-07-01"||g.season!=="2025-26"||
    !FIELDS.some(m=>Number.isFinite(g[m])&&g[m]>=0)){
    stats.invalid++;continue;
   }
   if(existing.has(g.gameId)||append.some(x=>x.gameId===g.gameId)){
    stats.duplicates++;continue;
   }
   // A team is NOT present in this historical NHL web-log cache.
   // Match on exact official game+player, never invent a teammate identity.
   append.push({gameId:g.gameId,playerId:id,gameDate:g.gameDate,
    team:null,side:null,type:null,source:"cached_official_NHL_2025_26_player_game_log",
    ...Object.fromEntries(FIELDS.map(k=>[k,Number.isFinite(g[k])&&g[k]>=0?g[k]:null]))});
   stats.added++;
  }
  if(append.length){
   players[rawId]={...original,games:[...(original.games||[]),...append]};
   seenIds.add(id);
  }
 }
 return {history:{...history,players},metadata:{
  status:"cached_official_prior_season_player_game_logs_provenance_matched",
  addedOfficialPlayerGames:stats.added,playersWithSupplement:seenIds.size,
  invalidOrUnsupportedRows:stats.invalid,existingDuplicatesIgnored:stats.duplicates,
  historicalTeamLabelsAvailable:false,
  sourceErrorCount:Array.isArray(supplement.errors)?supplement.errors.length:null,
  officialSeasonCompletenessVerified:false,
  providerCallsMade:0,
  source:"Cached NHL Web official 2025-26 game logs cross-verified to archived official-stat audit",
  intendedUse:"private descriptive repeated player count-stat correlation only",
  originalPlatformHitCorrelationsVerified:false}};
}
module.exports={mergePriorOfficialPairHistory};
