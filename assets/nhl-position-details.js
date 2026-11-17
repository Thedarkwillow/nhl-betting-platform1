(function(root){"use strict";
 const windows=[["season","Season"],["last20","Last 20"],["last10","Last 10"],["last5","Last 5"]];
 const key=p=>JSON.stringify([p.player,p.team,p.market,p.eventStartsAt,p.capturedAt]);
 function match(doc,p){if(doc?.kind!=="public_nhl_official_matchup_aggregates_v1"||doc.historicalOnly!==true||doc.forecastApproved!==false||!Array.isArray(doc.rows))return null;const a=doc.rows.filter(x=>key(x)===key(p));return a.length===1?a[0]:null;}
 function render(host,p){
  const el=(t,txt)=>{const e=document.createElement(t);if(txt!==undefined)e.textContent=txt;return e;},section=el("section");section.className="board-panel position-matchup-panel";section.append(el("h3","Position-specific matchup"));const status=el("p","Checking official completed-game matchup data…");status.className="minor";section.append(status);host.append(section);
  fetch("./data/nhl-position-breakdowns.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("unavailable");return r.json();}).then(doc=>{
   if(!section.isConnected)return;const x=match(doc,p);if(!x){status.textContent="No verified position breakdown for this exact archived quote.";return;}
   status.textContent=x.position+" · "+x.team+" vs "+x.opponent+" · official games before "+x.cutoff+". Historical position group averages, not a prediction.";
   const wrap=el("div");wrap.className="table-wrap";const t=el("table"),head=el("thead"),hr=el("tr");["Window","Defense allowed/player","Defense per 60","Def. rank¹","Own offense/player","Offense per 60","Off. rank¹"].forEach(s=>hr.append(el("th",s)));head.append(hr);t.append(head);
   const body=el("tbody"),fmt=n=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(2):"—",rank=n=>Number.isInteger(n)?String(n):"—";
   for(const [k,label] of windows){const d=x.defense?.[k]||{},o=x.offense?.[k]||{},tr=el("tr");[label+" ("+(d.games||0)+" def. games)",fmt(d.perAppearance),fmt(d.per60),rank(d.rank),fmt(o.perAppearance),fmt(o.per60),Number.isInteger(o.rank)?String(o.rank):"—"].forEach(v=>tr.append(el("td",v)));body.append(tr);}
   t.append(body);wrap.append(t);section.append(wrap);const note=el("p","¹ Rank 1 = lowest recorded per-player rate for both sides. Offense rank is also low-to-high; ranks withheld unless all 32 teams qualify. Recent windows use source-complete qualifying games, not all scheduled games. Position is prior observed role, not confirmed lineup.");note.className="minor";section.append(note);
  }).catch(()=>{if(section.isConnected)status.textContent="Position data unavailable; no values inferred.";});
 }
 const api={match,render};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.NhlPositionDetails=api;
})(typeof window!=="undefined"?window:globalThis);
