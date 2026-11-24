"use strict";
const {projectPlayer}=require("./projections.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {identifyGame}=require("./nhl-game-identity.cjs");
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const team=s=>String(s||"").toUpperCase().replace(/^SJ$/,"SJS").replace(/^TB$/,"TBL").replace(/^NJ$/,"NJD").replace(/^LA$/,"LAK");
const MARKET={"shots on goal":"shotsOnGoal",sog:"shotsOnGoal",goals:"goals",assists:"assists",points:"points","blocked shots":"blockedShots",saves:"saves","goalie saves":"saves"};
function gradeHistoricalBoard(board,history,games,asOf){
 const at=Date.parse(asOf),excluded={},decisions=[],pending=[];
 if(!Number.isFinite(at)||!Array.isArray(board)||!history?.players||!Array.isArray(games))throw Error("Invalid historical replay inputs");
 const skip=k=>(excluded[k]=(excluded[k]||0)+1),index=new Map();
 const add=(key,p)=>{const a=index.get(key)||[];a.push(p);index.set(key,a);};
 // The archived board time is the cut-off, never today's rebuilt projections.
 const priorDate=asOf.slice(0,10);
 for(const p of Object.values(history.players)){
  if(!p?.playerId||!Array.isArray(p.games))continue;
  const prior=p.games.filter(g=>g.gameDate<priorDate).sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
  if(!prior.length)continue;
  const last=prior[prior.length-1],player={...p,team:last.team,games:prior};
  const name=norm(p.name),parts=name.split(" "),t=team(last.team);
  if(!t||parts.length<2)continue;
  add(t+"|"+name,player);
  add(t+"|"+parts[0][0]+"|"+parts.slice(1).join(" "),player);
 }
 const seen=new Set();
 for(const offer of board){
  if(offer?.league!=="NHL"||offer.source!=="prizepicks"||offer.is_demo!==false||offer.status!=="active"||
   !offer.id||!Number.isFinite(offer.line)||offer.line<0||!offer.player?.name||!offer.player?.team||!offer.market?.stat){skip("invalid_offer");continue;}
  if(norm(offer.market.period||"full game")!=="full game"){skip("other_period");continue;}
  const field=MARKET[norm(offer.market.stat)];
  if(!field){skip("unsupported_market");continue;}
  const ts=Date.parse(offer.observed_at),start=Date.parse(offer.event?.starts_at);
  if(!Number.isFinite(ts)||!Number.isFinite(start)||ts>at||at-ts>30*60000||start<=at||start-at>24*3600000){skip("timestamp_or_game_window");continue;}
  if(!offer.event?.opponent){skip("missing_opponent");continue;}
  const game=identifyGame({team:offer.player.team,matchup:"vs "+offer.event.opponent,capturedAt:asOf},games);
  if(!game||Math.abs(Date.parse(game.gameStartAt)-start)>300000){skip("unverified_game");continue;}
  const name=norm(offer.player.name),parts=name.split(" "),t=team(offer.player.team);
  const exact=index.get(t+"|"+name)||[];
  const found=exact.length?exact:(parts.length>=2?index.get(t+"|"+parts[0][0]+"|"+parts.slice(1).join(" "))||[]:[]);
  const distinct=[...new Map(found.map(p=>[p.playerId,p])).values()];
  if(distinct.length!==1){skip(distinct.length?"ambiguous_player":"missing_player");continue;}
  const player=distinct[0];
  if(player.games.some(g=>g.gameId===game.gameId)){skip("lookahead_duplicate_game");continue;}
  const final=history.players[String(player.playerId)]?.games?.find(g=>g.gameId===game.gameId);
  if(!final||!Number.isFinite(final[field])){pending.push({projectionId:offer.id,playerId:player.playerId,gameId:game.gameId});skip("unavailable_final_stat");continue;}
  const model=projectPlayer(player).projections?.[field];
  if(!model?.ready||!Number.isFinite(model.estimate)){skip("insufficient_prior_games");continue;}
  const probs=estimateCountProbabilities(model.estimate,offer.line);
  if(!probs){skip("invalid_probability");continue;}
  let selection=null;
  for(const s of offer.selections||[]){
   if(s?.available!==true)continue;
   const side=s.side==="more"?"Higher":s.side==="less"?"Lower":null,tier=norm(s.tier);
   if(!side||!["standard","goblin","demon"].includes(tier)||tier!=="standard"&&side!=="Higher")continue;
   const probability=probs[side==="Higher"?"higher":"lower"];
   if(!Number.isFinite(probability)||probability<=0||probability>=1)continue;
   if(!selection||probability>selection.probability)selection={side,tier,probability};
  }
  if(!selection){skip("no_eligible_selection");continue;}
  const k=[player.playerId,game.gameId,field,selection.tier].join("|");
  if(seen.has(k)){skip("duplicate_market");continue;}
  seen.add(k);
  const actual=final[field],outcome=actual>offer.line?"Higher":actual<offer.line?"Lower":"Push";
  decisions.push({historicalAsOf:asOf,sourceObservedAt:offer.observed_at,sourceProjectionId:offer.id,
   gameId:game.gameId,gameStartAt:game.gameStartAt,playerId:player.playerId,player:player.name,team:player.team,
   market:field,tier:selection.tier,side:selection.side,line:offer.line,projection:model.estimate,
   observations:model.observations,estimatedProbability:selection.probability,actual,outcome,
   correct:outcome==="Push"?null:outcome===selection.side,
   methodology:"retrospective_replayed_board_not_pregame_publication"});
 }
 return {asOf,totalOffers:board.length,decisions,pending,excluded};
}
function summarizeBacktest(replays){
 const all=replays.flatMap(r=>r.decisions||[]),valid=all.filter(r=>r.correct!==null);
 const mean=(items,f)=>items.length?Number((items.reduce((s,x)=>s+f(x),0)/items.length).toFixed(5)):null;
 const byTier={},byMarket={};
 for(const [field,obj] of [["tier",byTier],["market",byMarket]]){
  for(const name of new Set(all.map(x=>x[field]))){
   const items=valid.filter(x=>x[field]===name);
   obj[name]={decisions:items.length,hits:items.filter(x=>x.correct).length,hitRate:mean(items,x=>x.correct?1:0),pushes:all.filter(x=>x[field]===name&&x.correct===null).length};
  }
 }
 return {kind:"retrospective_archived_line_backtest",historicalCheckpoints:replays.length,
  boardOffers:replays.reduce((s,r)=>s+r.totalOffers,0),evaluated:all.length,
  gradedDecisions:valid.length,hits:valid.filter(x=>x.correct).length,hitRate:mean(valid,x=>x.correct?1:0),
  pushes:all.length-valid.length,brierScore:mean(valid,x=>(x.estimatedProbability-(x.correct?1:0))**2),
  byTier,byMarket,calibrated:false,prospectiveVerified:false,
  warning:"Historical line replay with earlier player game logs. Model choices were not actually published at that past time; retrospective selection and incomplete coverage can bias accuracy. No validated lineup EV."};
}
module.exports={gradeHistoricalBoard,summarizeBacktest};
