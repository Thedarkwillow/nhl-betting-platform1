"use strict";
const MARKETS = new Set(["shotsOnGoal","goals","assists","points","blockedShots","saves"]);
const SOURCES = new Set(["PrizePicks","PickFinder"]);
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const initialSurname=s=>{const parts=String(s||"").trim().split(/\s+/);return parts.length>1?norm(parts[0][0]+parts.slice(1).join("")):"";};
function sameName(a,b){return norm(a)===norm(b)||(initialSurname(a)&&initialSurname(a)===initialSurname(b));}
function compareLines(input, projections, now = new Date()) {
  if (!Array.isArray(input?.lines) || !projections?.players) throw new Error("Expected lines array and projection database");
  const seen = new Set();
  const candidates = [];
  const skipped = [];
  for (const line of input.lines) {
    const key = String(line.playerId) + ":" + line.market + ":" + line.line + ":" + line.source;
    if (seen.has(key)) { skipped.push({line,reason:"duplicate"}); continue; }
    seen.add(key);
    if (!SOURCES.has(line.source) || !MARKETS.has(line.market) ||
        !Number.isInteger(line.playerId) || !Number.isFinite(line.line) || line.line < 0 ||
        typeof line.capturedAt !== "string" || !Number.isFinite(Date.parse(line.capturedAt))) {
      skipped.push({line,reason:"invalid line metadata"}); continue;
    }
    const ageHours = (now.getTime() - Date.parse(line.capturedAt))/3600000;
    if (ageHours < -0.25 || ageHours > 12) {
      skipped.push({line,reason:"line older than 12 hours or timestamp in future"}); continue;
    }
    const player = projections.players[String(line.playerId)];
    if (!player || !player.projections?.[line.market]?.ready) {
      skipped.push({line,reason:"player projection unavailable"}); continue;
    }
    if (line.playerName && !sameName(line.playerName,player.name)) {
      skipped.push({line,reason:"player name mismatch"}); continue;
    }
    if(line.team && player.team && norm(line.team)!==norm(player.team)){skipped.push({line,reason:"team mismatch"});continue;}
    const projection = player.projections[line.market].estimate;
    const delta = Math.round((projection - line.line)*1000)/1000;
    candidates.push({
      source:line.source,playerId:line.playerId,playerName:player.name,
      team:player.team,market:line.market,line:line.line,
      capturedAt:line.capturedAt,projection,delta,
      direction:delta>0?"higher":delta<0?"lower":"neutral",
      observations:player.projections[line.market].observations,
      note:"Projection difference only; not a calibrated win probability or betting edge"
    });
  }
  candidates.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return {schemaVersion:1,generatedAt:now.toISOString(),candidates,skipped,
    caution:"Research only. Verify live lines, player availability, and odds before interpreting."};
}
module.exports={compareLines};
