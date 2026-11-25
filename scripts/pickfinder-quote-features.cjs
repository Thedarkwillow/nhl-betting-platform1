'use strict';
const text=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
function extractQuotes(row){
 if(!text(row?.detailId)||!text(row.eventId)||!text(row.market)||!time(row.observedAt))return [];
 const out=[];
 for(const e of Array.isArray(row.sportsbookEvidence)?row.sportsbookEvidence:[]){
  if(!e||!text(e.displayedBookLabel)||!Array.isArray(e.prices))continue;
  for(const p of e.prices){
   if(!['Higher','Lower'].includes(p.side)||!(/^[+-]\d{2,4}$/).test(p.price)||Math.abs(Number(p.price))<100)continue;
   const line=Number.isFinite(p.quoteLine)&&p.quoteLine>=0?p.quoteLine:null;
   out.push({sport:row.sport,detailId:row.detailId,eventId:row.eventId,market:row.market,period:row.period??null,mapRange:row.mapRange??null,gameMode:row.gameMode??null,book:e.book??null,bookLabel:e.displayedBookLabel,side:p.side,price:p.price,quoteLine:line,observedAt:row.observedAt,originalPlatformVerified:false,modelInputsApproved:false});
  }
 }return out;
}
const implied=p=>Number(p)>0?100/(Number(p)+100):-Number(p)/(-Number(p)+100);
function comparator({offer,quotes,crosswalk,forecastAt}){
 if(!crosswalk||crosswalk.independentReviewVerified!==true||crosswalk.sourceDetailId!==offer.detailId||crosswalk.sourceEventId!==offer.eventId||crosswalk.nativePlayerId!==offer.playerId||crosswalk.nativeEventId!==offer.gameId||!time(crosswalk.verifiedAt)||Date.parse(crosswalk.verifiedAt)>Date.parse(forecastAt)||!time(forecastAt)||!time(offer.gameStartAt)||Date.parse(forecastAt)+900000>Date.parse(offer.gameStartAt))return [];
 const by=new Map();
 for(const q of quotes){if(!q.book||['prizepicks','underdog'].includes(q.book)||q.sport!==offer.sport||q.detailId!==offer.detailId||q.eventId!==offer.eventId||q.market!==offer.market||q.quoteLine!==offer.line||(q.period??null)!==(offer.period??null)||(q.mapRange??null)!==(offer.mapRange??null)||(q.gameMode??null)!==(offer.gameMode??null)||!time(q.observedAt)||Date.parse(q.observedAt)>Date.parse(forecastAt)||Date.parse(forecastAt)-Date.parse(q.observedAt)>300000||!['Higher','Lower'].includes(q.side)||!(/^[+-]\d{2,4}$/).test(q.price)||Math.abs(Number(q.price))<100)continue;
 const k=q.book+'|'+q.observedAt,g=by.get(k)||{book:q.book,observedAt:q.observedAt,prices:{},conflict:false};
 if(g.prices[q.side]&&g.prices[q.side]!==q.price)g.conflict=true;g.prices[q.side]=q.price;by.set(k,g);
 }
 return [...by.values()].filter(g=>!g.conflict&&g.prices.Higher&&g.prices.Lower).map(g=>({book:g.book,observedAt:g.observedAt,aggregatorNoVigHigher:implied(g.prices.Higher)/(implied(g.prices.Higher)+implied(g.prices.Lower)),researchOnly:true,modelInputsApproved:false}));
}
module.exports={extractQuotes,comparator};
