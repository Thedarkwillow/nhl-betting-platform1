"use strict";
// Offline research only. Source assertions are not independently authenticated.
function validate(input){
 const need=(x,m)=>{if(!x)throw Error(m)},time=x=>typeof x==="string"?Date.parse(x):NaN,day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(time(x))&&new Date(time(x)).toISOString().slice(0,10)===x;
 const name=x=>String(x??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const official=x=>typeof x==="string"&&/^https:\/\/(?:www\.|official\.|cdn\.|stats\.|ak-static\.cms\.)?nba\.com(?:\/|$)/i.test(x),id=x=>/^\d+$/.test(String(x))&&Number.isSafeInteger(Number(x))&&Number(x)>0;
 const finite=Number.isFinite,pvalid=p=>finite(p)&&p>0&&p<1,clip=p=>Math.max(.001,Math.min(.999,p)),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const count=a=>({n:a.length,games:new Set(a.map(r=>String(r.gameId))).size,dates:new Set(a.map(r=>r.date)).size});
 const enough=a=>{const c=count(a);return c.n>=100&&c.games>=30&&c.dates>=10};
 need(Array.isArray(input.injuries)&&Array.isArray(input.roster),"missing injury or roster records");
 const rowIds=new Set(),mapped=input.injuries.map(r=>{
  need(typeof r.rowId==="string"&&r.rowId&&!rowIds.has(r.rowId),"duplicate or missing injury row ID");rowIds.add(r.rowId);
  const valid=day(r.date)&&id(r.gameId)&&/^[A-Z]{3}$/.test(r.team)&&name(r.player)&&official(r.sourceUrl)&&finite(time(r.publishedAt));
  const a=valid?input.roster.filter(p=>id(p.playerId)&&p.team===r.team&&day(p.from)&&day(p.through)&&p.from<=r.date&&r.date<=p.through&&official(p.sourceUrl)&&finite(time(p.effectiveAt))&&time(p.effectiveAt)<=time(r.publishedAt)&&[p.name,...(p.reviewedAliases??[])].some(n=>name(n)===name(r.player))):[];
  const ids=[...new Set(a.map(p=>String(p.playerId)))];
  return {...r,mappedPlayerId:ids.length===1?ids[0]:null,mappingStatus:!valid?"invalid_evidence":ids.length===1?"unique_dated_roster_match":ids.length?"ambiguous":"no_dated_roster_match",candidateIds:ids,rosterSources:[...new Set(a.map(p=>p.sourceUrl))]};
 });
 const keys=new Set(),games=new Map(),parts={},ranges={};let prior=null;
 for(const label of ["development","calibration","holdout","independent"]){
  const rows=input.datasets?.[label];need(Array.isArray(rows),"missing partition "+label);
  let min=null,max=null;
  parts[label]=rows.map(r=>{
   need(day(r.date)&&id(r.gameId)&&id(r.playerId)&&typeof r.market==="string"&&r.market&&/^[A-Z]{3}$/.test(r.team)&&/^[A-Z]{3}$/.test(r.opponent)&&r.team!==r.opponent&&finite(r.line)&&r.line>=0&&r.line%1===.5&&finite(r.actual)&&r.actual>=0&&r.y===Number(r.actual>r.line)&&pvalid(r.baselineP)&&typeof r.lineSourceUrl==="string"&&r.lineSourceUrl.startsWith("https://")&&finite(time(r.featureCutoffAt))&&finite(time(r.tipAt))&&time(r.featureCutoffAt)<time(r.tipAt),"invalid real-line row");
   const k=[r.gameId,r.playerId,r.market].join("|"),g=String(r.gameId);need(!keys.has(k),"duplicate player-game-market");keys.add(k);need(!games.has(g)||games.get(g)===label,"game crosses partitions");games.set(g,label);
   min=min===null||r.date<min?r.date:min;max=max===null||r.date>max?r.date:max;
   const t=time(r.featureCutoffAt),a=mapped.filter(i=>i.mappedPlayerId!==null&&id(r.teammateId)&&String(r.teammateId)!==String(r.playerId)&&String(i.gameId)===g&&i.date===r.date&&i.team===r.team&&i.mappedPlayerId===String(r.teammateId)&&time(i.publishedAt)<=t&&t-time(i.publishedAt)<=6*3600000).sort((a,b)=>time(b.publishedAt)-time(a.publishedAt));
   const status=new Set(a.filter(x=>time(x.publishedAt)===time(a[0]?.publishedAt)).map(x=>String(x.status).toLowerCase()));
   const absence=status.size===1&&status.has("out")?1:status.size===1&&status.has("available")?0:null;
   const ratio=e=>e&&e.opponent===r.opponent&&e.sampleGames>=10&&typeof e.sourceUrl==="string"&&e.sourceUrl.startsWith("https://")&&finite(time(e.asOf))&&time(e.asOf)<=t&&finite(e.ratio)&&e.ratio>=.7&&e.ratio<=1.3?e.ratio:null;
   const pd=r.positionalDefense,positionDefense=pd&&typeof r.position==="string"&&r.position&&pd.position===r.position&&pd.market===r.market&&official(r.positionSourceUrl)&&finite(time(r.positionAsOf))&&time(r.positionAsOf)<=t?ratio(pd):null;
   return {...r,absence,pace:ratio(r.opponentPace),positionDefense};
  });
  need(!min||!prior||min>prior,"partitions must be chronological; earlier independent cohort requires earlier training");if(max)prior=max;ranges[label]={from:min,through:max,...count(rows)};
 }
 function score(a,k){a=a.filter(r=>pvalid(r[k]));const bins=Array.from({length:10},()=>[]);for(const r of a)bins[Math.min(9,Math.floor(r[k]*10))].push(r);
  return {...count(a),brier:mean(a.map(r=>(r[k]-r.y)**2)),logLoss:mean(a.map(r=>-(r.y*Math.log(r[k])+(1-r.y)*Math.log(1-r[k])))),ece:a.length?bins.reduce((s,b)=>s+(b.length?b.length*Math.abs(mean(b.map(r=>r[k]))-mean(b.map(r=>r.y))):0),0)/a.length:null,accuracy:mean(a.filter(r=>r[k]!==.5).map(r=>Number((r[k]>.5)===(r.y===1)))),alwaysHigher:mean(a.map(r=>r.y)),alwaysLower:mean(a.map(r=>1-r.y))};
 }
 const pair=(a,k,b="baselineP")=>{a=a.filter(r=>pvalid(r[k])&&pvalid(r[b]));return {baseline:score(a,b),candidate:score(a,k)}};
 const group=r=>[r.team,r.playerId,r.teammateId].join("|");
 function fit(a,k){a=a.filter(r=>finite(r[k]));if(!enough(a))return null;const x=mean(a.map(r=>r[k])),y=mean(a.map(r=>r.y-r.baselineP)),den=a.reduce((s,r)=>s+(r[k]-x)**2,0);if(den<.02)return null;return {center:x,slope:Math.max(-1,Math.min(1,a.reduce((s,r)=>s+(r[k]-x)*(r.y-r.baselineP-y),0)/(den+.5))),n:a.length}}
 function absFit(a){const groups=new Map(),out={};for(const r of a.filter(r=>r.absence!==null)){const k=group(r);if(!groups.has(k))groups.set(k,[[],[]]);groups.get(k)[r.absence].push(r)}
  for(const [k,[yes,no]] of groups){if(count(yes).games<8||count(no).games<8)continue;const d=mean(no.map(r=>r.y-r.baselineP))-mean(yes.map(r=>r.y-r.baselineP)),n=Math.min(yes.length,no.length);out[k]={effect:Math.max(-.15,Math.min(.15,d))*n/(n+20),available:yes.length,out:no.length}}return out}
 const cal=(p,m)=>m&&pvalid(p)?clip(1/(1+Math.exp(-(m.intercept+m.slope*Math.log(p/(1-p)))))):null;
 function calFit(a,k){a=a.filter(r=>pvalid(r[k]));if(!enough(a)||new Set(a.map(r=>r.y)).size!==2)return null;let best=null;for(const slope of [.5,.75,1,1.25,1.5])for(const intercept of [-.5,-.25,0,.25,.5]){const m={slope,intercept},loss=mean(a.map(r=>{const p=cal(r[k],m);return -(r.y*Math.log(p)+(1-r.y)*Math.log(1-p))}))+.01*((slope-1)**2+intercept**2);if(!best||loss<best.loss)best={...m,loss}}return {...best,...count(a)}}
 const variants=["absenceP","paceP","positionalDefenseP","combinedP"],probs=["baselineP",...variants],markets={};
 for(const market of new Set(Object.values(parts).flat().map(r=>r.market))){
  const a=Object.fromEntries(Object.entries(parts).map(([k,a])=>[k,a.filter(r=>r.market===market)])),d=a.development;
  const models={absence:absFit(d),pace:fit(d,"pace"),positionalDefense:fit(d,"positionDefense")};
  const project=r=>{const p=r.baselineP,ab=models.absence[group(r)],u=models.pace,v=models.positionalDefense,x=ab&&r.absence!==null?ab.effect*r.absence:null,y=u&&r.pace!==null?u.slope*(r.pace-u.center):null,z=v&&r.positionDefense!==null?v.slope*(r.positionDefense-v.center):null;return {...r,absenceP:x===null?null:clip(p+x),paceP:y===null?null:clip(p+y),positionalDefenseP:z===null?null:clip(p+z),combinedP:[x,y,z].every(finite)?clip(p+x+y+z):null}};
  const b=Object.fromEntries(Object.entries(a).map(([k,x])=>[k,x.map(project)])),calibration=Object.fromEntries(probs.map(k=>[k,calFit(b.calibration,k)]));
  const evaluate=a=>({input:count(a),featureCoverage:{absence:a.filter(r=>r.absence!==null).length,pace:a.filter(r=>r.pace!==null).length,positionalDefense:a.filter(r=>r.positionDefense!==null).length},baseline:score(a,"baselineP"),features:Object.fromEntries(variants.map(k=>[k,pair(a,k)])),calibration:Object.fromEntries(probs.map(k=>[k,pair(a.map(r=>({...r,calP:cal(r[k],calibration[k])})),"calP",k)])),marketBenchmark:pair(a,"marketP")});
  markets[market]={models,calibration,holdout:evaluate(b.holdout),independent:evaluate(b.independent),independentMinimumMet:enough(b.independent),approved:false};
 }
 return {kind:"nba_final_validation_v3",identity:{received:mapped.length,mapped:mapped.filter(r=>r.mappedPlayerId!==null).length,unresolved:mapped.filter(r=>r.mappedPlayerId===null).length,rows:mapped},partitions:ranges,markets,sourceClaimsIndependentlyVerified:false,untouchedHistoryIndependentlyVerified:false,retrospectiveOnly:true,productionModelChanged:false,prospectiveApproval:false,paidRequests:0};
}
module.exports={validate};
if(require.main===module){try{const fs=require("node:fs"),crypto=require("node:crypto"),p=process.argv[2];if(!p)throw Error("usage: node scripts/run-nba-final-validation-v3.cjs <input.json>");const bytes=fs.readFileSync(p),r=validate(JSON.parse(bytes));r.inputSha256=crypto.createHash("sha256").update(bytes).digest("hex");console.log(JSON.stringify(r,null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
