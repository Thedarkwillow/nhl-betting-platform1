"use strict";
// NFL positional allowances among verified opportunity appearances, not
// all rostered players. No league rank until full participation is verified.
const {adapt}=require("./nfl-player-context-evidence.cjs");
const {audit:pairedHistoricalGames}=require("./paired-historical-game-projection.cjs");
const {SPEC}=require("./nfl-dedicated-core-market-lab.cjs");
const {buildRaw}=require("../scripts/backtest-nfl-matchup-context.cjs");
const fs=require("node:fs"),path=require("node:path");
const positions=["QB","RB","FB","WR","TE"],num=Number.isFinite,sum=a=>a.reduce((s,x)=>s+x,0),mean=a=>sum(a)/a.length,k=(...a)=>JSON.stringify(a),cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const state=()=>({players:new Map(),def:new Map(),off:new Map(),lg:new Map()});
function add(m,key,x){const a=m.get(key)||[];a.push(x);m.set(key,a);}
function update(c,rows){
 const groups=new Map();
 for(const r of rows){if(!positions.includes(r.position)||!SPEC[r.market]||!num(r.value)||!num(r.opportunity)||r.opportunity<=0||!num(r.rateExposure)||r.rateExposure<0)continue;add(c.players,k(r.playerId,r.market),r);add(groups,k(r.season,r.gameId,r.team,r.opponent,r.position,r.market),r);}
 for(const a of groups.values()){const r=a[0],v={n:a.length,value:sum(a.map(x=>x.value)),raw:sum(a.map(x=>x.rawStat)),exposure:sum(a.map(x=>x.rateExposure)),gameId:r.gameId};add(c.def,k(r.season,r.opponent,r.position,r.market),v);add(c.off,k(r.season,r.team,r.position,r.market),v);add(c.lg,k(r.season,r.position,r.market),v);}
}
function stats(a){const n=sum(a.map(x=>x.n)),exp=sum(a.map(x=>x.exposure));return {games:a.length,appearances:n,perAppearance:n?sum(a.map(x=>x.value))/n:null,perOpportunity:exp>0?sum(a.map(x=>x.raw))/exp:null};}
function windows(a){return {season:stats(a),last20:stats(a.slice(-20)),last10:stats(a.slice(-10)),last5:stats(a.slice(-5))};}
function ratio(a,ref,field){if(a.length<4||!(ref>0))return null;const s=stats(a),recent=stats(a.slice(-5));if(!num(s[field])||!num(recent[field]))return null;return cap(1+(.65*(s[field]/ref-1)+.35*(recent[field]/ref-1))*a.length/(a.length+12),.8,1.2);}
function candidate(c,p){
 const spec=SPEC[p.market];if(!spec)return null;
 const a=(c.players.get(k(p.historicalPlayerId,p.market))||[]).filter(r=>r.team===p.team).slice(-20);if(a.length<8||mean(a.slice(-5).map(r=>r.opportunity))<spec.min)return null;
 const role=a.at(-1).position;if(a.slice(-5).filter(r=>r.position===role).length<4)return null;
 const d=c.def.get(k(p.season,p.opponent,role,p.market))||[],o=c.off.get(k(p.season,p.team,role,p.market))||[],lg=c.lg.get(k(p.season,role,p.market))||[];
 if(lg.length<32)return null;
 const field=spec.kind==="volume"?"perAppearance":"perOpportunity",ref=stats(lg)[field],def=ratio(d,ref,field),off=ratio(o,ref,field);if(def===null||off===null)return null;
 const base=.6*mean(a.slice(-5).map(r=>r.value))+.4*mean(a.map(r=>r.value)),clamp=x=>spec.kind==="percentage"?cap(x,0,100):spec.kind==="rate"?x:Math.max(0,x);
 return {position:role,baseline:base,positionDefense:clamp(base*def),offenseDefense:clamp(base*(1+.65*(def-1)+.35*(off-1))),defense:windows(d),offense:windows(o),reference:ref,referenceUnits:field,defenseFactor:def,offenseFactor:off,researchOnly:true,rank:null,pastOpportunityAppearancesOnly:true};
}
function cohorts(weekly,schedule){const a=adapt(weekly,schedule,"9999-12-31"),weeks=new Map();for(const r of a)add(weeks,k(r.season,r.week),r);return [...weeks.entries()].sort(([a],[b])=>{const x=JSON.parse(a),y=JSON.parse(b);return x[0]-y[0]||x[1]-y[1];});}
function prepare(weekly,schedule,season,week){const c=state();for(const [id,rows] of cohorts(weekly,schedule)){const [y,w]=JSON.parse(id);if(y>season||y===season&&w>=week)break;update(c,rows);}return c;}
function study(weekly,schedule){
 const c=state(),out={};for(const [id,rows] of cohorts(weekly,schedule)){const [year]=JSON.parse(id);for(const r of rows){const p=candidate(c,{...r,historicalPlayerId:r.playerId});if(!p||year<2025)continue;for(const key of [year+"|"+r.market,year+"|"+r.market+"|"+p.position]){const a=out[key]??={n:0,games:new Set(),baseline:0,positionDefense:0,offenseDefense:0,paired:[]};a.n++;a.games.add(r.gameId);for(const m of ["baseline","positionDefense","offenseDefense"])a[m]+=Math.abs(p[m]-r.value);a.paired.push({season:r.season,week:r.week,gameId:r.gameId,playerId:r.playerId,market:r.market,observed:r.value,baseline:p.baseline,challenger:p.offenseDefense});}}update(c,rows);}
 return {kind:"nfl_position_opportunity_matchup_v1",bySeasonMarketPosition:Object.fromEntries(Object.entries(out).map(([key,a])=>[key,{appearances:a.n,games:a.games.size,baselineMAE:a.baseline/a.n,positionDefenseMAE:a.positionDefense/a.n,offenseDefenseMAE:a.offenseDefense/a.n,pairedGameUncertainty:pairedHistoricalGames(a.paired)}])),strictPriorWeeks:true,conditionalOpportunityAppearance:true,fullRosterCoverageVerified:false,actualOfferAccuracy:null,modelPromoted:false};
}
function main(){const raw=buildRaw(),result=study(Object.values(raw.player_weekly).flat(),Object.values(raw.schedule).flat());fs.writeFileSync(path.resolve(__dirname,"../outputs/nfl/backtests/position-opportunity-matchup-latest.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({markets:Object.keys(result.bySeasonMarketPosition).length,modelPromoted:false}));}
if(require.main===module)main();module.exports={state,update,windows,candidate,prepare,study};
