"use strict";
// Product-facing derived research cards, not a raw feed or bulk data export.
// Same independent provider as NHL; deliberately cap to 12 distinct cards.
// Terms checked 2026-11-14: in-product analysis allowed, raw feed redistribution not.
const fs=require("node:fs"),path=require("node:path");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const EMPTY=now=>({kind:"public_nfl_derived_research_cards_v1",builtAt:now,asOf:null,scope:"Standard-filtered full-game research only",status:"no_fresh_approved_research",cards:[],calibrated:false,conditionalOnPlaying:true,firstPartyOfferVerified:false,platformSettlementVerified:false,expectedValue:null});
const good=x=>typeof x==="string"&&x.trim()&&x.length<=100;
// Only explicit separate derived-stat display authorization can enable this.
// Never copy arrays of individual game results, source IDs, or raw private data.
function safeMatchup(p,preview){
 const m=p.matchupResearch;
 if(preview?.matchupDerivedDisplayApproved!==true||m?.derivedDisplayApproved!==true||m?.calibrated!==false)return null;
 const rank=m.reconciledPositionRanking,o=rank?.opponent,h=m.headToHead?.all;
 const pos=["QB","RB","FB","WR","TE"].includes(m.position)?m.position:null;
 const exactRank=pos&&rank?.complete===true&&rank.qualifiedTeams===32&&rank.rankDirection==="1_most_allowed"&&o?.team===p.opponent&&Number.isInteger(o.rankMostAllowed)&&o.rankMostAllowed>=1&&o.rankMostAllowed<=32&&Number.isInteger(o.games)&&o.games>=5&&o.games===o.expectedGames?{rank:o.rankMostAllowed,position:pos,games:o.games}:null;
 const h2h=h&&[h.games,h.higher,h.lower,h.push].every(x=>Number.isInteger(x)&&x>=0)&&h.games>=3&&h.higher+h.lower+h.push===h.games?{games:h.games,higher:h.higher,lower:h.lower,push:h.push}:null;
 return exactRank||h2h?{rank:exactRank,headToHead:h2h,scope:"historical_research_only",calibrated:false}:null;
}
function sanitize(board,preview,now=new Date().toISOString(),requestedTier="standard",currentRisk=()=>false){
 const t=dt(now),cap=dt(board?.generatedAt),pin=dt(board?.boardAsOfAt),created=dt(preview?.generatedAt),empty=EMPTY(now);
 if(!["standard","goblin","demon"].includes(requestedTier))return empty;
 const tier=requestedTier[0].toUpperCase()+requestedTier.slice(1);
 empty.scope=tier+"-filtered full-game research only";empty.tier=tier;
 if(![t,cap,pin,created].every(Number.isFinite)||pin>cap||cap-pin>300000||cap>created||created>t||t-pin>1800000||
 board?.provider!=="prizepicksapi.com"||board.league!=="NFL"||board.scope!==requestedTier+"_full_game_replay"||(board.requestedTier??"standard")!==requestedTier||
 board.snapshotMode!=="immutable_as_of"||board.completePagination!==true||board.sourceStatus!=="fresh"||board.fullNFLBoardVerified!==false||
 !Array.isArray(board.offers)||preview?.kind!==(requestedTier==="standard"?"nfl_independent_standard_research_preview_v1":"nfl_independent_alternate_research_preview_v1")||(preview.requestedTier??"standard")!==requestedTier||preview.boardAt!==board.generatedAt||
 preview.completeScopedPagination!==true||preview.fullNFLBoardVerified!==false||preview.calibrated!==false||preview.researchOnly!==true||
 preview.autoPickEligible!==false||preview.publicReleaseApproved!==false||!Array.isArray(preview.rows)||
 preview.sourceOffers!==board.offers.length||preview.matchedRows!==preview.rows.length)return empty;
 const source=new Map(),duplicate=new Set();
 for(const o of board.offers){if(source.has(o.id))duplicate.add(o.id);source.set(o.id,o);}
 const valid=[],seen=new Set();
 for(const p of preview.rows){
  const o=source.get(p.sourceProjectionId),side=p.side==="Higher"?"more":p.side==="Lower"?"less":null;
  if(!o||duplicate.has(o.id)||o.league!=="NFL"||o.source!=="prizepicks"||o.status!=="active"||o.line!==p.line||
     o.player?.name!==p.player||o.player?.team!==p.team||o.event?.opponent!==p.opponent||o.event?.starts_at!==p.eventStartsAt||
     p.capturedAt!==board.generatedAt||p.observedAt!==o.observed_at||!Number.isFinite(dt(p.observedAt))||dt(p.observedAt)>pin+1000||
     !Array.isArray(o.selections)||o.selections.filter(x=>x.tier===requestedTier&&x.side===side&&x.available===true).length!==1||
     ![p.player,p.team,p.opponent,p.market].every(good)||!p.gameId||!p.historicalPlayerId||!side||p.tier!==tier||requestedTier!=="standard"&&side!=="more"||p.availability?.blocksResearch===true||currentRisk(p)===true||
     p.conditionalOnPlaying!==true||p.calibrated!==false||p.researchOnly!==true||p.autoPickEligible!==false||
     p.originalPlatformSettlementVerified!==false||!Number.isFinite(p.line)||p.line<0||!Number.isFinite(p.projection)||
     !Number.isFinite(p.probability)||p.probability<=(requestedTier==="standard"?.5:0)||p.probability>=1||!Number.isInteger(p.priorGames)||p.priorGames<8||
     !Number.isFinite(dt(p.eventStartsAt))||dt(p.eventStartsAt)-t<900000)continue;
  const v=p.probabilities;
  if(!["higher","lower","push"].every(k=>Number.isFinite(v?.[k])&&v[k]>=0&&v[k]<=1)||Math.abs(v.higher+v.lower+v.push-1)>1e-6||
   Math.abs(v[p.side.toLowerCase()]-p.probability)>1e-6)continue;
  valid.push(p);
 }
 valid.sort((a,b)=>b.probability-a.probability||b.priorGames-a.priorGames||a.player.localeCompare(b.player));
 const cards=[];
 for(const p of valid){
  const k=JSON.stringify([p.gameId,p.historicalPlayerId,p.market]);if(seen.has(k))continue;seen.add(k);
  cards.push({tier,player:p.player,team:p.team,opponent:p.opponent,market:p.market,side:p.side,line:p.line,modelProjection:Number(p.projection.toFixed(2)),
   conditionalModelProbability:Number(p.probability.toFixed(4)),priorGames:p.priorGames,eventStartsAt:p.eventStartsAt,...(safeMatchup(p,preview)?{matchupDetail:safeMatchup(p,preview)}:{})});
  if(cards.length===(requestedTier==="standard"?12:4))break;
 }
 return {...empty,asOf:board.generatedAt,status:cards.length?"fresh_derived_research_only":"no_eligible_research_cards",cards};
}
function main(){
 const privateRoot=process.argv[2],publicRoot=process.argv[3];
 if(!privateRoot||!publicRoot)throw Error("Private input and public target required");
 const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(privateRoot,"outputs/nfl/independent-source",p),"utf8"));}catch{return null;}};
 const now=new Date().toISOString();
 const {attachNflAvailability}=require(path.resolve(privateRoot,"src/nfl-current-injury-evidence.cjs"));
 const direct=read("../availability/official-report-latest.json");
 const risk=p=>attachNflAvailability(p,direct,now).blocksResearch===true;
 const result=sanitize(read("latest.json"),read("research-preview-latest.json"),now,"standard",risk);
 const output=path.join(publicRoot,"data/nfl-research-cards.json");fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result)+"\n");
 console.log(JSON.stringify({status:result.status,publishedDerivedCards:result.cards.length,rawFeedRowsPublished:0,calibrated:false}));
 for(const tier of ["goblin","demon"]){const r=sanitize(read("alternates/"+tier+"/latest.json"),read("alternates/"+tier+"/research-preview-latest.json"),now,tier,risk);fs.writeFileSync(path.join(publicRoot,"data/nfl-"+tier+"-research-cards.json"),JSON.stringify(r)+"\n");console.log(JSON.stringify({tier,status:r.status,publishedDerivedCards:r.cards.length,rawFeedRowsPublished:0,calibrated:false}));}
}
if(require.main===module)main();
module.exports={sanitize,safeMatchup};
