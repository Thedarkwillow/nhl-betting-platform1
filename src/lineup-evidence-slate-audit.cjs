"use strict";
// Aggregate-only descriptive slate evidence. Power/Flex across a date share
// selections; do not pool them as independent trials. No estimated cash ROI.
const {STANDARD}=require("./prizepicks-payouts.cjs");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
function equalCoinMass(n){let a=[1];for(let i=0;i<n;i++){const b=Array(a.length+1).fill(0);a.forEach((p,j)=>{b[j]+=p/2;b[j+1]+=p/2;});a=b;}return a;}
function audit(state){
 const blocked=new Set(state?.quarantinedIds||[]),matches=new Map(),dups=new Set();
 for(const r of state?.firstObservationLedger||[]){
  const m=/^(power|flex)_([2-6])$/.exec(r.formatSize||"");
  if(!m||m[1]==="flex"&&m[2]==="2"||blocked.has(r.id)||typeof r.id!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(r.slate||"")||!Number.isInteger(r.hits)||r.hits<0||r.hits>Number(m[2])||!(at(r.frozenAt)<at(r.resolvedAt))||!Array.isArray(r.mass)||r.mass.length!==Number(m[2])+1||r.mass.some(p=>!Number.isFinite(p)||p<0||p>1)||Math.abs(r.mass.reduce((s,p)=>s+p,0)-1)>1e-6)continue;
  if(matches.has(r.id))dups.add(r.id);matches.set(r.id,r);
 }
 const groups={},slates=new Set(),bySlate=new Map();
 for(const r of [...matches.values()].filter(r=>!dups.has(r.id)).sort((a,b)=>at(a.frozenAt)-at(b.frozenAt)||a.id.localeCompare(b.id))){
  const q=r.formatSize+"|"+r.slate;if(bySlate.has(q))continue;bySlate.set(q,r);slates.add(r.slate);
  const [format,n]=r.formatSize.split("_"),size=Number(n),a=groups[r.formatSize]??={slates:0,hitCounts:Array(size+1).fill(0),allHit:0,referenceGross:0,rawBrier:0,rawLogLoss:0,coinBrier:0,coinLogLoss:0};
  a.slates++;a.hitCounts[r.hits]++;a.allHit+=Number(r.hits===size);a.referenceGross+=STANDARD[format]?.[size]?.[r.hits]??0;
  const coin=equalCoinMass(size);a.coinBrier+=coin.reduce((s,p,i)=>s+(p-Number(i===r.hits))**2,0);a.coinLogLoss-=Math.log(coin[r.hits]);
  a.rawBrier+=r.mass.reduce((s,p,i)=>s+(p-Number(i===r.hits))**2,0);a.rawLogLoss-=Math.log(Math.max(1e-8,r.mass[r.hits]));
 }
 return {kind:"lineup_first_observed_slate_coverage_v1",distinctSlatesAcrossFormats:slates.size,byFormat:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,{distinctResolvedSlates:a.slates,hitCounts:a.hitCounts,allHit:a.allHit,countBrier:a.rawBrier/a.slates,countLogLoss:a.rawLogLoss/a.slates,equalCoinIndependentCountBrier:a.coinBrier/a.slates,equalCoinIndependentCountLogLoss:a.coinLogLoss/a.slates,matchedBaselineDescriptiveOnly:true,referenceNetUnits:a.referenceGross-a.slates,referenceROI:a.referenceGross/a.slates-1,sufficientForIndependentReview:a.slates>=50,calibrationApproved:false}])),oneEarliestResolvedPerFormatSlate:true,unresolvedEarlierScenariosMayExist:true,pooledSampleSize:null,authenticatedPayout:false,verifiedROI:null,modelPromoted:false};
}
module.exports={audit,equalCoinMass};
