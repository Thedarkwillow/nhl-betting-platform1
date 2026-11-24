"use strict";
(function(){
 const node=document.querySelector("[data-nfl-coverage]");
 if(!node)return;
 fetch("data/nfl-independent-coverage.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("unavailable");return r.json();}).then(d=>{
  const at=Date.parse(d.asOf),now=Date.now();
  if(d.kind!=="public_nfl_independent_scope_coverage_v1"||!Number.isFinite(at)||at>now||
    !Number.isInteger(d.scopedOffers)||d.scopedOffers<1||!Number.isInteger(d.conditionalResearchRows)||d.conditionalResearchRows<0||
    d.completeScope!==true||d.fullNflBoard!==false||d.calibrated!==false||d.playerPropsPublished!==0)
    throw Error("invalid coverage");
  const stamp=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",dateStyle:"medium",timeStyle:"short"}).format(new Date(at));
  node.textContent=d.scopedOffers.toLocaleString("en-US")+" Standard-scope offers archived · "+d.conditionalResearchRows.toLocaleString("en-US")+" conditional model rows matched · "+stamp+" Pacific. "+(now-at<=1800000?"Recent archived source capture.":"Historical capture, no current availability claim.")+" Full NFL board, player-level rankings and calibrated probabilities are not yet released.";
 }).catch(()=>{node.textContent="Verified independent NFL scope coverage is not currently published. NHL rankings are unaffected.";});
})();

(function(){
 const status=document.getElementById("nflResearchStatus"),list=document.getElementById("nflResearchCards");
 if(!status||!list)return;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
 const stamp=x=>Date.parse(x);
 let saved=null;
 function render(){
  list.replaceChildren();
  const now=Date.now(),at=stamp(saved?.asOf);
  if(saved?.kind!=="public_nfl_derived_research_cards_v1"||saved?.calibrated!==false||saved?.conditionalOnPlaying!==true||
     !Number.isFinite(at)||at>now||now-at>1800000||!Array.isArray(saved.cards)||saved.cards.length>12){
    status.textContent="No fresh independent NFL ranked research. Expired cards are withheld.";return;
  }
  const active=saved.cards.filter(p=>typeof p.player==="string"&&Number.isFinite(p.line)&&Number.isFinite(p.modelProjection)&&
    Number.isFinite(p.conditionalModelProbability)&&p.conditionalModelProbability>.5&&p.conditionalModelProbability<1&&
    ["Higher","Lower"].includes(p.side)&&stamp(p.eventStartsAt)-now>=900000);
  status.textContent=active.length+" limited derived research cards · Independent PrizePicks source · Not calibrated, not verified payout or availability.";
  for(const p of active){
   const card=node("article","","card");
   card.append(node("strong",p.player+" · "+p.team),node("p",p.market.replaceAll("_"," ")+" · "+p.side+" "+p.line),
    node("p","Projection "+p.modelProjection+" · "+(100*p.conditionalModelProbability).toFixed(1)+"% conditional estimate","minor"),
    node("p","vs "+p.opponent+" · "+p.priorGames+" prior games","minor"));
   const details=node("details","","minor");
   details.append(node("summary","Why this research direction?"),
    node("p","The historical model projects "+p.modelProjection+" against the "+p.line+" threshold ("+(p.modelProjection>p.line?"above":p.modelProjection<p.line?"below":"equal")+"). "+p.priorGames+" prior games contribute to the current research."),
    node("p","Opponent: "+p.opponent+". Individual positional rank, exact head-to-head results, live workload and verified forecast are not included in this published card. Do not interpret missing context as favorable."));
   card.append(details);
   list.append(card);
  }
 }
 async function refresh(){try{const response=await fetch("data/nfl-research-cards.json",{cache:"no-store"});if(!response.ok)throw Error("unavailable");saved=await response.json();}catch{saved=null;}render();}
 refresh();setInterval(refresh,60000);
})();

(function(){
 const node=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 async function render(tier){
  const name=tier[0].toUpperCase()+tier.slice(1),status=document.getElementById("nfl"+name+"Status"),list=document.getElementById("nfl"+name+"Cards");
  if(!status||!list)return;
  try{
   const res=await fetch("data/nfl-"+tier+"-research-cards.json",{cache:"no-store"});if(!res.ok)throw Error("unavailable");
   const d=await res.json(),now=Date.now(),at=Date.parse(d.asOf);
   if(d.kind!=="public_nfl_derived_research_cards_v1"||d.tier!==name||d.calibrated!==false||d.conditionalOnPlaying!==true||
    !Number.isFinite(at)||at>now||now-at>1800000||!Array.isArray(d.cards)||d.cards.length>4)throw Error("stale");
   const cards=d.cards.filter(p=>p.tier===name&&p.side==="Higher"&&typeof p.player==="string"&&typeof p.market==="string"&&Number.isFinite(p.line)&&
    Number.isFinite(p.modelProjection)&&Number.isFinite(p.conditionalModelProbability)&&p.conditionalModelProbability>0&&p.conditionalModelProbability<1&&Date.parse(p.eventStartsAt)-now>=900000);
   list.replaceChildren();status.textContent=cards.length+" fresh scoped research cards · Conditional, uncalibrated estimates.";
   for(const p of cards){
    const card=node("article","","card");card.append(node("strong",p.player+" · "+p.team),node("p",p.market.replaceAll("_"," ")+" · Higher "+p.line),
     node("p","Projection "+p.modelProjection+" · "+(100*p.conditionalModelProbability).toFixed(1)+"% conditional estimate","minor"),
     node("p","vs "+p.opponent+" · "+p.priorGames+" prior games","minor"));
   const details=node("details","","minor");
   details.append(node("summary","Why this research direction?"),
    node("p","The historical model projects "+p.modelProjection+" against the "+p.line+" threshold ("+(p.modelProjection>p.line?"above":p.modelProjection<p.line?"below":"equal")+"). "+p.priorGames+" prior games contribute to the current research."),
    node("p","Opponent: "+p.opponent+". Individual positional rank, exact head-to-head results, live workload and verified forecast are not included in this published card. Do not interpret missing context as favorable."));
   card.append(details);
    list.append(card);
   }
  }catch{list.replaceChildren();status.textContent="No fresh verified "+name+" scope; expired or incomplete research withheld.";}
 }
 const refresh=()=>Promise.all(["goblin","demon"].map(render));refresh();setInterval(refresh,60000);
})();
