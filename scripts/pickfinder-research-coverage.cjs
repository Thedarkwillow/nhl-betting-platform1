'use strict';
// Only observed sporting research, no inferred quotes, no account mutation.
const VERSION='sport-filter-v2';
const common={
 game_logs:['game log','gamelog','game logs','player stats'],
 historical_lines:['historical line','prop history'],
 historical_results:['historical result','prop history'],
 line_movement:['line movement','movement line'],
 hit_windows:['l5','l10','l15','h2h','last 5','last 10','last 15','season'],
 sportsbook_odds:['sportsbook','draftkings','fanduel','betmgm','pinnacle','caesars','bet365'],
 implied_probability:['implied','implied probability'],
 home_away:['home/away','home away','home vs away'],
 injuries_depth:['injuries','injury','depth chart','depth charts'],
 starting_lineups:['starting lineup','starting lineups','lineups'],
 teammate_splits:['with/without','with without','teammates','on/off','on off']
};
const sports={
 nba:{shooting_charts:['shooting chart','shot chart','shooting','shot zones'],rotations:['rotation','rotations','minutes distribution'],injury_dependent:['with/without','with without','on/off','on off','injury splits'],period_stats:['quarter','half','1q','2q','3q','4q','1st half','2nd half'],positional_defense:['defense vs position','defense versus position','dvp','positional defense']},
 nhl:{shot_attempts:['shot attempts','individual corsi','corsi','fenwick','unblocked attempts'],goalie_matchups:['goalie matchup','goalie matchups','starting goalie','goaltender','goalie stats'],positional_defense:['defense vs position','defense versus position','dvp','positional defense'],line_combinations:['line combinations','line combo','line combos','linemates','power play units']},
 nfl:{target_share:['target share','target shares','target rate'],rushing_workload:['rush attempts','rushing attempts','carries','rush share','rushing workload'],defensive_matchups:['defense vs position','defense versus position','defensive matchup','defense rankings','matchup'],kicking:['kicking','field goals','field goal','extra points','kicker','fg attempts'],period_stats:['quarter','half','1q','2q','3q','4q']},
 cs2:{map_pools:['map pool','map pools','map stats','maps'],lan_online:['lan','online'],headshots:['headshot','headshots','headshot percentage','hs%'],team_kills:['team kills','team kill','kills per round']},
 dota2:{map_pools:['map pool','maps','game mode'],heroes:['hero','heroes'],team_kills:['team kills','team kill','kills per game']},
 valorant:{map_pools:['map pool','map pools','maps'],lan_online:['lan','online'],headshots:['headshot','headshots','headshot percentage','hs%'],agents:['agent','agents'],team_kills:['team kills','team kill','kills per round']},
 lol:{champions:['champion','champions'],team_kills:['team kills','team kill','kills per game'],game_modes:['game mode','modes']},
 cod:{map_pools:['map pool','maps'],game_modes:['game mode','modes','hardpoint','search and destroy','control'],lan_online:['lan','online'],team_kills:['team kills','team kill','kills per map']}
};
const tabs=['Game Logs','Gamelog','Game Log','Historical Stats','Shooting Chart','Shot Chart','Shot Zones','Rotations','Rotation','Minutes','On/Off','With/Without','Quarter','Half','Defense vs Position','Defense vs. Position','Shot Attempts','Goalie Matchup','Goalies','Goaltending','Line Combinations','Power Play','Target Share','Rushing','Receiving','Kicking','Kickers','Map Pool','Map Stats','LAN','Online','Headshots','Team Kills','Team Stats','Game Modes','Match History','Sportsbooks','Odds','Advanced Stats'];
const filterLabels=['sport','league','date','game','match','market','prop','stat','stat type','apps','app','book','books','sportsbook','sportsbooks','modifier','modifiers','tier','period','quarter','half','season','split','splits','home/away','home away','opponent','position','team','teammates','with/without','with without','map','maps','map pool','map range','mode','game mode','agent','champion','hero','lan/online','lan online','last games','games','window','timeframe','sort','sort by'];
const normalize=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
function coverage(sport,fields){
 const wanted={...common,...sports[sport]},out={};
 for(const [key,terms] of Object.entries(wanted)){
  const count=fields.filter(f=>f?.value!=null&&String(f.value).trim()&&[f.tab,f.metric,f.scope,f.window].some(v=>{const s=normalize(v);return terms.some(t=>(' '+s+' ').includes(' '+t+' ')||s.includes(t)&&t.length>4);})).length;
  out[key]={state:count?'observed_label_and_value':'not_observed',observations:count};
 }
 return out;
}
function nativeInventory(){
 const visible=e=>e.getClientRects().length>0;
 return [...document.querySelectorAll('main select')].map((e,index)=>({
  index,label:(e.getAttribute('aria-label')||[...e.labels||[]].map(l=>l.innerText).join(' ')).trim(),
  visible:visible(e),disabled:e.disabled,multiple:e.multiple,value:e.value,
  options:[...e.options].filter(o=>!o.disabled&&!o.parentElement?.disabled&&o.value!=='').map(o=>({value:o.value,label:o.text.trim()}))
 })).filter(x=>x.visible);
}
function eligible(inventory){
 const labels=new Map();for(const x of inventory){const k=normalize(x.label);labels.set(k,(labels.get(k)||0)+1);}
 return inventory.filter(x=>!x.disabled&&!x.multiple&&filterLabels.includes(normalize(x.label))&&labels.get(normalize(x.label))===1&&x.options.length>0&&new Set(x.options.map(o=>o.value)).size===x.options.length);
}
// Walk native labeled single-select combinations. Dynamic/custom controls are inventoried, not guessed.
async function traverseNativeFilters(page,{shouldContinue=()=>true,onState=async()=>{},read=()=>page.evaluate(nativeInventory),set=async(x,value)=>page.locator('main select').nth(x.index).selectOption({value}),maxMs=45000}={}){
 const started=Date.now(),initial=await read(),accepted=eligible(initial),labels=accepted.map(x=>normalize(x.label)),states=new Set(),issues=new Set();
 const current=async()=>eligible(await read());
 const alive=()=>shouldContinue()&&Date.now()-started<maxMs;
 const choose=async(label,value)=>{const x=(await current()).find(y=>normalize(y.label)===label);if(!x||!x.options.some(o=>o.value===value))throw Error('unavailable filter');await set(x,value);const after=(await current()).find(y=>normalize(y.label)===label);if(!after||after.value!==value)throw Error('filter selection unverified');};
 async function walk(i,selection){
  if(!alive()){issues.add('deadline');return;}
  if(i===labels.length){
   const controls=await current();
   if(selection.some(s=>!controls.some(x=>normalize(x.label)===s.label&&x.value===s.value))){issues.add('selection_changed');return;}
   if(controls.some(x=>!labels.includes(normalize(x.label))))issues.add('dynamic_control');
   const key=JSON.stringify(selection);if(states.has(key))return;try{await onState(selection);states.add(key);}catch(e){if(e?.deepStage)throw e;issues.add('state_capture_failed');}return;
  }
  const label=labels[i],x=(await current()).find(y=>normalize(y.label)===label);
  if(!x){issues.add('dynamic_control');return;}
  for(const option of x.options){if(!alive()){issues.add('deadline');break;}try{await choose(label,option.value);}catch{issues.add('selection_failed');continue;}
   await walk(i+1,[...selection,{label,value:option.value,display:option.label}]);
  }
  if(x.options.some(o=>o.value===x.value)){try{await choose(label,x.value);}catch{issues.add('restore_failed');}}else issues.add('restore_unverified');
 }
 if(labels.length)await walk(0,[]);
 return {version:VERSION,nativeControls:initial.length,eligibleControls:labels.length,statesObserved:states.size,issues:[...issues],nativeCombinationsExhausted:labels.length>0&&issues.size===0,allFilterCombinationsVerified:false};
}
module.exports={VERSION,common,sports,tabs,coverage,nativeInventory,eligible,traverseNativeFilters};
