"use strict";
const {features,scores,trainCalibration}=require("./nba-context-calibration-v2.cjs");
const field={player_points:"points",player_rebounds:"rebounds",player_assists:"assists",player_threes:"threePointersMade",player_points_rebounds_assists:"pra"};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=(a,l)=>(1+a.filter(x=>x>l).length)/(2+a.length);
const alias=t=>({GS:"GSW",NO:"NOP",NY:"NYK",SA:"SAS",UTAH:"UTA",WSH:"WAS",PHO:"PHX",BRK:"BKN"}[t]||t);
const norm=t=>String(t||"").toLowerCase().replace(/[^a-z]/g,"");
const usage=x=>x.fga+.44*x.fta+x.tov;
function group(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;}
function prepare(doc){
 if(doc.kind!=="nba_sdv_research_context_v1"||!Array.isArray(doc.boxScores)||!Array.isArray(doc.injuries))throw Error("invalid context document");
 const rows=doc.boxScores.map(r=>({...r,pra:r.points+r.rebounds+r.assists,usageProxyPerMinute:usage(r)/r.minutes,opponent:alias(r.opponent),team:alias(r.team)}));
 const games=group(rows,r=>r.gameId),players=group(rows,r=>r.playerId),injuries=group(doc.injuries,r=>r.date);
 const sides=[];
 for(const [id,a] of games){
  const teams=group(a,r=>r.teamId);if(teams.size!==2)throw Error("missing side");
  const both=[...teams.values()],poss=both.map(b=>sum(b,"fga")+.44*sum(b,"fta")-sum(b,"orb")+sum(b,"tov"));
  const pace=mean(poss)*240/sum(both[0],"minutes");
  for(let i=0;i<2;i++){const b=both[i],opp=both[1-i],t=b[0];sides.push({gameId:id,date:t.date,teamId:t.teamId,pace,def:100*sum(opp,"points")/mean(poss),allowed:opp});}
  for(const b of both){const u=b.reduce((s,r)=>s+usage(r),0),tm=sum(b,"minutes")/5;for(const r of b)r.usageRateEstimate=u>0?100*usage(r)*tm/(r.minutes*u):null;}
 }
 return {rows,games,players,sides,injuries};
}
function injuryStatus(ctx,t,id){
 const cut=Date.parse(t.tip)-60*60000;if(!Number.isFinite(cut))return null;
 const match=r=>{const a=String(r.matchup||"").split("@").map(alias).sort();return a.length===2&&a.join("|")===[t.team,t.opponent].sort().join("|")&&norm(r.teamName)===norm(t.teamName);};
 const rows=(ctx.injuries.get(t.date)||[]).filter(r=>match(r)&&Date.parse(r.reportAt)<=cut&&cut-Date.parse(r.reportAt)<=6*3600000);
 if(!rows.length)return null;const latest=Math.max(...rows.map(r=>Date.parse(r.reportAt)));
 const report=rows.filter(r=>Date.parse(r.reportAt)===latest);
 if(report.some(r=>r.notSubmitted)||new Set(report.map(r=>r.nbaGameId)).size!==1||!report[0].nbaGameId)return null;
 const a=report.filter(r=>r.playerId===id&&r.identityMatched);
 return a.length===1&&["Out","Available"].includes(a[0].status)?a[0].status:null;
}
function extended(ctx,t,line,market){
 const k=field[market],past=(ctx.players.get(t.playerId)||[]).filter(r=>r.date<t.date).sort((a,b)=>a.date.localeCompare(b.date));
 if(!k||past.length<12)return null;
 const f=features(past,t,line,market,[]);if(!f)return null;
 const recent=past.slice(-10),long=past.slice(-30),priorRole=recent.at(-1).position;
 const projected=long.map(r=>r[k]/r.minutes*f.predictedMinutes);
 const prior=ctx.sides.filter(r=>r.date<t.date&&r.date>=new Date(Date.parse(t.date)-60*86400000).toISOString().slice(0,10));
 const opp=prior.filter(r=>r.teamId===t.opponentId),own=prior.filter(r=>r.teamId===t.teamId);
 const paceBase=mean(prior.map(r=>r.pace)),defBase=mean(prior.map(r=>r.def));
 const paceRatio=opp.length>=10&&own.length>=10&&paceBase>0?clamp(mean([...opp,...own].map(r=>r.pace))/paceBase,.9,1.1):null;
 const defRatio=opp.length>=10&&defBase>0?clamp(mean(opp.map(r=>r.def))/defBase,.9,1.1):null;
 const rate=a=>{const b=a.flatMap(r=>r.allowed).filter(r=>r.position===priorRole);const m=sum(b,"minutes");return m>=100?sum(b,k)/m:null;};
 const posBase=["G","F","C"].includes(priorRole)?rate(prior):null,posOpp=opp.length>=10?rate(opp):null;
 const positionalP=posBase>0&&posOpp!==null?smooth(projected.map(v=>v*clamp(posOpp/posBase,.85,1.15)),line):null;
 const us=long.map(r=>r.usageRateEstimate),ur=recent.map(r=>r.usageRateEstimate);
 const usageRateP=["player_points","player_threes"].includes(market)&&us.every(Number.isFinite)&&mean(us)>0?smooth(projected.map(v=>v*clamp(mean(ur)/mean(us),.85,1.15)),line):null;
 // Choose a teammate from prior games only. Never infer availability from target participation.
 const teammates=group(ctx.rows.filter(r=>r.date<t.date&&r.teamId===t.teamId&&r.playerId!==t.playerId&&r.date>=new Date(Date.parse(t.date)-30*86400000).toISOString().slice(0,10)),r=>r.playerId);
 const ranked=[...teammates.entries()].filter(([id,a])=>a.length>=5).sort((a,b)=>sum(b[1],"fga")-sum(a[1],"fga"));
 const teammate=ranked[0]?.[0],status=teammate?injuryStatus(ctx,t,teammate):null;
 const same=status?long.filter(r=>r.teamId===t.teamId&&injuryStatus(ctx,r,teammate)===status):[];
 const teammateP=same.length>=5?smooth(same.map(r=>r[k]/r.minutes*f.predictedMinutes),line):null;
 return {...f,paceP:paceRatio===null?null:smooth(projected.map(v=>v*paceRatio),line),defenseOnlyP:defRatio===null?null:smooth(projected.map(v=>v*defRatio),line),positionalP,usageRateP,teammateP,injuryStatus:status,injurySample:same.length,position:priorRole,contextRetrospectiveOnly:true};
}
function replay(ctx,histories){
 const rows=[],seen=new Set(),excluded={unmatched:0,warmup:0,unsupported:0};
 for(const h of histories){if(h.providerReportedTruncated!==false||h.kind!=="nba_dunkapi_historical_market_research_v1")throw Error("incomplete archive");
  const k=field[h.request.market];if(!k)throw Error("unsupported market");
  for(const r of h.rows){const id=JSON.stringify([r.providerGameId,r.providerPlayerId,r.market]);if(seen.has(id))throw Error("duplicate line");seen.add(id);
   if(r.providerPlayerId!==h.request.player_id||r.market!==h.request.market||r.gameDate<h.request.from_date||r.gameDate>h.request.to_date||r.closingLine%1!==.5){excluded.unsupported++;continue;}
   const a=(ctx.games.get(r.providerGameId)||[]).filter(t=>t.playerId===r.providerPlayerId&&t.date===r.gameDate&&norm(t.player)===norm(r.player)&&t[k]===r.actual);
   if(a.length!==1){excluded.unmatched++;continue;}
   const z=extended(ctx,a[0],r.closingLine,r.market);if(!z){excluded.warmup++;continue;}
   const imp=x=>Number.isInteger(x)&&Math.abs(x)>=100?(x<0?-x/(-x+100):100/(x+100)):null;
   const o=imp(r.overOdds),u=imp(r.underOdds);
   rows.push({id,gameId:r.providerGameId,date:r.gameDate,market:r.market,playerId:r.providerPlayerId,y:Number(r.actual>r.closingLine),marketP:o!==null&&u!==null?o/(o+u):null,...z});
  }
 }
 return {rows,excluded,namespaceVerified:false,retrospectiveOnly:true,prospectiveApproval:false};
}
function compare(rows){
 const keys=["original","minutesP","roleP","usageP","usageRateP","paceP","defenseOnlyP","positionalP","teammateP"],out={};
 for(const market of Object.keys(field)){const a=rows.filter(r=>r.market===market);out[market]={rows:a.length,features:{}};
 for(const k of keys){const b=a.filter(r=>Number.isFinite(r[k])&&Number.isFinite(r.old)),m=b.filter(r=>Number.isFinite(r.marketP));out[market].features[k]={baseline:scores(b,"old"),candidate:scores(b,k),sportsbook:scores(m,"marketP"),candidateOnMarketRows:scores(m,k),higherWins:b.filter(r=>r.y===1).length,lowerWins:b.filter(r=>r.y===0).length};}}
 return {markets:out,retrospectiveOnly:true,prospectiveApproval:false};
}
module.exports={prepare,injuryStatus,extended,replay,compare};
