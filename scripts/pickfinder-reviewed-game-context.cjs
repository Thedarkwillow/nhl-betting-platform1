'use strict';

const origin = 'https://www.pickfinder.app';
const teamCode = value => ({NY:'NYK', GS:'GSW', SA:'SAS', NO:'NOP', WSH:'WAS'}[value] || value);
const key = (eventId, playerPath) => JSON.stringify([eventId, playerPath]);

function displayedClockAt(instant, zone) {
  if (!Number.isFinite(Date.parse(instant)) || typeof zone !== 'string') return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'2-digit',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(new Date(instant));
    const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return p.weekday+' '+p.month+'/'+p.day+', '+p.hour+':'+p.minute+' '+p.dayPeriod;
  } catch { return null; }
}

// Review documents retain the local clock label separately from the independently sourced UTC time.
function indexReviews(receipts, clock) {
  const index = new Map();
  for (const doc of receipts) {
    if (doc.schema !== 'pickfinder-independent-nba-matchup-review-v1') continue;
    const games = new Map((doc.games || []).map(g => [g.eventId, g]));
    if(games.size!==(doc.games||[]).length)continue;
    const matchingClocks=new Set([...games.values()].filter(g=>g.displayedClock===displayedClockAt(g.scheduleStartAt,doc.clockComparisonZone)).map(g=>g.eventId));
    for (const r of doc.records || []) {
      const g = games.get(r.eventId);
      if (!g || !matchingClocks.has(g.eventId) || r.independentRosterVerified!==true || !r.nbaPlayerId || !r.espnPlayerId) continue;
      const observations = [Date.parse(r.observedAt), Date.parse(g.observedAt)];
      if (!observations.every(t => Number.isFinite(t) && t <= Date.parse(clock) && t < Date.parse(g.scheduleStartAt))) continue;
      if (g.sourceUrl !== origin+'/game-lines?game='+encodeURIComponent(g.eventId)) continue;
      let u;
      try { u = new URL(r.sourceUrl); } catch { continue; }
      if (u.origin !== origin || u.pathname !== r.playerPath || u.searchParams.get('prop')?.split(':')[2] !== g.eventId) continue;
      const away = r.team === g.away && r.opponent === g.home;
      const home = r.team === g.home && r.opponent === g.away;
      if (!(away || home) || r.displayedMatchup !== [r.team, away?'@':'vs', r.opponent].join(' ')) continue;
      const k = key(g.eventId,r.playerPath);
      const signature = JSON.stringify([g.nbaGameId,g.espnGameId,g.scheduleStartAt,r.nbaPlayerId,r.espnPlayerId,r.team,r.opponent,r.player]);
      const old = index.get(k);
      if (!index.has(k)) index.set(k,{g,r,signature});
      else if (old?.signature !== signature) index.set(k,null);
    }
  }
  return index;
}
function matchesReview(index, offer, nativeId, roster, event) {
  let path;
  try { path = new URL(offer.detailId,origin).pathname; } catch { return false; }
  const record = index.get(key(offer.eventId,path));
  if (!record) return false;
  const {r,g} = record;
  return r.player===offer.player && String(nativeId)===r.nbaPlayerId &&
    String(roster.playerId)===r.espnPlayerId && teamCode(roster.team)===r.team &&
    String(event.eventId)===g.espnGameId && Date.parse(event.startAt)===Date.parse(g.scheduleStartAt) &&
    event.teams.some(t=>t.homeAway==='home'&&teamCode(t.abbr)===g.home) &&
    event.teams.some(t=>t.homeAway==='away'&&teamCode(t.abbr)===g.away) &&
    Date.parse(offer.observedAt)<Date.parse(g.scheduleStartAt);
}
module.exports={teamCode,displayedClockAt,indexReviews,matchesReview};
