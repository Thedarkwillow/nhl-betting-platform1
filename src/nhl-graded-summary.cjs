"use strict";
function summarizeGraded(rows){
 const byMarket={},byTier={},byDirection={};
 function add(obj,key,row){
  const r=obj[key||"unknown"]||(obj[key||"unknown"]={decisions:0,wins:0,pushes:0,hitRate:null});
  if(row.correct===null){r.pushes++;return;}
  r.decisions++;if(row.correct)r.wins++;
 }
 for(const row of rows||[]){
  add(byMarket,row.market,row);add(byTier,row.tier,row);add(byDirection,row.lean,row);
 }
 for(const group of [byMarket,byTier,byDirection])for(const x of Object.values(group))
  x.hitRate=x.decisions?Number((x.wins/x.decisions).toFixed(5)):null;
 return {distinctGames:new Set((rows||[]).map(x=>x.gameId)).size,byMarket,byTier,byDirection,
  note:"Observed results, not model calibration. Same-game props may be correlated."};
}
module.exports={summarizeGraded};