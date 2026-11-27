'use strict';
const text=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const signedPrice=p=>typeof p==='string'&&/^[+-]\d{2,4}$/.test(p)&&Math.abs(Number(p))>=100;
const sportsbookIds=new Set(['draftkings','fanduel','betmgm','caesars','pinnacle','bet365','espnbet','fanatics','betrivers','hardrockbet','betonline','bovada','fliff','betfair']);
const SOURCE_QUOTE_TIME_BASIS='provider_quote_time_element';
function exactOffsetTime(s){
 const m=typeof s==='string'&&/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(s);
 if(!m||m[4]==='-00:00'||/^[+-]14:(?!00)/.test(m[4]))return NaN;
 const day=m.slice(1,4).join('-'),check=new Date(day+'T00:00:00Z');
 return Number.isFinite(check.getTime())&&check.toISOString().slice(0,10)===day?Date.parse(s):NaN;
}
function quoteSourceTime(row,observedAt){
 if(row?.sourceQuoteTimeBasis!==SOURCE_QUOTE_TIME_BASIS)return null;
 const at=exactOffsetTime(row.sourceQuoteDateTime),observed=exactOffsetTime(observedAt);
 return Number.isFinite(at)&&Number.isFinite(observed)&&at<=observed?
  {sourceQuoteDateTime:row.sourceQuoteDateTime,sourceQuoteTimeBasis:SOURCE_QUOTE_TIME_BASIS}:null;
}
function extractQuotes(row){
 if(!text(row?.detailId)||!text(row.eventId)||!text(row.market)||!time(row.observedAt))return [];
 const out=[];
 for(const e of Array.isArray(row.sportsbookEvidence)?row.sportsbookEvidence:[]){
  if(!e||!text(e.displayedBookLabel)||!Array.isArray(e.prices))continue;
  for(const p of e.prices){
   if(!['Higher','Lower'].includes(p.side)||!signedPrice(p.price))continue;
   const line=Number.isFinite(p.quoteLine)&&p.quoteLine>=0?p.quoteLine:null;
   out.push({sport:row.sport,detailId:row.detailId,eventId:row.eventId,market:row.market,period:row.period??null,mapRange:row.mapRange??null,gameMode:row.gameMode??null,book:e.book??null,bookLabel:e.displayedBookLabel,side:p.side,price:p.price,quoteLine:line,observedAt:row.observedAt,originalPlatformVerified:false,modelInputsApproved:false,...(line!==null&&sportsbookIds.has(e.book)?quoteSourceTime(p,row.observedAt):null)});
  }
 }return out;
}
const implied=p=>Number(p)>0?100/(Number(p)+100):-Number(p)/(-Number(p)+100);
function noVigHigher(higher,lower){
 if(!signedPrice(higher)||!signedPrice(lower))return null;
 const h=implied(higher),l=implied(lower);
 return h/(h+l);
}
function comparator({offer,quotes,crosswalk,forecastAt}){
 if(!crosswalk||crosswalk.independentReviewVerified!==true||crosswalk.sourceDetailId!==offer.detailId||crosswalk.sourceEventId!==offer.eventId||crosswalk.nativePlayerId!==offer.playerId||crosswalk.nativeEventId!==offer.gameId||!time(crosswalk.verifiedAt)||Date.parse(crosswalk.verifiedAt)>Date.parse(forecastAt)||!time(forecastAt)||!time(offer.gameStartAt)||Date.parse(forecastAt)+900000>Date.parse(offer.gameStartAt))return [];
 const by=new Map();
 for(const q of quotes){if(!q.book||['prizepicks','underdog'].includes(q.book)||q.sport!==offer.sport||q.detailId!==offer.detailId||q.eventId!==offer.eventId||q.market!==offer.market||q.quoteLine!==offer.line||(q.period??null)!==(offer.period??null)||(q.mapRange??null)!==(offer.mapRange??null)||(q.gameMode??null)!==(offer.gameMode??null)||!time(q.observedAt)||Date.parse(q.observedAt)>Date.parse(forecastAt)||Date.parse(forecastAt)-Date.parse(q.observedAt)>300000||!['Higher','Lower'].includes(q.side)||!signedPrice(q.price))continue;
 const k=q.book+'|'+q.observedAt,g=by.get(k)||{book:q.book,observedAt:q.observedAt,prices:{},conflict:false};
 if(g.prices[q.side]&&g.prices[q.side]!==q.price)g.conflict=true;g.prices[q.side]=q.price;by.set(k,g);
 }
 return [...by.values()].filter(g=>!g.conflict&&g.prices.Higher&&g.prices.Lower).map(g=>({book:g.book,observedAt:g.observedAt,aggregatorNoVigHigher:noVigHigher(g.prices.Higher,g.prices.Lower),researchOnly:true,modelInputsApproved:false}));
}
module.exports={extractQuotes,comparator,noVigHigher,quoteSourceTime,exactOffsetTime,sportsbookIds};
