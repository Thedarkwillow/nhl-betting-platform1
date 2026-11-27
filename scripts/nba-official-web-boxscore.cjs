'use strict';
const {createHash}=require('node:crypto');
const reviewedClock={
 gameId:'0022600041', playerId:203081, team:'POR', displayed:'32:60', minutes:'33:00',
 htmlSha256:'cfae25f8920a7a7e6d0df27927a875344cada0ebf24a24be622c67f2fe8d9bbd',
 sourceUrl:'https://statsdmz.nba.com/pdfs/20261113/20261113_PORSAC.pdf',
 scorebookSha256:'190181547065d7338f6449764f2e0b050d3ecfd13ff37729341fa331588f0037'
};
function scorebookClock(gameId,playerId,team,displayed,htmlSha256){
 const x=reviewedClock;
 return x.gameId===gameId&&x.playerId===playerId&&x.team===team&&x.displayed===displayed&&x.htmlSha256===htmlSha256?{...x}:null;
}
// Only read basketball data from the official game's embedded page state.
function parsePage(html) {
 const matches = [...html.matchAll(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
 if (matches.length !== 1) return null;
 const {game,playByPlay}=JSON.parse(matches[0][1])?.props?.pageProps||{};
 if (!game || game.gameStatus !== 3 || !/^final(?:\b|$)/i.test(game.gameStatusText)) return null;
 const seen = new Set();let minutesEvidence=null;
 for (const team of [game.homeTeam, game.awayTeam]) {
  if (!Array.isArray(team?.players) || !Number.isSafeInteger(team.score)) return null;
  let points = 0;
  for (const player of team.players) {
   if (!Number.isSafeInteger(player.personId) || seen.has(player.personId)) return null;
   seen.add(player.personId);
   const stats = player.statistics;
   if (!stats) return null;
   if (!stats.minutes && player.comment && stats.points === 0) continue;
   // Some older official game pages embed the CDN ISO-duration form instead
   // of the site display form. Both must still pass appearance and score checks.
   let match = /^(\d{1,2}):([0-5]\d)$/.exec(stats.minutes) ??
    /^PT(\d{1,2})M([0-5]?\d(?:\.\d{1,3})?)S$/.exec(stats.minutes);
   if(!match&&game.gameId===reviewedClock.gameId&&player.personId===reviewedClock.playerId){
    minutesEvidence=scorebookClock(game.gameId,player.personId,team.teamTricode,stats.minutes,createHash('sha256').update(html).digest('hex'));
    if(minutesEvidence)match=/^(\d{1,2}):([0-5]\d)$/.exec(minutesEvidence.minutes);
   }
   if (!match || player.comment || !['points','reboundsTotal','assists','threePointersMade','steals','blocks','turnovers'].every(k=>Number.isSafeInteger(stats[k]) && stats[k]>=0)) return null;
   if (Number(match[1])===0 && Number(match[2])===0 && stats.points!==0) return null;
   points += stats.points;
   player.played = Number(match[1]) + Number(match[2]) > 0;
   stats.minutes = 'PT' + match[1] + 'M' + match[2] + 'S';
  }
  if (points !== team.score) return null;
 }
 return {game,playByPlay,...(minutesEvidence?{minutesEvidence}:{})};
}
function url(game) {
 if (!Number.isSafeInteger(game.gameId) || ![game.home,game.away].every(t=>/^[A-Z]{3}$/.test(t)) || game.home===game.away) throw Error('invalid game scope');
 return 'https://www.nba.com/game/' + game.away.toLowerCase() + '-vs-' + game.home.toLowerCase() + '-' + String(game.gameId).padStart(10,'0') + '/box-score';
}
async function read(game) {
 const sourceUrl=url(game);
 const response=await fetch(sourceUrl,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});
 if (!response.ok || !response.body) throw Error('official page unavailable');
 const parts=[];let length=0;
 for await (const part of response.body) {
  length+=part.length;
  if (length>5e6) throw Error('official page size');
  parts.push(part);
 }
 const raw=Buffer.concat(parts);
 return {doc:parsePage(raw.toString('utf8')),digest:require('node:crypto').createHash('sha256').update(raw).digest('hex'),sourceUrl};
}
module.exports={parsePage,url,read,scorebookClock};
