"use strict";
// Pure research features. No network calls, current-game outcome input, or wager selection.
const finite=Number.isFinite,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&finite(Date.parse(d))&&new Date(Date.parse(d)).toISOString().slice(0,10)===d;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,l)=>(1+a.filter(x=>x>l).length)/(2+a.filter(x=>x!==l).length);
const markets={player_points:"points",player_rebounds:"rebounds",player_assists:"assists",player_threes:"threePointersMade",player_points_rebounds_assists:"pra"};
const odds=x=>Number.isInteger(x)&&Math.abs(x)>=100?(x<0?-x/(-x+100):100/(x+100)):null;
function teamSnapshot(raw,request,capturedAt){
 const d=raw?.data;
 if(request?.season!==2026||request.season_type!=="regular"||!validDate(request.before)||request.league!=="nba"||request.team||d?.season!==request.season||d.count!==30||!Array.isArray(d.teams)||d.teams.length!==30||!finite(Date.parse(capturedAt)))throw Error("incomplete team context");
 const teams={},ids=new Set();
 for(const t of d.teams){
  if(!/^[A-Z]{2,3}$/.test(t.abbrev)||teams[t.abbrev]||typeof t.team_id!=="string"||ids.has(t.team_id)||!Number.isInteger(t.games)||t.games<10||t.games>82||!finite(t.pace)||t.pace<70||t.pace>130||!finite(t.def_rating)||t.def_rating<80||t.def_rating>150||!finite(t.off_rating)||t.off_rating<80||t.off_rating>150)throw Error("invalid team context");
  ids.add(t.team_id);teams[t.abbrev]={games:t.games,pace:t.pace,defRating:t.def_rating,offRating:t.off_rating};
 }
 return {kind:"nba_dunk_team_context_v1",source:"DunkAPI",request,capturedAt,asOfExclusive:request.before,teams,providerCutoffDocumented:true,independentCutoffVerified:false};
}
function contextFor(snapshots,date,opp){
 const a=snapshots.filter(s=>s.kind==="nba_dunk_team_context_v1"&&validDate(s.asOfExclusive)&&s.asOfExclusive<=date&&Date.parse(date)-Date.parse(s.asOfExclusive)<=7*86400000&&s.teams?.[opp]).sort((a,b)=>b.asOfExclusive.localeCompare(a.asOfExclusive));
 if(!a.length)return null;
 const s=a[0],t=s.teams[opp],v=Object.values(s.teams);
 return {asOf:s.asOfExclusive,paceRatio:t.pace/mean(v.map(x=>x.pace)),defRatio:t.defRating/mean(v.map(x=>x.defRating)),opponentPace:t.pace,opponentDefRating:t.defRating};
}
function availabilityAt(snapshot,cut,team,ids){
 // An absent row is UNKNOWN, never available. Only provider records timestamped before the freeze.
 if(!snapshot||snapshot.kind!=="nba_pregame_availability_v1"||!finite(Date.parse(cut))||!finite(Date.parse(snapshot.observedAt))||Date.parse(snapshot.observedAt)>Date.parse(cut)||Date.parse(cut)-Date.parse(snapshot.observedAt)>6*3600000||!Array.isArray(snapshot.rows))return null;
 const out={out:[],uncertain:[],available:[],unknown:[]};
 for(const id of ids){
  const a=snapshot.rows.filter(x=>x.team===team&&x.playerId===id&&x.identityVerified===true);
  if(a.length!==1){out.unknown.push(id);continue;}
  const x=a[0].status;
  if(x==="out")out.out.push(id);else if(["doubtful","questionable","day-to-day"].includes(x))out.uncertain.push(id);else if(x==="available")out.available.push(id);else out.unknown.push(id);
 }
 return out;
}
function features(past,target,line,market,snapshots=[]){
 const m=markets[market];if(!m||!validDate(target.date)||!finite(line)||line<0||line%1!==.5)return null;
 const a=past.filter(x=>validDate(x.date)&&x.date<target.date).sort((x,y)=>x.date.localeCompare(y.date)).slice(-30);
 if(a.length<12||!a.every(x=>finite(x.minutes)&&x.minutes>0&&finite(x[m])&&x[m]>=0))return null;
 const recent=a.slice(-10),minutes=mean(recent.map(x=>x.minutes)),long=mean(a.map(x=>x.minutes));
 const predictedMinutes=clamp(.7*minutes+.3*long,0,48);
 const minuteValues=a.map(x=>x[m]/x.minutes*predictedMinutes);
 const old=smooth(a.map(x=>x[m]),line),rec=smooth(recent.map(x=>x[m]),line);
 const usageOK=a.every(x=>finite(x.usageProxyPerMinute)&&x.usageProxyPerMinute>=0);
 const u=usageOK?mean(recent.map(x=>x.usageProxyPerMinute)):null,ul=usageOK?mean(a.map(x=>x.usageProxyPerMinute)):null;
 const ratio=ul>0?clamp(u/ul,.8,1.2):null;
 // Usage proxy is a heuristic, not official usage %. Avoid applying shot-use adjustment to rebounds.
 const usageP=ratio!==null&&["player_points","player_threes"].includes(market)?smooth(minuteValues.map(x=>x*(1+.5*(ratio-1))),line):null;
 const ctx=contextFor(snapshots,target.date,target.opponent);
 const paceP=ctx?smooth(minuteValues.map(x=>x*clamp(ctx.paceRatio,.9,1.1)),line):null;
 const defenseP=ctx&&["player_points","player_threes","player_points_rebounds_assists"].includes(market)?smooth(minuteValues.map(x=>x*clamp(ctx.paceRatio,.9,1.1)*clamp(ctx.defRatio,.9,1.1)),line):null;
 const starters=recent.filter(x=>typeof x.starter==="boolean");
 return {old,rec,original:.65*old+.35*rec,minutesP:smooth(minuteValues,line),usageP,paceP,defenseP,predictedMinutes,priorUsageProxy:u,priorStartRate:starters.length===recent.length?mean(starters.map(x=>Number(x.starter))):null,context:ctx,teammateAbsenceAdjustment:null,positionalDefenseAdjustment:null};
}
function buildRows(log,history,snapshots){
 if(log?.kind!=="nba_dunk_full_player_log_v1"||history?.kind!=="nba_dunkapi_historical_market_research_v1"||log.providerPlayerId!==history.request.player_id)throw Error("native identity mismatch");
 const m=markets[history.request.market];if(!m)throw Error("unsupported market");
 const rows=[],seen=new Set(),excluded={identityOrActual:0,insufficientPriorOrLine:0};
 for(const r of history.rows){
  if(seen.has(r.providerGameId))throw Error("duplicate market result");seen.add(r.providerGameId);
  const matches=log.rows.filter(x=>x.gameId===r.providerGameId&&x.date===r.gameDate);
  if(matches.length!==1||matches[0][m]!==r.actual){excluded.identityOrActual++;continue;}
  const t=matches[0],f=features(log.rows,{date:t.date,opponent:t.opponent},r.closingLine,history.request.market,snapshots);
  if(!f){excluded.insufficientPriorOrLine++;continue;}
  const a=odds(r.overOdds),b=odds(r.underOdds);
  rows.push({id:JSON.stringify([r.providerGameId,log.providerPlayerId,history.request.market]),gameId:r.providerGameId,date:r.gameDate,market:history.request.market,playerId:log.providerPlayerId,y:Number(r.actual>r.closingLine),actualMinutes:t.minutes,marketP:a!==null&&b!==null?a/(a+b):null,...f});
 }
 return {rows,excluded};
}
const validP=p=>finite(p)&&p>0&&p<1;
function scores(rows,key){
 const a=rows.filter(x=>validP(x[key])),b=Array.from({length:10},(_,i)=>({lo:i/10,hi:(i+1)/10,n:0,p:0,y:0}));
 for(const r of a){const x=b[Math.min(9,Math.floor(r[key]*10))];x.n++;x.p+=r[key];x.y+=r.y;}
 const bins=b.filter(x=>x.n).map(x=>({lo:x.lo,hi:x.hi,n:x.n,meanProbability:x.p/x.n,observedFrequency:x.y/x.n}));
 return {n:a.length,games:new Set(a.map(x=>x.gameId)).size,dates:new Set(a.map(x=>x.date)).size,brier:mean(a.map(x=>(x[key]-x.y)**2)),logLoss:mean(a.map(x=>-(x.y?Math.log(x[key]):Math.log1p(-x[key])))),meanProbability:mean(a.map(x=>x[key])),observedFrequency:mean(a.map(x=>x.y)),ece:a.length?bins.reduce((s,x)=>s+x.n*Math.abs(x.meanProbability-x.observedFrequency),0)/a.length:null,bins};
}
function trainCalibration(rows,key){
 const a=rows.filter(r=>validP(r[key]));
 if(a.length<100||new Set(a.map(r=>r.gameId)).size<30||new Set(a.map(r=>r.date)).size<10)return null;
 const bins=Array.from({length:10},()=>({n:0,wins:0}));
 for(const r of a){const b=bins[Math.min(9,Math.floor(r[key]*10))];b.n++;b.wins+=r.y;}
 return {bins,minBin:20,trainingRows:a.length};
}
function calibrated(p,model){if(!model||!validP(p))return null;const b=model.bins[Math.min(9,Math.floor(p*10))];return b.n>=model.minBin?(b.wins+10*p)/(b.n+10):null;}
function audit(rows,{calibrationStart="2026-01-20",holdoutStart="2026-02-01"}={}){
 if(!validDate(calibrationStart)||!validDate(holdoutStart)||calibrationStart>=holdoutStart)throw Error("invalid split");
 const seen=new Set();for(const r of rows){if(seen.has(r.id)||!validDate(r.date)||![0,1].includes(r.y))throw Error("duplicate or invalid evaluated row");seen.add(r.id);}
 const train=rows.filter(r=>r.date<calibrationStart),cal=rows.filter(r=>r.date>=calibrationStart&&r.date<holdoutStart),hold=rows.filter(r=>r.date>=holdoutStart);
 const variants=["old","original","minutesP","usageP","paceP","defenseP","positionDefenseP","teammateAbsenceP"];
 const paired={};for(const key of variants){const a=hold.filter(r=>validP(r[key])&&validP(r.old));paired[key]={baseline:scores(a,"old"),candidate:scores(a,key)};}
 const common=hold.filter(r=>validP(r.marketP)&&validP(r.old)&&validP(r.original));
 const calibration={};for(const m of Object.keys(markets)){
  const tr=train.filter(r=>r.market===m),c=cal.filter(r=>r.market===m),h=hold.filter(r=>r.market===m);
  const weights=[0,.15,.35,.5,.75,1],rank=weights.map(w=>({w,score:scores(tr.map(r=>({...r,p:(1-w)*r.old+w*r.rec})),"p")}));
  const chosen=rank[0].score.n?rank.reduce((a,b)=>a.score.brier<=b.score.brier?a:b).w:null;
  if(chosen===null){calibration[m]={status:"no_development_data"};continue;}
  const add=r=>({...r,p:(1-chosen)*r.old+chosen*r.rec});
  const model=trainCalibration(c.map(add),"p"),hs=h.map(add).map(r=>({...r,pCal:calibrated(r.p,model)})),matched=hs.filter(r=>validP(r.pCal));
  calibration[m]={chosenWeight:chosen,developmentRows:tr.length,calibrationRows:c.length,holdout:scores(hs,"p"),pairedRaw:scores(matched,"p"),pairedCalibrated:scores(matched,"pCal"),status:model?"retrospective_fit_only":"insufficient_calibration_evidence",approved:false};
 }
 return {kind:"nba_context_calibration_audit_v2",trainRows:train.length,calibrationRows:cal.length,holdoutRows:hold.length,paired,marketPaired:{baseline:scores(common,"old"),original:scores(common,"original"),market:scores(common,"marketP")},minutesMAE:mean(hold.filter(r=>finite(r.actualMinutes)).map(r=>Math.abs(r.predictedMinutes-r.actualMinutes))),calibration,coverage:{pace:rows.filter(r=>r.context).length,usageProxy:rows.filter(r=>validP(r.usageP)).length,starterHistory:rows.filter(r=>finite(r.priorStartRate)).length,teammateAbsence:rows.filter(r=>validP(r.teammateAbsenceP)).length,positionalDefense:rows.filter(r=>validP(r.positionDefenseP)).length},retrospectiveOnly:true,dependentPropRows:true,actualWagersPlaced:0,productionModelChanged:false,prospectiveApproval:false};
}
module.exports={teamSnapshot,contextFor,availabilityAt,features,buildRows,scores,trainCalibration,audit};
