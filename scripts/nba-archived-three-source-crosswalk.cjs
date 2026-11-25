"use strict";
// Archived evidence only. Provider IDs stay separate; no offer or model promotion.
const fs=require("node:fs"),crypto=require("node:crypto");
const {COLUMNS,offeredSides}=require("../src/partner-prizepicks-board.cjs");
const {teams,market}=require("../src/nba-research-pipeline-v1.cjs");
const dt=Date.parse,valid=t=>typeof t==="string"&&Number.isFinite(dt(t));
const eastern=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const unique=(rows,key)=>new Set(rows.map(key)).size===rows.length;
const team=t=>/^[A-Z]{3}$/.test(teams(t));
const pair=(g,h)=>teams(g.home)===teams(h.home)&&teams(g.away)===teams(h.away)&&Math.abs(dt(g.startAt)-dt(h.startAt))<=300000;
function audit(official,bdl,board){
 if(official?.kind!=="nba_official_schedule_v1"||!valid(official.capturedAt)||!Array.isArray(official.games)||!official.games.length||!unique(official.games,g=>g.gameId)||official.games.some(g=>!/^002\d{7}$/.test(String(g.gameId).padStart(10,"0"))||!valid(g.startAt)||!team(g.home)||!team(g.away)||teams(g.home)===teams(g.away)))throw Error("invalid official schedule");
 if(bdl?.kind!=="nba_bdl_daily_schedule_v1"||bdl.source!=="BALLDONTLIE"||bdl.completePagination!==true||!valid(bdl.capturedAt)||!Array.isArray(bdl.rows)||!unique(bdl.rows,g=>g.providerGameId)||bdl.rows.some(g=>g.gameIdNamespace!=="balldontlie:nba"||!/^\d+$/.test(g.providerGameId)||!valid(g.startAt)||eastern(g.startAt)!==bdl.date||!team(g.home)||!team(g.away)||teams(g.home)===teams(g.away)))throw Error("invalid provider schedule");
 if(board?.kind!=="nba_private_partner_board_v1"||board.source!=="partner-api.prizepicks.com"||board.completePagination!==true||!valid(board.capturedAt)||!valid(board.captureStartedAt)||dt(board.captureStartedAt)>dt(board.capturedAt)||dt(board.capturedAt)-dt(board.captureStartedAt)>180000||!Array.isArray(board.rows)||!unique(board.rows,r=>r[0])||board.rows.some(r=>!Array.isArray(r)||r.length!==COLUMNS.length||!r[0]))throw Error("invalid board");
 const matches=new Map(),counts={officialGames:official.games.length,providerGames:bdl.rows.length,uniqueScheduleMatches:0,ambiguousSchedule:0,unmatchedSchedule:0,notBothPregame:0,boardRows:board.rows.length,eligibleBoardRows:0,matchedBoardRows:0,matchedOfferedSides:0,unmatchedBoardRows:0,ambiguousBoardRows:0,unmatchedOfficialProviderBridge:0,excludedBoardRows:0};
 for(const g of official.games){
  const candidates=bdl.rows.filter(h=>pair(g,h));
  if(candidates.length!==1){counts[candidates.length?"ambiguousSchedule":"unmatchedSchedule"]++;continue;}
  const h=candidates[0];if(official.games.filter(x=>pair(x,h)).length!==1){counts.ambiguousSchedule++;continue;}
  if(g.status!==1||h.status!=="scheduled"||Math.max(dt(official.capturedAt),dt(bdl.capturedAt))>=Math.min(dt(g.startAt),dt(h.startAt))-900000){counts.notBothPregame++;continue;}
  matches.set(g.gameId,h.providerGameId);counts.uniqueScheduleMatches++;
 }
 const marketCounts={};
 for(const row of board.rows){
  const r=Object.fromEntries(COLUMNS.map((k,i)=>[k,row[i]])),t=teams(r.team),o=teams(r.opponent),m=market(r.market),sides=offeredSides(r.tier,r.offeredWagerTypes);
  if(!m||!sides.length||!team(t)||!team(o)||t===o||!Number.isFinite(r.line)||r.line<0||r.status!=="pre_game"||r.inGame!==false||r.isLive!==false||r.combo!==false||r.eventType==="combo"||r.period!=="Full"||!valid(r.eventStartsAt)||!valid(r.lineUpdatedAt)||dt(r.lineUpdatedAt)>dt(board.capturedAt)+1000||dt(board.capturedAt)>=dt(r.eventStartsAt)-900000){counts.excludedBoardRows++;continue;}
  counts.eligibleBoardRows++;
  const gs=official.games.filter(g=>g.status===1&&dt(official.capturedAt)<=dt(g.startAt)-900000&&Math.abs(dt(g.startAt)-dt(r.eventStartsAt))<=300000&&[g.home,g.away].map(teams).includes(t)&&[g.home,g.away].map(teams).includes(o));
  if(gs.length!==1){counts[gs.length?"ambiguousBoardRows":"unmatchedBoardRows"]++;continue;}
  if(!matches.has(gs[0].gameId)){counts.unmatchedOfficialProviderBridge++;continue;}
  counts.matchedBoardRows++;counts.matchedOfferedSides+=sides.length;marketCounts[m]=(marketCounts[m]||0)+1;
 }
 return {kind:"nba_archived_three_source_crosswalk_v1",counts,marketCounts,boardCapturedAt:board.capturedAt,providerCapturedAt:bdl.capturedAt,officialCapturedAt:official.capturedAt,retrospectiveJoin:true,playerIdentityVerified:false,originalOperatorVerified:false,prospectiveFreezeVerified:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
function readPinned(file,sha){const bytes=fs.readFileSync(file);if(crypto.createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex")!==sha)throw Error("archive blob mismatch");return JSON.parse(bytes);}
if(require.main===module){try{const [o,os,b,bs,p,ps]=process.argv.slice(2);console.log(JSON.stringify(audit(readPinned(o,os),readPinned(b,bs),readPinned(p,ps))));}catch{console.error("Archived crosswalk failed closed");process.exitCode=1;}}
module.exports={audit,readPinned};
