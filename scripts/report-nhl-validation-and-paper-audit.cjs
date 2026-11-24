"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {diagnostics,calibration}=require("../src/nhl-market-error-and-calibration-audit.cjs"),{paper}=require("../src/nhl-paper-first-registered-formats.cjs"),{compare}=require("../src/archived-prop-market-benchmark.cjs"),{originalFrames}=require("./report-nhl-standard-triple-challengers.cjs"),{rowValid}=require("../src/nhl-frozen-baseline-challenge.cjs");
const {score:pairedCalibrationScore}=require("../src/nhl-original-line-calibration-pairs.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:96*1024*1024}).trim();
const opt=p=>{try{return read(p);}catch{return null;}};
function filePolicy(p){try{const a=git(["log","--diff-filter=A","--format=%cI","--",p]).split("\n").filter(Boolean);return a.length===1?a[0]:null;}catch{return null;}}
function archive(p){try{const a=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(a.length!==1)return null;const s=JSON.parse(git(["show",a[0]+":"+p])),first=git(["show","-s","--format=%cI",a[0]]);if(!Number.isFinite(dt(s.generatedAt))||dt(first)<Math.floor(dt(s.generatedAt)/1000)*1000||dt(first)-dt(s.generatedAt)>900000)return null;return {s,first,commit:a[0]};}catch{return null;}}
const list=(d,re)=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>re.test(n)).sort():[];
function save(p,d,immutable=false){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n",immutable?{flag:"wx"}:{});}
const k=r=>JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier,r.lean||r.selectedSide||r.side]),group=r=>JSON.stringify([r.tier,r.market,r.period||"full_game",r.lean||r.selectedSide||r.side]);
function calTrial(cal,frames,ledger,policy,now){
 const dest="outputs/research/market-calibration-v3",accepted=[],seen=new Set(),results={},sources=new Map(frames.filter(f=>f.gitHistoryCount===1).map(f=>[f.path,f]));
 const rows=new Map();for(const r of ledger.records||[])if(rowValid(r)){const z=rows.get(k(r))||[];z.push(r);rows.set(k(r),z);}
 for(const n of list(dest,/^\d{8}T\d{9}Z\.json$/)){const a=archive(dest+"/"+n);if(!a||!policy||dt(a.first)<=dt(policy)||a.s.kind!=="private_market_calibration_trial_v3")continue;const f=sources.get(a.s.source);
  if(!f||f.gitHistoryCount!==1||dt(f.firstCommittedAt)>dt(a.s.generatedAt)||dt(f.snapshot.generatedAt)<=dt(policy)||dt(a.s.generatedAt)-dt(f.snapshot.generatedAt)>1800000)continue;
  for(const r of a.s.rows||[]){const key=k(r),p=(f.snapshot.rankedProps||[]).filter(z=>k(z)===key&&z.capturedAt===r.capturedAt);if(seen.has(key)||p.length!==1||p[0].probability!==r.raw||!Number.isFinite(r.adjusted)||r.adjusted<=0||r.adjusted>=1||dt(a.first)>=dt(r.gameStartAt)-900000)continue;
   seen.add(key);accepted.push(r);const g=results[group(r)]??={registered:0,decided:0,base:0,fit:0,games:new Set(),dates:new Set(),pairs:[]};g.registered++;const candidates=(rows.get(key)||[]).filter(x=>x.firstCaptureAt===r.capturedAt&&["correct","incorrect"].includes(x.selectionStatus)&&x.line%1===.5);
   if(candidates.length!==1)continue;const y=Number(candidates[0].selectionStatus==="correct");g.decided++;g.base+=(r.raw-y)**2;g.fit+=(r.adjusted-y)**2;g.games.add(r.gameId);g.dates.add(candidates[0].officialGameDate);g.pairs.push({id:key,gameId:r.gameId,day:candidates[0].officialGameDate,raw:r.raw,adjusted:r.adjusted,y});
  }
 }
 let frozen=[];const f=frames.at(-1);
 if(policy&&f&&f.gitHistoryCount===1&&dt(f.snapshot.generatedAt)>dt(policy)&&dt(f.firstCommittedAt)<=dt(now)&&dt(now)-dt(f.snapshot.generatedAt)<=1800000){
  for(const p of f.snapshot.individualPropSelections||[]){const key=k(p),raw=(f.snapshot.rankedProps||[]).filter(z=>k(z)===key&&z.capturedAt===p.capturedAt);if(seen.has(key)||raw.length!==1||p.line%1!==.5||!["Standard","Goblin","Demon"].includes(p.tier)||!["Higher","Lower"].includes(p.lean)||p.tier!=="Standard"&&p.lean!=="Higher"||dt(p.gameStartAt)<=dt(now)+900000||dt(now)-dt(p.capturedAt)>1800000)continue;
   const x=raw[0],v=cal.parameters[group({...p,period:p.period==="Full game"?"full_game":p.period})]||cal.parameters[group({...p,period:"full_game"})];if(!v||!Number.isFinite(x.probability)||x.probability<=0||x.probability>=1)continue;
   const q=Math.max(.001,Math.min(.999,x.probability)),adj=1/(1+Math.exp(-(v.intercept+v.slope*Math.log(q/(1-q)))));
   seen.add(key);frozen.push({gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,side:p.lean,period:"full_game",capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,raw:x.probability,adjusted:adj,fit:v,researchOnly:true});
  }
  const at=new Date().toISOString();frozen=frozen.filter(r=>dt(r.gameStartAt)>dt(at)+900000&&dt(at)-dt(f.snapshot.generatedAt)<=1800000);
  if(frozen.length)save(dest+"/"+at.replace(/[-:.]/g,"")+".json",{kind:"private_market_calibration_trial_v3",generatedAt:at,source:f.path,rows:frozen,approved:false},true);
 }
 return {registered:accepted.length,newFrozen:frozen.length,byGroup:Object.fromEntries(Object.entries(results).map(([k,b])=>[k,{registered:b.registered,decided:b.decided,distinctGames:b.games.size,distinctDates:b.dates.size,rawBrier:b.decided?b.base/b.decided:null,calibratorBrier:b.decided?b.fit/b.decided:null,pairedGameEvidence:pairedCalibrationScore(b.pairs),approved:false}])),approved:false};
}
function main(){
 const now=new Date().toISOString(),ledger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json"),history=read("outputs/history/players.json"),schedule=read("outputs/official-nhl/season-schedules/2026-27.json"),frames=originalFrames();
 const policy=filePolicy("src/nhl-market-error-and-calibration-audit.cjs"),paperPolicy=filePolicy("src/nhl-paper-first-registered-formats.cjs");
 const prev=opt("outputs/health/nhl-standard-forward-improvement-latest.json"),cal=calibration(prev?.firstObservedCalibrationState,ledger,policy);
 const calibrationTrial=calTrial(cal,frames,ledger,policy,now);
 const dir="outputs/sportsbooks/bounded-live",originalOdds=list(dir,/^\d{8}T\d{9}Z\.json$/).map(n=>archive(dir+"/"+n)).filter(Boolean),odds=originalOdds.map(a=>{const r=compare(a.s,{NHL:frames,NFL:[]});return {at:r.archiveAt,firstGit:a.first,nativeGroups:r.nativeGroups,matchedNHL:r.bySport.NHL,within30:r.within30Minutes,freshNow:dt(now)-dt(r.archiveAt)<=1800000};});
 const nflFrames=list("outputs/nfl/independent-source/forward-snapshots",/^\d{8}T\d{6}Z\.json$/).map(n=>{const p="outputs/nfl/independent-source/forward-snapshots/"+n;try{const a=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);return a.length===1?{snapshot:read(p),firstCommittedAt:git(["show","-s","--format=%cI",a[0]]),gitHistoryCount:1}:null;}catch{return null;}}).filter(Boolean);
 const funnel=require("../src/sportsbook-match-funnel.cjs").audit(originalOdds.map(a=>({archive:a.s,firstCommittedAt:a.first,gitHistoryCount:1})),{NHL:frames,NFL:nflFrames});
 const result={kind:"private_nhl_validation_and_paper_audit_v1",generatedAt:new Date().toISOString(),policy,diagnostics:diagnostics(ledger,history,schedule),calibration:cal,calibrationTrial,paperHistorical:paper(frames,history,schedule,"2026-11-01T00:00:00Z"),paperProspective:paper(frames,history,schedule,paperPolicy),sportsbook:{matchFunnel:funnel,archives:odds,freshMatchedNHL:odds.filter(x=>x.freshNow).reduce((s,x)=>s+x.within30,0),providerRequests:0,identityConditional:true},confidenceApproved:false,modelPromoted:false,optimizedLineupsApproved:false,paidRequests:0};
 save("outputs/health/nhl-validation-and-paper-audit-latest.json",result);console.log(JSON.stringify({diagnostics:result.diagnostics.status,observed:cal.observations,fitted:cal.fittedGroups,newCal:calibrationTrial.newFrozen,paperFormats:Object.keys(result.paperProspective.formats).length,paidRequests:0,approved:false}));
}
if(require.main===module)main();
