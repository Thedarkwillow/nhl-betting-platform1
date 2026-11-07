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

  // Customer-side action: a fresh exact offer can anchor a newly researched
  // lineup, but never becomes an original platform-confirmed selection.
  function addSelection(props,desired,{size=2,at=Date.now(),lockedKeys=[],excludedPlayers=[]}={}){
    const available=candidates(props,at);
    const byKey=new Map(available.map(p=>[key(p),p]));
    const chosen=byKey.get(key(desired));
    if(!chosen)return {picks:[],reason:"That offer is no longer fresh or eligible."};
    if(excludedPlayers.includes(playerKey(chosen)))
      return {picks:[],reason:"Unexclude this player before adding the offer."};
    if(lockedKeys.some(id=>{
      const locked=byKey.get(id);
      return locked&&playerKey(locked)===playerKey(chosen)&&id!==key(chosen);
    }))return {picks:[],reason:"Another offer for this player is locked. Unlock it first."};
    const locks=[...new Set([...lockedKeys,key(chosen)])];
    const result=build(available,{size,at,lockedKeys:locks,excludedPlayers});
    return {...result,lockedKeys:result.picks.length?locks:[]};
  }
  // Save references, not proprietary source rows or potentially misleading
  // model estimates. Expired/replaced offers cannot be revived by a draft.
  function createDraft({props,picks,size,lockedKeys=[],excludedPlayers=[],
    boardAt,researchAt,at=Date.now(),boardFresh=false}={}){
    if(!boardFresh||!Number.isInteger(size)||size<2||size>6||
       !Array.isArray(picks)||!validComplete(picks,size))return null;
    const available=new Map(candidates(props,at).map(p=>[key(p),p]));
    if(!picks.every(p=>available.has(key(p))))return null;
    const keys=picks.map(key),locks=[...new Set(lockedKeys)];
    if(locks.some(id=>!keys.includes(id))||locks.length>size)return null;
    const excluded=[...new Set(excludedPlayers)];
    if(excluded.length>30||excluded.some(s=>typeof s!=="string"||
       s.length>100||picks.some(p=>playerKey(p)===s)))return null;
    const board=Date.parse(boardAt),research=Date.parse(researchAt);
    if(!Number.isFinite(board)||!Number.isFinite(research)||
       board>at||research>at||at-board>30*60000||at-research>30*60000)
      return null;
    return {version:1,savedAt:new Date(at).toISOString(),
      boardAt,researchAt,size,pickKeys:keys,lockedKeys:locks,
      excludedPlayers:excluded};
  }
  function restoreDraft(saved,{props,boardAt,researchAt,at=Date.now(),boardFresh=false}={}){
    const fail=reason=>({valid:false,reason,picks:[]});
    if(!boardFresh)return fail("No fresh complete NHL board. Saved research cannot be restored.");
    let d;
    try{d=typeof saved==="string"?JSON.parse(saved):saved;}catch{
      return fail("Saved draft is unreadable.");
    }
    if(!d||d.version!==1||d.boardAt!==boardAt||d.researchAt!==researchAt)
      return fail("Saved draft belongs to an older or different research board.");
    if(!Number.isInteger(d.size)||d.size<2||d.size>6||
       !Array.isArray(d.pickKeys)||d.pickKeys.length!==d.size||
       !Array.isArray(d.lockedKeys)||d.lockedKeys.length>d.size||
       !Array.isArray(d.excludedPlayers)||d.excludedPlayers.length>30||
       [...d.pickKeys,...d.lockedKeys,...d.excludedPlayers]
         .some(x=>typeof x!=="string"||x.length>1024))
      return fail("Saved draft has an invalid or unsupported format.");
    const savedAt=Date.parse(d.savedAt);
    if(!Number.isFinite(savedAt)||savedAt>at||at-savedAt>30*60000)
      return fail("Saved draft expired. Build a new lineup from fresh offers.");
    const available=new Map(candidates(props,at).map(p=>[key(p),p]));
    const picks=d.pickKeys.map(id=>available.get(id));
    if(picks.some(p=>!p)||new Set(d.pickKeys).size!==d.size||
       !validComplete(picks,d.size))
      return fail("One or more saved offers moved, disappeared, or became ineligible.");
    if(d.lockedKeys.some(id=>!d.pickKeys.includes(id))||
       new Set(d.lockedKeys).size!==d.lockedKeys.length||
       d.excludedPlayers.some(s=>picks.some(p=>playerKey(p)===s)))
      return fail("Saved draft has conflicting lock or exclusion settings.");
    return {valid:true,reason:null,size:d.size,picks,
      lockedKeys:d.lockedKeys.slice(),excludedPlayers:d.excludedPlayers.slice()};
  }
  function structuralRisk(picks,at=Date.now()){
    const list=Array.isArray(picks)?picks:[],now=Number(at);
    if(!Number.isFinite(now)||!list.length)return {status:"unavailable",
      pairs:[],sharedGamePairs:0,riskLevel:"unverified",
      jointProbability:null,expectedValue:null};
    const flagged=[],categories=new Set(),seenGames=new Set();
    for(let i=0;i<list.length;i++){
      const game=norm(list[i]?.matchup);
      if(game)seenGames.add(game);
      for(let j=i+1;j<list.length;j++){
        const a=list[i],b=list[j];
        if(!game||game!==norm(b?.matchup))continue;
        const aStat=norm(a.market),bStat=norm(b.market);
        const goalie=/(goalie|saves)/i.test(aStat)||/(goalie|saves)/i.test(bStat);
        const shots=/(shots|goals|points)/i.test(aStat)||/(shots|goals|points)/i.test(bStat);
        const label=goalie&&shots?"goalie and shooter interaction":
          norm(a.team)===norm(b.team)?"shared team and game":"opposing players in one game";
        categories.add(label);
        flagged.push({first:i,second:j,label});
      }
    }
    const sourceAges=list.map(p=>(now-Date.parse(p.capturedAt))/60000);
    const validAge=sourceAges.every(x=>Number.isFinite(x)&&x>=0&&x<=30);
    return {status:validAge?"structural_review_only":"source_expired_or_invalid",
      picks:list.length,distinctGames:seenGames.size,
      sharedGamePairs:flagged.length,
      riskLevel:flagged.length?"elevated_unmeasured":"not_measured_across_games",
      categories:[...categories],pairs:flagged,
      quoteFreshForResearch:validAge,
      jointProbability:null,expectedValue:null,
      correlationCoefficientVerified:false,
      originalPlatformPayoutVerified:false};
  }
  return {key,playerKey,eligible,candidates,validComplete,build,swapOptions,
    addSelection,createDraft,restoreDraft,structuralRisk};
});
