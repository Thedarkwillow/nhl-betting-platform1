"use strict";
const {study}=require("./bounded-sportsbook-consensus.cjs"),{sameEvent}=require("./archived-prop-market-benchmark.cjs");
const dt=Date.parse,n=Number.isFinite,norm=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function compare(frames,archives){
 const result={NHL:{examined:0,matched:0,missingOriginalIdentity:0,noTimelyArchive:0,noUniqueQuote:0},NFL:{examined:0,matched:0,missingOriginalIdentity:0,noTimelyArchive:0,noUniqueQuote:0}},seen=new Set(),matches=[];
 for(const f of frames){const d=f.document,t=dt(d?.generatedAt),git=dt(f.firstCommittedAt);if(f.gitHistoryCount!==1||d?.kind!=="private_underdog_bounded_candidate_observation_v1"||d.productionEligible!==false||d.completeBoardVerified!==false||!(Math.floor(t/1000)*1000<=git&&git-t<900000))continue;
 for(const p of d.candidates||[]){const s=result[p.league],start=dt(p.eventStartsAt),observed=dt(p.observedAt);if(!s||p.researchOnly!==true||p.productionEligible!==false||p.marketContractVerified!==false||p.sourceIdentityVerified!==false||p.period!=="full_game"||!n(p.line)||!p.sourceOfferId||!p.sourcePlayerId||!p.gameId||!p.playerId||!(observed<=t&&t-observed<=1800000&&start-git>=900000))continue;
 const k=JSON.stringify([p.league,p.sourceOfferId,p.side,p.observedAt]);if(seen.has(k))continue;seen.add(k);s.examined++;
 if(norm(p.sourcePlayerName).split(" ").length<2||!p.sourceTeam||!p.sourceOpponent){s.missingOriginalIdentity++;continue;}
 const eligible=archives.filter(a=>a.gitHistoryCount===1&&n(dt(a.firstCommittedAt))&&Math.abs(dt(a.archive?.generatedAt)-observed)<=1800000&&Math.floor(dt(a.archive.generatedAt)/1000)*1000<=dt(a.firstCommittedAt)&&dt(a.firstCommittedAt)<start-900000);
 if(!eligible.length){s.noTimelyArchive++;continue;}
 const candidates=eligible.flatMap(a=>study(a.archive,{now:a.archive.generatedAt}).groups.filter(q=>q.sport===p.league&&q.market===p.market&&q.line===p.line&&norm(q.player)===norm(p.sourcePlayerName)&&sameEvent({sport:p.league,team:p.sourceTeam,opponent:p.sourceOpponent,gameId:p.gameId,eventStartsAt:p.eventStartsAt},q,a.archive)).map(q=>({q,at:a.archive.generatedAt}))).sort((a,b)=>Math.abs(dt(a.at)-observed)-Math.abs(dt(b.at)-observed));
 if(!candidates.length||new Set(candidates.map(x=>x.q.eventId)).size!==1||candidates.length>1&&Math.abs(dt(candidates[0].at)-observed)===Math.abs(dt(candidates[1].at)-observed)){s.noUniqueQuote++;continue;}
 s.matched++;matches.push({league:p.league,gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,side:p.side,sourceOfferId:p.sourceOfferId,observedAt:p.observedAt,sportsbookAt:candidates[0].at,books:candidates[0].q.books,sportsbookHigher:candidates[0].q.higher,conditionalIdentityOnly:true});
 }}
 return {kind:"private_underdog_conditional_sportsbook_match_v1",bySport:result,matches,sharedProviderIdentityVerified:false,platformAvailabilityVerified:false,productionEligible:false,researchOnly:true};
}
module.exports={compare};
