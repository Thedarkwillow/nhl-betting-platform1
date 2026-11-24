"use strict";
const {removeVig}=require("./sportsbook-consensus.cjs");
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const teams={"ANA":"anaheim ducks","BOS":"boston bruins","BUF":"buffalo sabres","CGY":"calgary flames","CAR":"carolina hurricanes","CHI":"chicago blackhawks","COL":"colorado avalanche","CBJ":"columbus blue jackets","DAL":"dallas stars","DET":"detroit red wings","EDM":"edmonton oilers","FLA":"florida panthers","LAK":"los angeles kings","MIN":"minnesota wild","MTL":"montreal canadiens","NSH":"nashville predators","NJD":"new jersey devils","NYI":"new york islanders","NYR":"new york rangers","OTT":"ottawa senators","PHI":"philadelphia flyers","PIT":"pittsburgh penguins","SEA":"seattle kraken","SJS":"san jose sharks","SJ":"san jose sharks","STL":"st louis blues","TBL":"tampa bay lightning","TOR":"toronto maple leafs","UTA":"utah mammoth","VAN":"vancouver canucks","VGK":"vegas golden knights","WSH":"washington capitals","WPG":"winnipeg jets"};
function sameName(a,b){
 const x=norm(a).split(" "),y=norm(b).split(" ");
 return x.length>=2&&y.length>=2&&x.slice(1).join(" ")===y.slice(1).join(" ")&&x[0][0]===y[0][0];
}
function compare(props,quotes,at=new Date().toISOString()){
 const now=Date.parse(at),results=[],counts={matched:0,unmatched:0,ambiguous:0,stale:0};
 for(const prop of props){
  const team=teams[prop.team],opp=prop.opponent?.toUpperCase()||(prop.matchup||"").match(/(?:vs|@)\s*([A-Z]{2,3})/i)?.[1]?.toUpperCase(),opponent=teams[opp];
  const observed=Date.parse(prop.capturedAt);
  if(!team||!opponent||!Number.isFinite(observed)||now-observed>8*3600000||observed>now){counts.stale++;continue;}
  const matching=quotes.filter(q=>{
   const start=Date.parse(q.commenceTime),stamp=Date.parse(q.capturedAt),updated=Date.parse(q.marketUpdatedAt||q.capturedAt);
   return q.market===prop.market&&q.line===prop.line&&sameName(q.player,prop.player)&&
    [norm(q.homeTeam),norm(q.awayTeam)].sort().join("|")===[norm(team),norm(opponent)].sort().join("|")&&
    Number.isFinite(start)&&start>now&&Number.isFinite(stamp)&&stamp<=now&&now-stamp<=4*3600000&&
    Number.isFinite(updated)&&updated<=now&&updated<start&&
    (!prop.eventStartsAt||Math.abs(Date.parse(prop.eventStartsAt)-start)<=10*60000);
  });
  const events=new Set(matching.map(q=>q.eventId));
  if(events.size>1){counts.ambiguous++;continue;}
  const books=new Map();
  for(const q of matching){const vig=removeVig(q.overOdds,q.underOdds);if(vig&&!books.has(q.book))books.set(q.book,{book:q.book,...vig,capturedAt:q.capturedAt});}
  if(!books.size){counts.unmatched++;continue;}
  const rows=[...books.values()],higher=rows.reduce((s,x)=>s+x.higher,0)/rows.length;
  results.push({player:prop.player,playerId:prop.playerId,team:prop.team,market:prop.market,line:prop.line,tier:prop.tier,matchup:prop.matchup,modelHigher:prop.probabilities?.higher??null,modelLower:prop.probabilities?.lower??null,sportsbookHigher:Number(higher.toFixed(5)),sportsbookLower:Number((1-higher).toFixed(5)),sportsbookCount:rows.length,books:rows,comparisonOnly:true,verifiedPrizePicksLine:false,expectedValue:null,marketEventId:matching[0].eventId});
  counts.matched++;
 }
 return {counts,comparisons:results};
}
module.exports={compare,sameName};
