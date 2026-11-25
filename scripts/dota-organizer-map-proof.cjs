"use strict";
// Scoped organizer-reviewed map proof; no cross-provider player IDs or prop settlement.
const fs=require("node:fs"),crypto=require("node:crypto");
const {groups}=require("./dota-series-archive-review.cjs");
const proof=Object.freeze({
 sourceUrl:"https://blast.tv/dota/tournaments/blast-slam-ix/series/2e5e73ca/og-aurora",
 organizer:"BLAST",reviewDate:"2026-11-25",leagueId:"20208",seriesId:"1172336",
 mapId:"9104081844",ordinal:1,durationSeconds:2914,teamScores:[31,17],
 seriesScore:[2,1],
 // Published organizer match-1 K/D/A triples, without player identifiers.
 kda:[[[10,1,9],[10,3,14],[3,3,16],[2,7,19],[6,3,19]],[[2,11,9],[3,2,9],[3,9,7],[5,5,10],[4,4,7]]]
});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>a.map(x=>JSON.stringify(x)).sort();
function audit(doc,p=proof){
 if(doc?.kind!=="restricted_esports_free_provider_observations_v1"||!Array.isArray(doc.opendota?.index)||!Array.isArray(doc.opendota?.games))throw Error("archive contract");
 const a=doc.opendota.index.filter(x=>x.leagueId===p.leagueId&&x.providerSeriesId===p.seriesId);
 const eligible=groups(a);
 if(eligible.length!==1||eligible[0].length!==3||p.ordinal!==1||eligible[0][0].providerGameId!==p.mapId)throw Error("scope disagreement");
 const g=eligible[0][0],game=doc.opendota.games.filter(x=>x.game?.providerGameId===p.mapId);
 if(game.length!==1||!same(game[0].game,g)||g.durationSeconds!==p.durationSeconds||!same(g.teamScores,p.teamScores)||g.winnerTeamId!==g.teamIds[0])throw Error("map facts disagree");
 const seriesWins=g.teamIds.map(id=>eligible[0].filter(x=>x.winnerTeamId===id).length);
 if(!same(seriesWins,p.seriesScore))throw Error("series score disagreement");
 const rows=game[0].players;
 if(!Array.isArray(rows)||rows.length!==10||new Set(rows.map(x=>x.providerPlayerId)).size!==10||rows.some(x=>x.provider!=="opendota"||x.title!=="DOTA2"||x.providerMatchId!==p.mapId||!g.teamIds.includes(x.teamId)||!x.providerPlayerId||!x.stats||![x.stats.kills,x.stats.deaths,x.stats.assists].every(n=>Number.isInteger(n)&&n>=0)))throw Error("native player rows invalid");
 for(let i=0;i<2;i++){
  const team=rows.filter(x=>x.teamId===g.teamIds[i]);
  if(team.length!==5||!same(sorted(team.map(x=>[x.stats.kills,x.stats.deaths,x.stats.assists])),sorted(p.kda[i])))throw Error("organizer KDA mismatch");
 }
 return {kind:"dota_organizer_map_evidence_v1",reviewedSeries:1,archivedSeriesMaps:eligible[0].length,organizerVerifiedMapOrdinals:1,organizerKdaCorroboratedRows:10,remainingUnverifiedOrdinals:2,completeSeriesIndependentlyVerified:false,playerIdentityCrosswalkVerified:false,originalOffersMatched:0,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
if(require.main===module){try{const raw=fs.readFileSync(process.argv[2]);if(crypto.createHash("sha1").update("blob "+raw.length+"\0").update(raw).digest("hex")!==process.argv[3])throw Error("blob mismatch");console.log(JSON.stringify(audit(JSON.parse(raw))));}catch{console.error("Organizer map proof failed closed");process.exitCode=1;}}
module.exports={audit,proof};
