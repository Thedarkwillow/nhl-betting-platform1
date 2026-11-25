"use strict";
// Market/line-bucket past-only comparison on immutable original inputs.
// Historical replay, not newly precommitted forecasts.
const {eligible}=require("./nhl-standard-forward-scoreboard.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
function assess(rows){
 const days=new Map(),hist=new Map(),groups={};
 for(const r of rows){if(!eligible(r,"champion"))continue;const day=pacificDay(r.gameStartAt),q=r.shadow.variants.champion.probabilities,den=q.higher+q.lower;if(!day||!(den>0)||!Number.isFinite(r.line))continue;const a=days.get(day)||[];a.push({market:r.market,line:r.line,p:q.higher/den,y:Number(r.outcome.side==="Higher")});days.set(day,a);}
 const add=r=>{for(const k of [r.market,JSON.stringify([r.market,r.line])]){const h=hist.get(k)||{n:0,y:0};h.n++;h.y+=r.y;hist.set(k,h);}};
 const pending=[];
 for(const day of [...days.keys()].sort()){
  while(pending.length&&Date.parse(pending[0].day)<=Date.parse(day)-2*86400000)for(const r of pending.shift().rows)add(r);
  for(const r of days.get(day)){const h=hist.get(r.market),l=hist.get(JSON.stringify([r.market,r.line]));if(!h||h.n<100||!l||l.n<20)continue;
   const m=(h.y+10)/(h.n+20),p=(l.y+30*m)/(l.n+30),blend=.25*r.p+.75*p;
   const g=groups[r.market]??={n:0,champion:0,marketLinePrior:0,blend:0,alwaysHigher:0,alwaysLower:0,rawBrier:0,blendBrier:0};
   g.n++;g.champion+=Number((r.p>.5)===Boolean(r.y));g.marketLinePrior+=Number((p>.5)===Boolean(r.y));g.blend+=Number((blend>.5)===Boolean(r.y));g.alwaysHigher+=r.y;g.alwaysLower+=1-r.y;g.rawBrier+=(r.p-r.y)**2;g.blendBrier+=(blend-r.y)**2;
  }
  pending.push({day,rows:days.get(day)});
 }
 for(const g of Object.values(groups)){g.rawBrier/=g.n;g.blendBrier/=g.n;}
 return {kind:"nhl_prior_market_line_direction_research_v1",groups,minimumDayGap:2,firstFinalAvailabilityVerified:false,originalForecastFrozen:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0};
}
module.exports={assess};
