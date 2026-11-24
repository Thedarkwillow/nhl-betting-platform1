"use strict";
/**
 * Post-collection read-only view of independent-provider NHL offers for
 * matches starting later on a specific Pacific calendar day. NOT a live,
 * authenticated PrizePicks quote and never a prospective pick or wager.
 */
const fs=require("node:fs"),path=require("node:path");
const {pacificDate}=require("../src/nhl-daily-prospective-gate.cjs");
const root=path.resolve(__dirname,"..");
const isISO=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
function remainingToday(board,{now=new Date().toISOString(),datePacific=pacificDate(now),
 leadMinutes=15,maxBoardAgeMinutes=10}={}){
 if(!isISO(now)||!datePacific||!/^\d{4}-\d{2}-\d{2}$/.test(datePacific)||
    pacificDate(now)!==datePacific)throw Error("Target must be the current Pacific day");
 if(!Number.isFinite(leadMinutes)||leadMinutes<0||leadMinutes>60||
    !Number.isFinite(maxBoardAgeMinutes)||maxBoardAgeMinutes<=0||maxBoardAgeMinutes>30)
  throw Error("Invalid bounded source checks");
 if(board?.provider!=="prizepicksapi.com"||board?.independentProvider!==true||
    board?.sourceStatus!=="fresh"||board?.completePagination!==true||
    board?.snapshotMode!=="immutable_as_of"||!Array.isArray(board.rows)||
    !isISO(board.generatedAt)||!isISO(board.boardAsOfAt)||
    !isISO(board.sourceObservedAt))
  throw Error("Refuse non-fresh, incomplete or non-immutable source board");
 const t=Date.parse(now),at=Date.parse(board.generatedAt),asOf=Date.parse(board.boardAsOfAt),
  observed=Date.parse(board.sourceObservedAt);
 if(at>t+1000||asOf>at||observed>asOf+60000||
    t-at>maxBoardAgeMinutes*60000||
    asOf-observed>30*60000)throw Error("Board not contemporaneous with remaining-game filter");
 const rows=board.rows.filter(r=>
  r?.isLive===false&&r.provider==="prizepicksapi.com"&&
  isISO(r.eventStartsAt)&&Date.parse(r.eventStartsAt)>t+leadMinutes*60000&&
  pacificDate(r.eventStartsAt)===datePacific&&
  Number.isFinite(r.line)&&r.line>=0&&
  ["Higher","Lower"].includes(r.side)&&
  ["Standard","Goblin","Demon"].includes(r.tier)&&
  typeof r.projectionId==="string"&&
  typeof r.player==="string"&&r.player.trim()&&
  typeof r.market==="string"&&r.market.trim());
 const marketCounts={},tierCounts={},starts=new Set();
 for(const r of rows){
  marketCounts[r.market]=(marketCounts[r.market]||0)+1;
  tierCounts[r.tier]=(tierCounts[r.tier]||0)+1;
  starts.add(r.eventStartsAt);
 }
 return {schemaVersion:1,kind:"nhl_remaining_today_independent_provider_offers",
  datePacific,filteredAt:now,sourceCapturedAt:board.generatedAt,
  sourceAsOfAt:board.boardAsOfAt,sourceObservedAt:board.sourceObservedAt,
  provider:"prizepicksapi.com",originalPrizePicksAppAuthenticated:false,
  exactNhlGameIdentityVerified:false,originalPlatformSettlementVerified:false,
  startingGamesOnlyAfterMinutes:leadMinutes,sourceStatus:"fresh",
  completePagination:true,sourceBoardRows:board.rows.length,
  remainingSelectionRows:rows.length,
  distinctListedStartTimes:starts.size,
  marketCounts,tierCounts,rows,
  status:rows.length?"research_only_offers":"no_qualifying_unstarted_offers",
  automaticHigherLowerPicksEnabled:false,optimizedLineupEligibilityEnabled:false,
  warning:"Third-party NHL offers, not verified live PrizePicks offers. Only future games for requested Pacific date at filtering time. Recheck current app before any wagering."};
}
function main(){
 const date=process.env.NHL_REMAINING_PACIFIC_DATE;
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("NHL_REMAINING_PACIFIC_DATE required");
 const board=JSON.parse(fs.readFileSync(path.join(root,"outputs/free-source/nhl/latest.json"),"utf8"));
 const report=remainingToday(board,{datePacific:date});
 const file=path.join(root,"outputs/free-source/nhl","remaining-"+date+".json");
 fs.writeFileSync(file,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,datePacific:date,
  remainingSelectionRows:report.remainingSelectionRows,
  distinctListedStartTimes:report.distinctListedStartTimes,
  marketCounts:report.marketCounts,tierCounts:report.tierCounts,
  provider:report.provider,originalAppAuthenticated:false,
  outputPath:"outputs/free-source/nhl/remaining-"+date+".json"}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1}
module.exports={remainingToday,main};