"use strict";
// Bounded offline research scenario comparison only. Neither platform rules nor
// joint probabilities are supplied by this module. It never verifies a wager or places one.
const outcomes=new Set(["win","loss","push","void"]);
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const nonempty=v=>typeof v==="string"&&v.trim().length>0;
function evaluateCards(input){
 if(!input||input.kind!=="hypothetical_joint_scenario_v1"||!nonempty(input.platform)||!nonempty(input.scenarioSource)||!nonempty(input.payoutSource)||!Array.isArray(input.legs)||input.legs.length>12||!Array.isArray(input.scenarios)||input.scenarios.length<1||input.scenarios.length>1000)throw Error("bounded explicit scenario contract");
 const legs=input.legs,ids=new Set();
 for(const l of legs){
  if(!l||!nonempty(l.id)||ids.has(l.id)||!nonempty(l.player)||!nonempty(l.event)||l.tier!=="Standard"||l.platform!==input.platform)throw Error("exact same-platform Standard leg contract");
  ids.add(l.id);
 }
 let total=0;
 for(const s of input.scenarios){
  if(!finite(s.weight)||s.weight<=0||!s.outcomes||Object.keys(s.outcomes).length!==ids.size||[...ids].some(id=>!outcomes.has(s.outcomes[id])))throw Error("complete joint outcomes required");
  total+=s.weight;
 }
 if(Math.abs(total-1)>1e-8)throw Error("weights must sum to one");
 const sizes={};
 for(let k=2;k<=6;k++){
  const payout=input.payouts?.[k],candidates=[];let missingRules=0,excluded=0,considered=0;
  if(!payout||typeof payout!=="object"){sizes[k]={status:"missing_payout_table",candidates:0};continue;}
  function visit(from,chosen){
   if(chosen.length===k){
    considered++;
    if(new Set(chosen.map(l=>l.player)).size!==k){excluded++;return;}
    // No implicit permission for same-game combinations. Scope to distinct events.
    if(new Set(chosen.map(l=>l.event)).size!==k){excluded++;return;}
    let mean=0,profit=0,loss=0,allWin=0,unknown=false;
    const marginal=chosen.map(()=>0),pairwise=[];
    for(let i=0;i<k;i++)for(let j=i+1;j<k;j++)pairwise.push({i,j,joint:0});
    for(const s of input.scenarios){
     const c={win:0,loss:0,push:0,void:0};const values=chosen.map(l=>s.outcomes[l.id]);
     for(const v of values)c[v]++;
     const key=[c.win,c.loss,c.push,c.void].join(","),mult=payout[key];
     if(!Object.hasOwn(payout,key)||!finite(mult)||mult<0){unknown=true;break;}
     mean+=s.weight*mult;profit+=s.weight*Number(mult>1);loss+=s.weight*Number(mult<1);allWin+=s.weight*Number(c.win===k);
     for(let i=0;i<k;i++)marginal[i]+=s.weight*Number(values[i]==="win");
     for(const p of pairwise)p.joint+=s.weight*Number(values[p.i]==="win"&&values[p.j]==="win");
    }
    if(unknown){missingRules++;return;}
    const dependencies=pairwise.map(p=>{const a=marginal[p.i],b=marginal[p.j],den=Math.sqrt(a*(1-a)*b*(1-b));return {a:chosen[p.i].id,b:chosen[p.j].id,winCorrelation:den>1e-10?(p.joint-a*b)/den:null};});
    candidates.push({legs:chosen.map(l=>l.id),scenarioExpectedNet:mean-1,scenarioProfitProbability:profit,scenarioLossProbability:loss,scenarioAllWinProbability:allWin,weakestMarginal:Math.min(...marginal),independenceAllWinComparator:marginal.reduce((a,b)=>a*b,1),dependencies});
    return;
   }
   for(let i=from;i<=legs.length-(k-chosen.length);i++)visit(i+1,[...chosen,legs[i]]);
  }
  visit(0,[]);
  candidates.sort((a,b)=>b.scenarioExpectedNet-a.scenarioExpectedNet||b.weakestMarginal-a.weakestMarginal||a.legs.join(",").localeCompare(b.legs.join(",")));
  sizes[k]={status:candidates.length?"hypothetical_comparison":"no_eligible_scenarios",considered,excluded,missingRules,candidates:candidates.length,topScenarioOnly:candidates.slice(0,3)};
 }
 return {kind:"hypothetical_joint_scenario_audit_v1",platform:input.platform,scenarioSource:input.scenarioSource,payoutSource:input.payoutSource,assumptionsExternallyVerified:false,actualPlatformEVVerified:false,modelApproved:false,selectionRecommendations:false,sizes};
}
module.exports={evaluateCards};
