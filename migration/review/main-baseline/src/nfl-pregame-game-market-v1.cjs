"use strict";
// Full game sportsbook context. Team spread is the actual handicap (negative
// for favored team); both opposite signed sides and equal total must exist.
const dt=Date.parse,num=Number.isFinite,{removeVig}=require("./sportsbook-consensus.cjs");
function capture(data,event,stamp,books){
 if(data.id!==event.id||data.home_team!==event.home_team||data.away_team!==event.away_team||data.commence_time!==event.commence_time||!(dt(stamp)<dt(event.commence_time)-900000))return [];
 const rows=[];
 for(const b of data.bookmakers||[]){
  if(!books.includes(b.key))continue;
  const one=k=>{const a=(b.markets||[]).filter(x=>x.key===k);return a.length===1&&dt(a[0].last_update)<=dt(stamp)&&dt(stamp)-dt(a[0].last_update)<=1800000?a[0]:null;};
  const s=one("spreads"),t=one("totals");if(!s||!t)continue;
  const h=s.outcomes?.filter(x=>x.name===event.home_team)||[],a=s.outcomes?.filter(x=>x.name===event.away_team)||[],o=t.outcomes?.filter(x=>x.name==="Over")||[],u=t.outcomes?.filter(x=>x.name==="Under")||[];
  if([h,a,o,u].some(x=>x.length!==1)||![h[0].point,a[0].point,o[0].point,u[0].point].every(num)||h[0].point!==-a[0].point||o[0].point!==u[0].point||o[0].point<=Math.abs(h[0].point))continue;
  const ml=one("h2h"),mh=ml?.outcomes?.filter(x=>x.name===event.home_team)||[],ma=ml?.outcomes?.filter(x=>x.name===event.away_team)||[],fair=mh.length===1&&ma.length===1?removeVig(mh[0].price,ma[0].price):null;
  rows.push({homeMoneyline:fair?mh[0].price:null,awayMoneyline:fair?ma[0].price:null,homeWinNoVig:fair?fair.higher:null,moneylineUpdatedAt:fair?ml.last_update:null,source:"The Odds API",book:b.key,eventId:event.id,homeTeam:event.home_team,awayTeam:event.away_team,commenceTime:event.commence_time,observedAt:stamp,marketUpdatedAt:new Date(Math.min(dt(s.last_update),dt(t.last_update))).toISOString(),homeSpread:h[0].point,awaySpread:a[0].point,total:o[0].point,twoSidedVerified:true});
 }
 return rows.filter(x=>rows.filter(y=>y.book===x.book).length===1);
}
module.exports={capture};
