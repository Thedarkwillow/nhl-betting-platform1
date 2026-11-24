"use strict";
// Evaluate game-level dependence using only previously observed frozen
// selections. Choose legs by fixed identity order, never by results.
// Rank transform of randomized binary PIT residuals preserves each supplied
// marginal up to 1/N; these are uncalibrated research probabilities.
const dt=Date.parse,valid=x=>Number.isFinite(x)&&x>0&&x<1;
function independent(ps){let a=[1];for(const p of ps){const b=Array(a.length+1).fill(0);a.forEach((v,i)=>{b[i]+=v*(1-p);b[i+1]+=v*p});a=b;}return a;}
function jitter(key){let h=2166136261;for(const c of String(key))h=Math.imul(h^c.charCodeAt(0),16777619);return ((h>>>0)+.5)/4294967296;}
function mass(ps,donors){const n=donors.length;if(n<30||ps.some(p=>!valid(p))||donors.some(d=>d.legs.length!==ps.length||d.legs.some(x=>!valid(x.p)||![0,1].includes(x.y))))return null;
 const ranks=ps.map((p,i)=>{const a=donors.map((d,j)=>{const x=d.legs[i],u=jitter(d.gameId+"|"+i);return {j,u:x.y?1-x.p+x.p*u:(1-x.p)*u};}).sort((a,b)=>a.u-b.u||a.j-b.j);const r=[];a.forEach((v,k)=>r[v.j]=(k+.5)/n);return r;});
 const out=Array(ps.length+1).fill(0),marginals=ps.map(()=>0);for(let j=0;j<n;j++){let hits=0;ps.forEach((p,i)=>{if(ranks[i][j]>1-p){hits++;marginals[i]+=1/n;}});out[hits]+=1/n;}
 return {mass:out,marginals,maximumMarginalError:Math.max(...ps.map((p,i)=>Math.abs(p-marginals[i]))),donors:n};
}
function study(state,{grouping='exact'}={}){const blocked=new Set(state?.quarantined||[]),by=new Map(),out={};for(const r of state?.firstObserved||[]){if(blocked.has(r.id)||r.gameId==null||r.playerId==null||!r.team||!valid(r.p)||![0,1].includes(r.y)||!(dt(r.frozenAt)<dt(r.startAt)&&dt(r.startAt)<dt(r.observedFinalAt)))continue;const a=by.get(r.gameId)||[];a.push(r);by.set(r.gameId,a);}
 const cohorts=new Map();for(const [gameId,rs] of by){const unique=new Map();for(const r of [...rs].sort((a,b)=>dt(a.frozenAt)-dt(b.frozenAt)||String(a.id).localeCompare(String(b.id)))){const k=r.playerId+"|"+r.market+"|"+(r.period||"full_game");if(!unique.has(k))unique.set(k,r);}
 const a=[...unique.values()].sort((a,b)=>[a.market,a.tier,a.side,a.playerId].join("|").localeCompare([b.market,b.tier,b.side,b.playerId].join("|")));
 for(let size=2;size<=6;size++){const legs=[],players=new Set();for(const x of a){if(players.has(x.playerId))continue;players.add(x.playerId);legs.push(x);if(legs.length===size)break;}if(legs.length!==size||new Set(legs.map(x=>x.startAt)).size!==1)continue;
 const teams=new Map(),sig=legs.map(x=>{if(!teams.has(x.team))teams.set(x.team,teams.size);return grouping==="market_side_pooled"?[x.market,x.period||"full_game",x.side,teams.get(x.team)]:[x.market,x.period||"full_game",x.tier,x.side,teams.get(x.team)];}),key=JSON.stringify(sig),v=cohorts.get(key)||[];v.push({gameId,legs,frozenAt:Math.max(...legs.map(x=>dt(x.frozenAt))),observedAt:Math.max(...legs.map(x=>dt(x.observedFinalAt)))});cohorts.set(key,v);}
 }
 const brier=(p,y)=>p.reduce((s,x,i)=>s+(x-Number(i===y))**2,0),loss=(p,y)=>-Math.log(Math.max(1e-8,p[y]));
 for(const rows of cohorts.values()){const n=rows[0].legs.length,b=out[n]??={registered:0,heldout:0,raw:0,correlated:0,rawLoss:0,correlatedLoss:0};b.registered+=rows.length;
 for(const r of rows){const donors=rows.filter(x=>x.gameId!==r.gameId&&x.observedAt<r.frozenAt);const ps=r.legs.map(x=>x.p),v=mass(ps,donors);if(!v)continue;const base=independent(ps),q=base.map((x,i)=>.5*x+.5*v.mass[i]),y=r.legs.reduce((s,x)=>s+x.y,0);b.heldout++;b.raw+=brier(base,y);b.correlated+=brier(q,y);b.rawLoss+=loss(base,y);b.correlatedLoss+=loss(q,y);}
 }
 return {kind:"same_game_frozen_leg_copula_research_v1",bySize:Object.fromEntries(Array.from({length:5},(_,i)=>{const size=i+2,b=out[size]||{registered:0,heldout:0};return [size,{registered:b.registered,heldout:b.heldout,independentBrier:b.heldout?b.raw/b.heldout:null,correlatedBrier:b.heldout?b.correlated/b.heldout:null,independentLogLoss:b.heldout?b.rawLoss/b.heldout:null,correlatedLogLoss:b.heldout?b.correlatedLoss/b.heldout:null,minimumEvidenceMet:b.heldout>=100}]})),grouping,pooledTierAssumptionRequiresValidation:grouping!=="exact",sameGameResearchOnly:true,actualEntryAuthenticated:false,calibrationApproved:false,modelPromoted:false};
}
module.exports={study,mass,independent};