"use strict";
// Pure math helpers; no sportsbook prices are fabricated or fetched here.
function impliedProbability(americanOdds){
 if(!Number.isFinite(americanOdds)||americanOdds===0||Math.abs(americanOdds)<100)return null;
 return americanOdds<0?-americanOdds/(-americanOdds+100):100/(americanOdds+100);
}
function removeVig(overOdds,underOdds){
 const over=impliedProbability(overOdds),under=impliedProbability(underOdds);
 if(over===null||under===null)return null;
 const sum=over+under;
 if(sum<=0)return null;
 return {higher:over/sum,lower:under/sum,overround:sum-1};
}
function consensus(quotes){
 const valid=quotes.filter(q=>q&&q.book&&q.market&&Number.isFinite(q.line)&&q.overOdds!==undefined&&q.underOdds!==undefined)
  .map(q=>({...q,probabilities:removeVig(q.overOdds,q.underOdds)})).filter(q=>q.probabilities);
 if(!valid.length)return null;
 // Never blend different lines, players, games, or markets.
 const key=q=>[q.playerId,q.gameId,q.market,q.line,q.period||"full game"].join("|");
 if(new Set(valid.map(key)).size!==1)return null;
 const higher=valid.reduce((s,q)=>s+q.probabilities.higher,0)/valid.length;
 return {key:key(valid[0]),books:valid.length,higher,lower:1-higher,method:"equal-weight no-vig average",quotes:valid.map(q=>({book:q.book,overOdds:q.overOdds,underOdds:q.underOdds,probabilities:q.probabilities,capturedAt:q.capturedAt||null}))};
}
module.exports={impliedProbability,removeVig,consensus};
