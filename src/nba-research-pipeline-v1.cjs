"use strict";
// Separate NBA research pipeline. No wagering, payout, or app settlement claims.
const {offeredSides,COLUMNS}=require("./partner-prizepicks-board.cjs");
const {offer,MARKETS}=require("./nba-phase-zero-contract.cjs");
const {assess:injury}=require("./nba-official-injury-preflight.cjs");
const dt=Date.parse, finite=Number.isFinite, norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const teams=s=>({BRK:"BKN",BKN:"BKN",GS:"GSW",NO:"NOP",NY:"NYK",SA:"SAS",SAN:"SAS",PHO:"PHX",UTAH:"UTA",WSH:"WAS",LAC:"LAC"}[String(s).toUpperCase()]||String(s||"").toUpperCase());
const M={points:"points",rebounds:"rebounds",assists:"assists",threepointersmade:"threePointersMade",threepointers:"threePointersMade",threeptmade:"threePointersMade","3ptmade":"threePointersMade","3pointersmade":"threePointersMade",fantasyscore:"prizePicksFantasyScore",steals:"steals",blocks:"blocks",turnovers:"turnovers",ptsrebsasts:"pointsReboundsAssists",pointsreboundsassists:"pointsReboundsAssists",ptsrebs:"pointsRebounds",pointsrebounds:"pointsRebounds",ptsasts:"pointsAssists",pointsassists:"pointsAssists",rebsasts:"reboundsAssists",reboundsassists:"reboundsAssists"};
const market=s=>M[String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"")]||null;
const NBA_MARKETS=new Set([...MARKETS,"prizePicksFantasyScore"]);
const fantasy=r=>Math.round((r.points+1.2*r.rebounds+1.5*r.assists+3*r.steals+3*r.blocks-r.turnovers)*10)/10;
const day=s=>String(s||"").slice(0,10), validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&finite(dt(s));
const seasonOf=d=>Number(d.slice(0,4))-(Number(d.slice(5,7))<7?1:0);
function normalizeLogs(doc,season,capturedAt){
 if(!/^20\d\d-\d\d$/.test(season)||!finite(dt(capturedAt)))throw Error("bad log source clock");
 const sets=Array.isArray(doc?.resultSets)?doc.resultSets:[],s=sets.find(x=>x.name==="LeagueGameLog");
 const required=["PLAYER_ID","PLAYER_NAME","TEAM_ABBREVIATION","GAME_ID","GAME_DATE","MATCHUP","WL","MIN","PTS","REB","AST","FG3M","STL","BLK","TOV"];
 if(!s||!required.every(k=>s.headers?.includes(k))||!Array.isArray(s.rowSet)||!s.rowSet.length)throw Error("NBA player log schema unavailable");
 const rows=[],ids=new Set(),games=new Map();let excluded=0;
 for(const raw of s.rowSet){
  const x=Object.fromEntries(s.headers.map((k,i)=>[k,raw[i]])),date=day(x.GAME_DATE),gid=String(x.GAME_ID),team=teams(x.TEAM_ABBREVIATION);
  const match=String(x.MATCHUP).match(/^([A-Z]{2,3}) (vs\.|@) ([A-Z]{2,3})$/),opponent=match?teams(match[3]):null;
  const base={points:x.PTS,rebounds:x.REB,assists:x.AST,threePointersMade:x.FG3M,steals:x.STL,blocks:x.BLK,turnovers:x.TOV};
  if(!validDay(date)||date>=day(capturedAt)||seasonOf(date)!==Number(season.slice(0,4))||!/^002\d{7}$/.test(gid)||!Number.isInteger(x.PLAYER_ID)||x.PLAYER_ID<=0||
    typeof x.PLAYER_NAME!=="string"||!match||teams(match[1])!==team||opponent===team||!["W","L"].includes(x.WL)||
    !finite(x.MIN)||x.MIN<=0||x.MIN>70||!Object.values(base).every(n=>Number.isInteger(n)&&n>=0)){excluded++;continue;}
  const k=gid+"|"+x.PLAYER_ID;if(ids.has(k))throw Error("Duplicate official player-game");ids.add(k);
  const r={gameId:Number(gid),gameDate:date,playerId:x.PLAYER_ID,player:x.PLAYER_NAME,team,opponent,home:match[2]==="vs.",minutes:x.MIN,wl:x.WL,...base,
   pointsReboundsAssists:base.points+base.rebounds+base.assists,pointsRebounds:base.points+base.rebounds,pointsAssists:base.points+base.assists,reboundsAssists:base.rebounds+base.assists};
  rows.push(r);const a=games.get(gid)||[];a.push(r);games.set(gid,a);
 }
 const good=new Set();
 for(const [gid,a] of games){const ts=[...new Set(a.map(x=>x.team))];if(ts.length!==2||new Set(a.map(x=>x.gameDate)).size!==1)continue;
  const sides=ts.map(t=>a.filter(x=>x.team===t));if(sides.every(x=>x.length>=5&&new Set(x.map(y=>y.wl)).size===1&&x.every(y=>y.opponent===ts.find(t=>t!==y.team)))&&sides[0][0].wl!==sides[1][0].wl)good.add(Number(gid));}
 const accepted=rows.filter(x=>good.has(x.gameId));
 if(!accepted.length)throw Error("No reconciled NBA historical appearances");
 return {kind:"nba_official_stats_regular_season_log_v1",season,capturedAt,source:"stats.nba.com LeagueGameLog",historicalAppearancesOnly:true,officialFinalClockVerified:false,originalPlatformSettlementVerified:false,seasonCompletenessVerified:good.size===1230,gameCount:good.size,excluded:excluded+rows.length-accepted.length,rows:accepted};
}
function schedule(doc,at){
 const g=doc?.leagueSchedule;if(g?.leagueId!=="00"&&!["NBA","00"].includes(g?.leagueId))throw Error("Not NBA schedule");
 const games=(g.gameDates||[]).flatMap(d=>d.games||[]).filter(x=>/^002\d{7}$/.test(String(x.gameId))&&finite(dt(x.gameDateTimeUTC))&&x.homeTeam?.teamId>0&&x.awayTeam?.teamId>0).map(x=>({gameId:Number(x.gameId),startAt:x.gameDateTimeUTC,home:teams(x.homeTeam.teamTricode),away:teams(x.awayTeam.teamTricode),status:x.gameStatus}));
 if(!games.length||new Set(games.map(x=>x.gameId)).size!==games.length)throw Error("NBA schedule absent or duplicated");
 return {kind:"nba_official_schedule_v1",capturedAt:at,season:g.seasonYear,source:"cdn.nba.com",games};
}
function indexHistory(logs){
 const rows=logs.flatMap(x=>(x.rows||[]).map(r=>({...r,prizePicksFantasyScore:fantasy(r)}))).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId||a.playerId-b.playerId),seen=new Set(),players=new Map(),opps=new Map();
 for(const r of rows){const k=r.gameId+"|"+r.playerId;if(seen.has(k))throw Error("Duplicate NBA history");seen.add(k);const p=players.get(r.playerId)||[];p.push(r);players.set(r.playerId,p);const o=opps.get(r.opponent)||[];o.push(r);opps.set(r.opponent,o);}
 return {rows,players,opps};
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function project(h,p,cut,{opponentContext=true}={}){
 if(!NBA_MARKETS.has(p.market)||!finite(p.line)||p.line<0||(p.market!=="prizePicksFantasyScore"&&p.line%1!==.5)||!validDay(cut))return null;
 const prev=(h.players.get(p.playerId)||[]).filter(r=>r.gameDate<cut&&r.team===p.team).slice(-30);
 if(prev.length<12||mean(prev.slice(-5).map(r=>r.minutes))<8)return null;
 const recent=prev.slice(-10),mins=mean(recent.map(r=>r.minutes)),vals=prev.map(r=>r[p.market]);
 if(!vals.every(finite))return null;
 const ownRate=mean(recent.map(r=>r[p.market]/r.minutes));
 const opp=(opponentContext?(h.opps.get(p.opponent)||[]):[]).filter(r=>r.gameDate<cut&&r.gameDate>=new Date(dt(cut)-45*86400000).toISOString().slice(0,10));
 // opponent aggregate is descriptive, not a position-adjusted causal effect.
 const oppGames=new Set(opp.map(r=>r.gameId)).size;
 const decided=vals.filter(v=>v!==p.line), recentDecided=recent.filter(r=>r[p.market]!==p.line);
 const old=(1+decided.filter(v=>v>p.line).length)/(2+decided.length);
 const newer=(1+recentDecided.filter(r=>r[p.market]>p.line).length)/(2+recentDecided.length);
 const prob=.65*old+.35*newer;
 return {higher:prob,baselineHigher:old,probabilityConditionalOnDecided:true,historicalPushRate:(vals.length-decided.length)/vals.length,projection:ownRate*mins,expectedMinutesHistorical:mins,priorGames:prev.length,opponentPriorGames:oppGames,opponentPerMinute:oppGames>=8?opp.reduce((s,r)=>s+r[p.market],0)/opp.reduce((s,r)=>s+r.minutes,0):null,availabilityConfirmed:false,modelCalibrated:false};
}
function backtest(h){
 // Synthetic half-point thresholds, not historical offered lines. No same-day data.
 const out={},training=new Map();for(const r of h.rows){if(r.gameDate<"2024-07-01")continue;
  const prev=(h.players.get(r.playerId)||[]).filter(x=>x.gameDate<r.gameDate&&x.team===r.team).slice(-20);if(prev.length<12)continue;
  const split=r.gameDate<"2025-07-01"?"development":r.gameDate<"2026-07-01"?"historical_holdout":"current_season_replay";
  for(const m of NBA_MARKETS){
   const line=Math.floor(mean(prev.map(x=>x[m])))+.5,p=project(h,{...r,market:m,line},r.gameDate,{opponentContext:false});if(!p||r[m]===line)continue;
   const y=Number(r[m]>line),a=out[split+"|"+m]??={n:0,brier:0,baselineBrier:0,adjustedBrier:0,adjustedRawBrier:0,adjustedN:0,logLoss:0,games:new Set(),dates:new Set(),bins:Array.from({length:10},()=>({n:0,sumP:0,sumY:0}))};
   a.n++;a.brier+=(p.higher-y)**2;a.baselineBrier+=(p.baselineHigher-y)**2;a.logLoss-=y?Math.log(p.higher):Math.log1p(-p.higher);a.games.add(r.gameId);a.dates.add(r.gameDate);
   const bin=Math.min(9,Math.floor(p.higher*10)),b=a.bins[bin];b.n++;b.sumP+=p.higher;b.sumY+=y;
   const k=m+"|"+bin,t=training.get(k)||{n:0,y:0};
   if(split==="development"){t.n++;t.y+=y;training.set(k,t);}
   else if(t.n>=50){const q=(t.y+50*p.higher)/(t.n+50);a.adjustedBrier+=(q-y)**2;a.adjustedRawBrier+=(p.higher-y)**2;a.adjustedN++;}
  }
 }
 return {kind:"nba_synthetic_threshold_chronological_baseline_v1",actualHistoricalOffers:false,prospectiveCalibrationApproved:false,calibrationFit:"2024-25 development bins only; fixed 50-count smoothing; evaluated on later synthetic thresholds, not a live model",groups:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{n:a.n,brier:a.brier/a.n,baselineBrier:a.baselineBrier/a.n,adjustedBrier:a.adjustedN?a.adjustedBrier/a.adjustedN:null,adjustedN:a.adjustedN,pairedRawBrier:a.adjustedN?a.adjustedRawBrier/a.adjustedN:null,logLoss:a.logLoss/a.n,distinctGames:a.games.size,distinctDates:a.dates.size,bins:a.bins.map(b=>({n:b.n,meanProbability:b.n?b.sumP/b.n:null,observed:b.n?b.sumY/b.n:null}))}]))};
}
function board(raw,h,sc,now){
 if(raw.completePagination!==true||!Array.isArray(raw.rows)||!finite(dt(raw.capturedAt))||dt(now)<dt(raw.capturedAt)||dt(now)-dt(raw.capturedAt)>1800000)return [];
 const names=new Map();
 for(const [id,a] of h.players){const last=a.at(-1);if(dt(now)-dt(last.gameDate)>45*86400000)continue;const k=norm(last.player)+"|"+last.team;const ids=names.get(k)||[];ids.push(id);names.set(k,ids);}
 const result=[],seen=new Set();
 for(const arr of raw.rows){const r=Object.fromEntries(COLUMNS.map((k,i)=>[k,arr[i]])),team=teams(r.team),opp=teams(r.opponent),m=market(r.market);
  if(seen.has(r.projectionId))throw Error("Duplicate board projection");seen.add(r.projectionId);
  if(!m||r.period!=="Full"||r.status!=="pre_game"||r.inGame||r.isLive||r.combo||r.eventType==="combo"||!finite(dt(r.lineUpdatedAt))||dt(r.lineUpdatedAt)>dt(raw.capturedAt)+1000)continue;
  const ids=names.get(norm(r.player)+"|"+team)||[],gs=sc.games.filter(g=>g.status===1&&Math.abs(dt(g.startAt)-dt(r.eventStartsAt))<=300000&&[g.home,g.away].includes(team)&&[g.home,g.away].includes(opp)&&team!==opp);
  if(ids.length!==1||gs.length!==1)continue;
  for(const side of offeredSides(r.tier,r.offeredWagerTypes)){
   const o={platform:"PrizePicks",sourceOfferId:r.projectionId,player:r.player,playerId:ids[0],gameId:gs[0].gameId,gameStartAt:gs[0].startAt,team,opponent:opp,market:m,line:r.line,tier:r.tier[0].toUpperCase()+r.tier.slice(1),offeredSide:side,period:"full_game",sourceObservedAt:raw.capturedAt,originalBoardPageComplete:true,playerIdentityVerified:true,gameIdentityVerified:true,identityMethod:"exact full name plus current historical team and official schedule, conditional"};
   if(offer(o,now).validForResearch)result.push(o);
  }
 }
 return result;
}
function oddsPairs(doc,at){
 const out=[],groups=new Map(),bad=new Set(),books=["draftkings","fanduel","betmgm","caesars"];
 for(const e of doc?.data||[]){if(e.leagueID!=="NBA"||e.status?.started||e.status?.live||e.status?.cancelled||!(dt(e.status?.startsAt)>dt(at)+900000))continue;
  for(const o of Object.values(e.odds||{})){const m=market(o.statID),id=o.playerID||o.statEntityID,player=e.players?.[id]?.name;
   if(!m||m==="prizePicksFantasyScore"||!player||o.periodID!=="game"||o.betTypeID!=="ou"||!["over","under"].includes(o.sideID)||o.started||o.cancelled||o.ended)continue;
   for(const book of books){const b=o.byBookmaker?.[book],t=dt(b?.lastUpdatedAt),line=Number(b?.overUnder),price=Number(b?.odds);
    if(!b?.available||!finite(t)||t>dt(at)||dt(at)-t>1800000||b.overUnder==null||!finite(line)||line<0||!Number.isInteger(price)||Math.abs(price)<100)continue;
    const k=JSON.stringify([e.eventID,id,m,line,book]),x=groups.get(k)||{eventId:e.eventID,player,providerPlayerId:id,market:m,line,book,startAt:e.status.startsAt,home:e.teams?.home?.names?.long,away:e.teams?.away?.names?.long,homeCode:teams(e.teams?.home?.names?.short||e.teams?.home?.names?.abbreviation),awayCode:teams(e.teams?.away?.names?.short||e.teams?.away?.names?.abbreviation),updatedAt:b.lastUpdatedAt};
    if(x[o.sideID]!=null&&x[o.sideID]!==price)bad.add(k);x[o.sideID]=price;if(t<dt(x.updatedAt))x.updatedAt=b.lastUpdatedAt;groups.set(k,x);
   }
  }
 }
 for(const [k,x] of groups)if(!bad.has(k)&&x.over!=null&&x.under!=null)out.push(x);return out;
}
function benchmark(p,rows,sc,now){
 const game=sc.games.find(g=>g.gameId===p.gameId);if(!game)return null;
 // Team name aliases need an explicit official mapping; no fuzzy player matching.
 const matches=rows.filter(x=>norm(x.player)===norm(p.player)&&x.market===p.market&&x.line===p.line&&Math.abs(dt(x.startAt)-dt(p.gameStartAt))<=300000&&x.homeCode===game.home&&x.awayCode===game.away&&dt(x.updatedAt)<=dt(now)&&dt(now)-dt(x.updatedAt)<=1800000);
 const b=new Map();for(const x of matches){if(b.has(x.book))return null;const f=v=>v<0?-v/(-v+100):100/(100+v);b.set(x.book,f(x.over)/(f(x.over)+f(x.under)));}
 return b.size>=2?{books:b.size,higher:mean([...b.values()]),identityConditional:true}:null;
}
function rankings(offers,h,sc,odds,injuries,now){
 const cut=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now)),rows=[];
 for(const p of offers){const a=project(h,p,cut);if(!a)continue;
  const i=injuries.filter(x=>x.gameId===p.gameId&&x.playerId===p.playerId).map(x=>injury(x,{now})).filter(x=>x.usable);
  const risk=i.some(x=>x.mayBeUnavailable),b=benchmark(p,odds,sc,now);
  rows.push({...p,...a,rawSelectedEstimate:p.offeredSide==="Higher"?a.higher:1-a.higher,benchmark:b,injuryStatus:risk?"reported_risk":"unknown_or_not_confirmed",researchOnly:true,highConfidenceEligible:false,verifiedEV:null});
 }
 const chosen=new Map();for(const p of rows){if(p.rawSelectedEstimate<=.5||p.injuryStatus==="reported_risk")continue;const k=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier]);const x=chosen.get(k);if(!x||p.rawSelectedEstimate>x.rawSelectedEstimate)chosen.set(k,p);}
 return [...chosen.values()].sort((a,b)=>b.rawSelectedEstimate-a.rawSelectedEstimate);
}
function gradePaper(p,official){
 if(!p||!official||official.officialGameFinalVerified!==true||official.identityVerified!==true||official.gameId!==p.gameId||official.playerId!==p.playerId||official.appeared!==true||!finite(official[p.market]))return "pending";
 const v=official[p.market];return v===p.line?"push":(v>p.line)===(p.offeredSide==="Higher")?"correct":"incorrect";
}
module.exports={fantasy,market,teams,norm,normalizeLogs,schedule,indexHistory,project,backtest,board,oddsPairs,benchmark,rankings,gradePaper};
