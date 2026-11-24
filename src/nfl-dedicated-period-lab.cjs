"use strict";
// Pregame historical experiment: independently extracted regulation-period
// counts, full-game reconciliation, and strict earlier-week role filters.
// No live picks, period quote availability, or settlement assertions.
const FIELDS={
 passing_yards:{stat:"passing_yards",usage:"attempts",min:10,lines:[39.5,59.5,79.5]},
 passing_attempts:{stat:"attempts",usage:"attempts",min:10,lines:[5.5,7.5,9.5]},
 passing_completions:{stat:"completions",usage:"attempts",min:10,lines:[3.5,5.5,7.5]},
 passing_touchdowns:{stat:"passing_tds",usage:"attempts",min:10,lines:[.5,1.5]},
 interceptions_thrown:{stat:"interceptions",usage:"attempts",min:10,lines:[.5]},
 rushing_yards:{stat:"rushing_yards",usage:"carries",min:3,lines:[9.5,14.5,19.5]},
 rushing_attempts:{stat:"carries",usage:"carries",min:3,lines:[1.5,3.5,5.5]},
 rushing_touchdowns:{stat:"rushing_tds",usage:"carries",min:3,lines:[.5]},
 receiving_yards:{stat:"receiving_yards",usage:"targets",min:2,lines:[9.5,14.5,19.5]},
 receptions:{stat:"receptions",usage:"targets",min:2,lines:[.5,1.5,2.5]},
 receiving_targets:{stat:"targets",usage:"targets",min:2,lines:[.5,1.5,2.5]},
 receiving_touchdowns:{stat:"receiving_tds",usage:"targets",min:2,lines:[.5]},
 fg_made:{stat:"fg_made",usage:"kicker_appearance",min:1,lines:[.5]},
 fg_attempts:{stat:"fg_attempts",usage:"kicker_appearance",min:1,lines:[.5]},
 pat_made:{stat:"pat_made",usage:"kicker_appearance",min:1,lines:[.5]},
 kicking_points:{stat:"kicking_points",usage:"kicker_appearance",min:1,lines:[.5,2.5,3.5]}
};
const PERIODS={quarter_1:[1],quarter_2:[2],quarter_3:[3],quarter_4:[4],half_1:[1,2],half_2:[3,4]};
const MILESTONES={quarters_5_plus_rush:["rushing_yards",5,["quarter_1","quarter_2","quarter_3","quarter_4"]],quarters_1_plus_reception:["receptions",1,["quarter_1","quarter_2","quarter_3","quarter_4"]],quarters_25_plus_pass_yards:["passing_yards",25,["quarter_1","quarter_2","quarter_3","quarter_4"]],quarters_5_plus_receiving_yards:["receiving_yards",5,["quarter_1","quarter_2","quarter_3","quarter_4"]],quarters_10_plus_receiving_yards:["receiving_yards",10,["quarter_1","quarter_2","quarter_3","quarter_4"]],halves_25_plus_rush:["rushing_yards",25,["half_1","half_2"]],halves_50_plus_rush:["rushing_yards",50,["half_1","half_2"]],halves_100_plus_passing:["passing_yards",100,["half_1","half_2"]],halves_25_plus_receiving:["receiving_yards",25,["half_1","half_2"]]};
const num=x=>typeof x==="number"&&Number.isFinite(x),id=x=>typeof x==="string"&&x.length>0,k=(...x)=>JSON.stringify(x),avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const signed=new Set(["passing_yards","rushing_yards","receiving_yards"]);
const stats=[...new Set(Object.values(FIELDS).map(s=>s.stat))];
function aggregate(events){
 const games=new Map();
 for(const e of events){
  if(!id(e.game_id)||!num(e.play_id)||!Number.isInteger(e.qtr)||e.qtr<1||e.qtr>5||e.season_type!=="REG")continue;
  const g=games.get(e.game_id)||{seen:new Set(),quarters:new Set(),players:new Map(),bad:false};games.set(e.game_id,g);
  if(g.seen.has(e.play_id)){g.bad=true;continue;}g.seen.add(e.play_id);g.quarters.add(e.qtr);
  if(e.play_type==="no_play"||!id(e.posteam))continue;
  const put=(player,stat,v)=>{
   if(!id(player))return;
   const key=k(e.posteam,player),p=g.players.get(key)||{counts:new Map(),invalid:new Set()};g.players.set(key,p);
   if(!num(v)||!Number.isInteger(v)){p.invalid.add(stat);return;}
   const q=p.counts.get(stat)||[0,0,0,0,0];q[e.qtr-1]+=v;p.counts.set(stat,q);
  };
  if(e.pass_attempt===1&&e.sack!==1){
   put(e.passer_player_id,"attempts",1);
   put(e.passer_player_id,"completions",e.complete_pass);
   put(e.passer_player_id,"interceptions",e.interception);
   put(e.passer_player_id,"passing_tds",e.pass_touchdown);
   put(e.passer_player_id,"passing_yards",e.complete_pass===1?e.passing_yards:0);
   if(id(e.receiver_player_id)){
    put(e.receiver_player_id,"targets",1);put(e.receiver_player_id,"receptions",e.complete_pass);
    put(e.receiver_player_id,"receiving_tds",e.pass_touchdown);
    put(e.receiver_player_id,"receiving_yards",e.complete_pass===1?e.receiving_yards:0);
   }
  }
  if(e.rush_attempt===1){
   put(e.rusher_player_id,"carries",1);put(e.rusher_player_id,"rushing_yards",e.rushing_yards);put(e.rusher_player_id,"rushing_tds",e.rush_touchdown);
  }
  if(e.field_goal_attempt===1){
   const v=["made","missed","blocked"].includes(e.field_goal_result)?Number(e.field_goal_result==="made"):null;
   put(e.kicker_player_id,"fg_attempts",1);put(e.kicker_player_id,"fg_made",v);put(e.kicker_player_id,"kicking_points",v===null?null:3*v);
  }
  if(e.extra_point_attempt===1){
   const v=["good","failed","blocked","missed"].includes(e.extra_point_result)?Number(e.extra_point_result==="good"):null;
   put(e.kicker_player_id,"pat_made",v);put(e.kicker_player_id,"kicking_points",v);
  }
 }
 return games;
}
function reconcile({events,weekly,schedule,kickers=[]}){
 const gameByTeam=new Map();
 for(const g of schedule){if(g.game_type!=="REG"||!num(g.home_score)||!num(g.away_score))continue;for(const t of [g.home_team,g.away_team]){const z=k(Number(g.season),Number(g.week),t);gameByTeam.set(z,gameByTeam.has(z)?null:g.game_id);}}
 const plays=aggregate(events),rows=[],seen=new Set(),dup=new Set(),reject={};const skip=x=>reject[x]=(reject[x]||0)+1;
 const all=[...weekly.filter(r=>r.position!=="K"&&(!r.season_type||r.season_type==="REG"||r.season_type==="REGULAR_SEASON")).map(r=>({season:Number(r.season),week:Number(r.week),team:r.recent_team||r.team,player:r.player_id,values:r,position:r.position,kicker:false})),...kickers.map(r=>({season:r.year,week:r.week,team:r.team,player:r.playerId,values:{...r.measures,kicker_appearance:1},position:"K",kicker:true,expectedGame:r.gameId}))];
 for(const r of all){const q=k(r.season,r.week,r.player);if(seen.has(q))dup.add(q);seen.add(q);}
 for(const r of all){
  if(!Number.isInteger(r.season)||!Number.isInteger(r.week)||r.week<1||r.week>18||!id(r.player)||dup.has(k(r.season,r.week,r.player))){skip("duplicate_or_invalid_player_week");continue;}
  const gid=gameByTeam.get(k(r.season,r.week,r.team)),g=plays.get(gid);
  if(!g||g.bad||![1,2,3,4].every(q=>g.quarters.has(q))||r.expectedGame&&r.expectedGame!==gid){skip("unverified_game_or_period_coverage");continue;}
  const p=g.players.get(k(r.team,r.player)),periods={},full={};
  for(const [m,s] of Object.entries(FIELDS)){
   if(r.kicker!==(s.usage==="kicker_appearance"))continue;
   const expected=r.values[s.stat],usage=r.values[s.usage];
   if(!num(expected)||!Number.isInteger(expected)||!num(usage)||usage<0||p?.invalid.has(s.stat))continue;
   // Zero is only permitted after exact game totals reconcile, with a
   // verified game appearance (kicker via reconciled snaps, offense via events).
   if(!r.kicker&&!["attempts","carries","targets"].some(x=>num(r.values[x])&&r.values[x]>0))continue;
   const q=p?.counts.get(s.stat)||[0,0,0,0,0];
   if(q.reduce((a,b)=>a+b,0)!==expected){skip(m+"|full_game_mismatch");continue;}
   if(!r.kicker){
    const a=p?.counts.get(s.usage)||[0,0,0,0,0];
    if(p?.invalid.has(s.usage)||a.reduce((a,b)=>a+b,0)!==usage){skip(m+"|usage_mismatch");continue;}
   }
   full[m]={value:expected,usage};periods[m]=Object.fromEntries(Object.entries(PERIODS).map(([period,qs])=>[period,qs.reduce((sum,i)=>sum+q[i-1],0)]));
  }
  if(Object.keys(periods).length)rows.push({...r,gameId:gid,periods,full});
 }
 return {rows,reject};
}
function mass(values,line,mu,allowSigned=false){
 const center=avg(values),hit=values.filter(v=>{const x=Math.round(v-center+mu);return (allowSigned?x:Math.max(0,x))>line;}).length;
 return (hit+1)/(values.length+2);
}
function study(input){
 const {rows,reject}=reconcile(input),weeks=new Map(),prior=new Map(),groups={};
 for(const r of rows){const z=r.season*100+r.week,a=weeks.get(z)||[];a.push(r);weeks.set(z,a);}
 const add=(r,m,period,actual,history,lines,base,dedicated)=>{
  const key=k(r.season,m,period),a=groups[key]??={n:0,t:0,games:new Set(),weeks:new Set(),b:0,c:0,bl:0,cl:0};
  a.n++;a.games.add(r.gameId);a.weeks.add(r.week);
  for(const line of lines){const y=Number(actual>line),p=base(line),q=dedicated(line);a.t++;a.b+=(p-y)**2;a.c+=(q-y)**2;a.bl-=Math.log(y?p:1-p);a.cl-=Math.log(y?q:1-q);}
 };
 for(const [wk,batch] of [...weeks].sort(([a],[b])=>a-b)){
  for(const r of batch){
   if(r.season<2025)continue;const old=(prior.get(k(r.player,r.team))||[]);
   for(const [m,v] of Object.entries(r.periods)){
    const past=old.filter(x=>x.periods[m]).slice(-20),s=FIELDS[m];
    if(past.length<8||avg(past.slice(-5).map(x=>x.full[m].usage))<s.min)continue;
    const full=past.map(x=>x.full[m].value);
    for(const [period,n] of Object.entries(v)){
     const vals=past.map(x=>x.periods[m][period]),f=PERIODS[period].length/4,lines=s.lines.map(l=>f===.5?2*Math.floor(l)+.5:l);
     const baseMu=avg(full.slice(-10))*f,mu=.65*avg(vals.slice(-5))+.35*avg(vals);
     add(r,m,period,n,vals,lines,l=>mass(full.map(x=>x*f),l,baseMu,signed.has(m)),l=>mass(vals,l,mu,signed.has(m)));
    }
    for(const [name,[target,threshold,ps]] of Object.entries(MILESTONES)){
     if(target!==m)continue;
     const measure=x=>ps.reduce((n,p)=>n+Number(x.periods[m][p]>=threshold),0),actual=measure(r),values=past.map(measure);
     const ref=avg(past.map(x=>x.full[m].value))/ps.length;
     const fixed=ps.length*Number(ref>=threshold);
     const mu=.65*avg(values.slice(-5))+.35*avg(values);
     add(r,name,"regulation_milestone",actual,values,ps.length===4?[.5,1.5,2.5,3.5]:[.5,1.5],l=>mass(values,l,fixed),l=>mass(values,l,mu));
    }
   }
  }
  for(const r of batch){const z=k(r.player,r.team),a=prior.get(z)||[];a.push(r);prior.set(z,a.slice(-60));}
 }
 const results=Object.fromEntries(Object.entries(groups).map(([key,a])=>{const [season,market,period]=JSON.parse(key);return [season+"|"+market+"|"+period,{appearances:a.n,thresholds:a.t,distinctGames:a.games.size,distinctWeeks:a.weeks.size,baselineBrier:a.b/a.t,dedicatedBrier:a.c/a.t,baselineLogLoss:a.bl/a.t,dedicatedLogLoss:a.cl/a.t}];}));
 return {kind:"nfl_dedicated_period_synthetic_lab_v1",markets:Object.keys(FIELDS),periods:Object.keys(PERIODS),milestones:Object.keys(MILESTONES),reconciledAppearanceRows:rows.length,exclusions:reject,bySeasonMarketPeriod:results,regulationOnly:true,zeroRequiresExactFullGameReconciliation:true,conditionalOnObservedAppearance:true,periodParticipationIndependentlyVerified:false,actualPlatformOfferLines:false,modelPromoted:false,calibrated:false};
}
module.exports={FIELDS,PERIODS,MILESTONES,aggregate,reconcile,study};
