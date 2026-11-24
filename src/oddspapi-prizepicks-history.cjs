"use strict";
function extractPrizePicksFixture(history,markets,fixture){
 const start=Date.parse(fixture?.startTime);
 if(!Number.isFinite(start)||!history||!markets||typeof markets!=="object")throw Error("Invalid fixture or history");
 const book=history.bookmakers?.prizepicks;
 const rows=[],issues=[];
 if(!book?.markets)return {fixtureId:fixture.fixtureId,eventStartsAt:fixture.startTime,rows,issues:["prizepicks_book_missing"],hasPrizePicks:false};
 for(const [id,m] of Object.entries(book.markets)){
  const def=markets[id];
  if(!def||def.sportId!==15||def.playerProp!==true||!Number.isFinite(def.handicap)){
   issues.push("unrecognized_market_"+id);continue;
  }
  for(const [oid,outcome] of Object.entries(m.outcomes||{})){
   if(!["over","more"].includes(String(def.outcomes?.find(x=>String(x.outcomeId)===String(oid))?.outcomeName||"").toLowerCase()))continue;
   for(const [playerId,snaps] of Object.entries(outcome.players||{})){
    if(playerId==="0"||!Array.isArray(snaps))continue;
    const valid=snaps.filter(s=>Number.isFinite(Date.parse(s.createdAt))&&Date.parse(s.createdAt)<start&&typeof s.active==="boolean")
      .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
    if(!valid.length)continue;
    const active=valid.filter(s=>s.active===true);
    rows.push({source:"OddsPapi PrizePicks",fixtureId:fixture.fixtureId,
     playerId,playerName:null,marketId:id,stat:def.marketName,period:def.period||null,
     line:def.handicap,eventStartsAt:fixture.startTime,firstObservedAt:valid[0].createdAt,
     lastObservedAt:valid.at(-1).createdAt,lastActiveAt:active.at(-1)?.createdAt||null,
     observations:valid.length,activeAtLastObservation:valid.at(-1).active,
     tier:"unverified",sourceIsPrizePicks:true,
     isHistorical:true,verifiedClosingLine:false,verifiedPlayerIdentity:false,
     oddsOmitted:true});
   }
  }
 }
 return {fixtureId:fixture.fixtureId,eventStartsAt:fixture.startTime,rows,issues,hasPrizePicks:true};
}
module.exports={extractPrizePicksFixture};
