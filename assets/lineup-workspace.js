/* Customer-side research workspace, using only public, source-fresh offer fields.
   Not a platform lineup validator, a joint probability model, or a payout/EV calculator. */
(function (root, factory) {
  "use strict";
  const api=factory();
  if (typeof module==="object" && module.exports) module.exports=api;
  else root.NhlLineupWorkspace=api;
})(typeof globalThis!=="undefined"?globalThis:this,function () {
  "use strict";
  const norm=x=>String(x??"").trim().toLowerCase().replace(/\s+/g," ");
  const playerKey=p=>norm(p?.player); // Conservative: never reuse a name within one slip.
  const key=p=>JSON.stringify([norm(p?.player),norm(p?.team),norm(p?.market),
    Number(p?.line),norm(p?.lean),norm(p?.tier),norm(p?.matchup),
    String(p?.eventStartsAt??""),String(p?.capturedAt??"")]);
  function eligible(p,at){
    const now=Number(at),capture=Date.parse(p?.capturedAt),start=Date.parse(p?.eventStartsAt);
    return Number.isFinite(now)&&p?.tier==="Standard"&&
      (p.researchEligibility==="research_only"||p.researchEligibility===undefined)&&
      !p.roleWarning&&(p.lean==="Higher"||p.lean==="Lower")&&
      typeof p.player==="string"&&!!norm(p.player)&&
      typeof p.matchup==="string"&&!!norm(p.matchup)&&
      Number.isFinite(Number(p.line))&&Number.isFinite(p.probability)&&
      p.probability>0.5&&p.probability<1&&
      Number.isFinite(capture)&&Number.isFinite(start)&&capture<=now&&
      capture<start&&now-capture<=30*60000&&start>now+15*60000;
  }
  function candidates(props,at){
    return (Array.isArray(props)?props:[]).filter(p=>eligible(p,at))
      .sort((a,b)=>b.probability-a.probability||
        (Number(b.observations)||0)-(Number(a.observations)||0)||
        key(a).localeCompare(key(b)));
  }
  function validPartial(picks,size){
    const people=new Set(),games=new Map(),cap=size<=4?1:2;
    for(const p of picks){
      const who=playerKey(p),game=norm(p.matchup);
      if(!who||people.has(who)||(games.get(game)||0)>=cap)return false;
      people.add(who);games.set(game,(games.get(game)||0)+1);
    }
    return true;
  }
  function validComplete(picks,size){
    return picks.length===size&&validPartial(picks,size)&&
      new Set(picks.map(p=>norm(p.matchup))).size>=(size<=4?size:3);
  }
  function build(props,{size=2,at=Date.now(),lockedKeys=[],excludedPlayers=[]}={}){
    if(!Number.isInteger(size)||size<2||size>6)
      return {picks:[],reason:"Select between 2 and 6 picks."};
    const all=candidates(props,at),excluded=new Set(excludedPlayers),locks=new Set(lockedKeys);
    if(locks.size>size)return {picks:[],reason:"More locked picks than lineup slots."};
    const index=new Map(all.map(p=>[key(p),p]));
    const fixed=[];
    for(const id of locks){
      const p=index.get(id);
      if(!p||excluded.has(playerKey(p)))return {picks:[],reason:"A locked pick is no longer eligible. Unlock it to continue."};
      fixed.push(p);
    }
    if(!validPartial(fixed,size))
      return {picks:[],reason:"Locked picks repeat a player or exceed the same-game limit."};
    const top=[],seen=new Set(fixed.map(playerKey));
    for(const p of all){
      const who=playerKey(p);
      if(seen.has(who)||excluded.has(who))continue;
      seen.add(who);top.push(p);
      if(top.length===30)break;
    }
    const selected=fixed.slice();
    let nodes=0;
    function search(start){
      if(selected.length===size)return validComplete(selected,size);
      if(top.length-start<size-selected.length||++nodes>25000)return false;
      for(let i=start;i<top.length;i++){
        selected.push(top[i]);
        if(validPartial(selected,size)&&search(i+1))return true;
        selected.pop();
      }
      return false;
    }
    if(!search(0))return {picks:[],reason:all.length?
      "No eligible combination meets the player, game and locked-pick restrictions.":
      "No fresh eligible Standard research props available."};
    const games=new Set(selected.map(p=>norm(p.matchup)));
    return {picks:selected.slice(),reason:null,
      correlated:games.size<size,distinctGames:games.size};
  }
  function swapOptions(props,picks,index,{at=Date.now(),excludedPlayers=[]}={}){
    const size=picks.length;
    if(!Number.isInteger(index)||index<0||index>=size||size<2||size>6||
        !picks.every(p=>eligible(p,at)))return [];
    const fixed=picks.filter((_,i)=>i!==index),excluded=new Set(excludedPlayers);
    if(!validPartial(fixed,size))return [];
    const already=new Set(fixed.map(playerKey));
    const seen=new Set();
    return candidates(props,at).filter(p=>{
      const who=playerKey(p);
      if(excluded.has(who)||already.has(who)||seen.has(who))return false;
      seen.add(who);
      return validComplete([...fixed,p],size);
    }).slice(0,30);
  }
  return {key,playerKey,eligible,candidates,validComplete,build,swapOptions};
});
