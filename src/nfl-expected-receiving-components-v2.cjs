"use strict";
const n=Number.isFinite,sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),avg=a=>a.reduce((s,x)=>s+x,0)/a.length,key=(...x)=>JSON.stringify(x);
function build(events,weekly,schedule){
 const games=new Map(schedule.filter(g=>g.game_type==="REG"&&n(g.home_score)&&n(g.away_score)).map(g=>[g.game_id,g])),groups=new Map(),bad=new Set(),ids=new Set();
 for(const e of events){const id=key(e.game_id,e.play_id);if(ids.has(id))bad.add(e.game_id);ids.add(id);const k=key(e.game_id,e.receiver_player_id),a=groups.get(k)||[];a.push(e);groups.set(k,a);}
 const rows=[];for(const a of groups.values()){const e=a[0],g=games.get(e.game_id);if(!g||bad.has(e.game_id)||a.some(x=>x.posteam!==e.posteam||x.defteam!==e.defteam||x.season!==e.season||x.week!==e.week||x.pass_attempt!==1||x.sack!==0||x.two_point_attempt!==0||![0,1].includes(x.complete_pass)))continue;
 const m=weekly.filter(x=>String(x.player_id)===e.receiver_player_id&&Number(x.season)===Number(e.season)&&Number(x.week)===Number(e.week)&&(x.recent_team||x.team)===e.posteam&&x.opponent_team===e.defteam);
 if(m.length!==1||m[0].targets!==a.length||m[0].receptions!==sum(a,"complete_pass"))continue;
 const c=a.filter(x=>x.complete_pass===1);if(c.some(x=>!n(x.receiving_yards))||sum(c,"receiving_yards")!==m[0].receiving_yards)continue;
 const good=a.filter(x=>n(x.cp)&&x.cp>=0&&x.cp<=1&&n(x.air_yards)&&n(x.xyac_mean_yardage));
 if(good.length<.8*a.length)continue;
 rows.push({gameId:e.game_id,id:e.receiver_player_id,team:e.posteam,opponent:e.defteam,y:Number(e.season),w:Number(e.week),targets:a.length,cpTargets:good.length,expectedCatches:sum(good,"cp"),expectedYards:good.reduce((s,x)=>s+x.cp*(x.air_yards+x.xyac_mean_yardage),0),actual:m[0].receiving_yards});
 }
 return rows.sort((a,b)=>a.y-b.y||a.w-b.w);
}
function features(rows,id,team,y,w,expectedTargets){
 const a=rows.filter(x=>x.id===id&&x.team===team&&(x.y<y||x.y===y&&x.w<w)).slice(-15);
 if(a.length<5||!n(expectedTargets)||expectedTargets<0||sum(a,"cpTargets")<20)return null;
 return {expectedCatchRate:sum(a,"expectedCatches")/sum(a,"cpTargets"),expectedYardsPerTarget:sum(a,"expectedYards")/sum(a,"cpTargets"),projection:expectedTargets*sum(a,"expectedYards")/sum(a,"cpTargets"),games:a.length,routeParticipationVerified:false};
}
module.exports={build,features};