'use strict';
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {allowance,selectEvents,SPORT_CAP}=require('../src/sportsbook-event-quota.cjs');
const {study}=require('../src/bounded-sportsbook-consensus.cjs');
const key=process.env.ODDS_API_KEY,DIR='outputs/sportsbooks/bounded-live',CAP=12,RESERVE=50;
const now=()=>Date.now(),dt=x=>Date.parse(x);
const day=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const date=day(now()),budgetPath=DIR+'/budget-'+date+'.json';
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pair=(a,b)=>a&&b&&a!==b?[a,b].sort().join('|'):null;
const NHL='ANA:Anaheim Ducks|BOS:Boston Bruins|BUF:Buffalo Sabres|CGY:Calgary Flames|CAR:Carolina Hurricanes|CHI:Chicago Blackhawks|COL:Colorado Avalanche|CBJ:Columbus Blue Jackets|DAL:Dallas Stars|DET:Detroit Red Wings|EDM:Edmonton Oilers|FLA:Florida Panthers|LAK:Los Angeles Kings|MIN:Minnesota Wild|MTL:Montreal Canadiens|NSH:Nashville Predators|NJD:New Jersey Devils|NYI:New York Islanders|NYR:New York Rangers|OTT:Ottawa Senators|PHI:Philadelphia Flyers|PIT:Pittsburgh Penguins|SEA:Seattle Kraken|SJS:San Jose Sharks|STL:St Louis Blues|TBL:Tampa Bay Lightning|TOR:Toronto Maple Leafs|UTA:Utah Mammoth|VAN:Vancouver Canucks|VGK:Vegas Golden Knights|WSH:Washington Capitals|WPG:Winnipeg Jets';
const NFL='ARI:Arizona Cardinals|ATL:Atlanta Falcons|BAL:Baltimore Ravens|BUF:Buffalo Bills|CAR:Carolina Panthers|CHI:Chicago Bears|CIN:Cincinnati Bengals|CLE:Cleveland Browns|DAL:Dallas Cowboys|DEN:Denver Broncos|DET:Detroit Lions|GB:Green Bay Packers|HOU:Houston Texans|IND:Indianapolis Colts|JAX:Jacksonville Jaguars|KC:Kansas City Chiefs|LV:Las Vegas Raiders|LAC:Los Angeles Chargers|LAR:Los Angeles Rams|MIA:Miami Dolphins|MIN:Minnesota Vikings|NE:New England Patriots|NO:New Orleans Saints|NYG:New York Giants|NYJ:New York Jets|PHI:Philadelphia Eagles|PIT:Pittsburgh Steelers|SEA:Seattle Seahawks|SF:San Francisco 49ers|TB:Tampa Bay Buccaneers|TEN:Tennessee Titans|WAS:Washington Commanders';
const teams=Object.fromEntries([['NHL',NHL],['NFL',NFL]].map(([s,v])=>[s,Object.fromEntries(v.split('|').map(x=>x.split(':')))]));
const club=(s,t)=>{const a=String(t||'').trim().toUpperCase();return norm(teams[s][(s==='NHL'?{SJ:'SJS',LA:'LAK',NJ:'NJD',TB:'TBL'}:{JAC:'JAX',WSH:'WAS',LA:'LAR'})[a]||a]);};
const sports={NHL:{key:'icehockey_nhl',markets:{player_shots_on_goal:['shotsOnGoal','Shots On Goal'],player_goals:['goals','Goals'],player_assists:['assists','Assists'],player_points:['points','Points'],player_blocked_shots:['blockedShots','Blocked Shots'],player_total_saves:['saves','Goalie Saves']}},NFL:{key:'americanfootball_nfl',markets:{player_pass_yds:['passing_yards','Pass Yards'],player_rush_yds:['rushing_yards','Rush Yards'],player_reception_yds:['receiving_yards','Receiving Yards'],player_receptions:['receptions','Receptions'],player_pass_tds:['passing_touchdowns','Pass TDs'],player_pass_completions:['passing_completions','Pass Completions']}}};
const books=['draftkings','fanduel','betmgm','caesars'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const git=a=>execFileSync('git',a,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const status={kind:'bounded_sportsbook_capture_v1',generatedAt:new Date().toISOString(),pacificDate:date,scope:'up to two games per sport; three markets per event; independent 6-credit sport ceilings; 12 credits/day',requests:0,quotaCreditsReported:0,results:{},newPurchase:false,verifiedLiveConsensus:false,accountReserve:RESERVE,creditCap:CAP};
const rows=[],gameMarkets=[],board={NHL:[],NFL:[]};let remaining=null,planned=0,budgetReserved=false,activeSportSpent=0,activeSport=null;
function receipt(record){fs.mkdirSync(DIR,{recursive:true});const id=new Date().toISOString().replace(/[-:.]/g,'')+'-'+status.requests+'-'+record.phase;fs.writeFileSync(DIR+'/quota-receipt-'+date+'-'+id+'.json',JSON.stringify({kind:'private_odds_quota_receipt_v1',date,sport:activeSport,recordedAt:new Date().toISOString(),...record})+'\n',{flag:'wx'});}
const markerFor=s=>DIR+'/reservation-'+date+'-'+s+'.json';
const legacy=fs.existsSync(budgetPath)?read(budgetPath):null;
function legacyCompletion(){
 if(!legacy)return null;
 try{
  const files=fs.readdirSync(DIR).filter(x=>/^\d{8}T\d{9}Z\.json$/.test(x)); const found=[];
  for(const name of files){const p=DIR+'/'+name,d=read(p);if(d.pacificDate!==date||dt(d.generatedAt)<dt(legacy.createdAt))continue;const cs=git(['log','--format=%H','--',p]).split('\n').filter(Boolean);if(cs.length!==1)return null;const original=JSON.parse(git(['show',cs[0]+':'+p]));if(JSON.stringify(original)!==JSON.stringify(d)||dt(git(['show','-s','--format=%cI',cs[0]]))<Math.floor(dt(d.generatedAt)/1000)*1000)return null;found.push(original);}
  return found.length===1?found[0]:null;
 }catch{return null;}
}
const prior=legacyCompletion();
const available=s=>allowance({sport:s,date,marker:fs.existsSync(markerFor(s)),legacy,completed:prior});
function recentBoard(){
 const root='outputs/manual-board-captures/'+date;if(!fs.existsSync(root))return null;
 for(const name of fs.readdirSync(root).filter(x=>/^\d{8}T\d{6}Z$/.test(x)).sort().reverse().slice(0,8)){
  const base=root+'/'+name,rel=base+'/manifest.json',m=read(rel),at=dt(m.captureFinishedUTC);
  if(m.source!=='partner-api.prizepicks.com'||m.completePagination!==true||!(at<=now()&&now()-at<20*60000))continue;
  const commits=git(['log','--format=%H','--',rel]).split('\n').filter(Boolean);
  if(commits.length!==1)continue;
  const sha=commits[0],committed=dt(git(['show','-s','--format=%cI',sha]));
  if(!(at<=committed+999&&committed<=now()&&committed-at<900000))continue;
  const orig=JSON.parse(git(['show',sha+':'+rel]));
  if(orig.captureFinishedUTC!==m.captureFinishedUTC||orig.completePagination!==true)continue;
  const expected=['projectionId','providerPlayerId','player','team','position','providerGameId','gameExternalId','eventStartsAt','opponent','market','line','tier','offeredWagerTypes'];
  if(!expected.every((x,i)=>orig.columns[i]===x))continue;
  for(const [sport,s] of Object.entries(sports)){
   const item=orig.sports?.find(x=>x.sport===sport);
   if(!Number.isInteger(item?.parts)||item.parts<1||item.parts>25)throw Error('source_parts_invalid');
   const all=[];
   for(let i=1;i<=item.parts;i++){
    const p=base+'/'+sport.toLowerCase()+'-'+String(i).padStart(2,'0')+'.json';
    all.push(...JSON.parse(git(['show',sha+':'+p])).rows);
   }
   if(all.length!==item.normalizedCount)throw Error('source_count_mismatch');
   for(const r of all){
    const market=Object.entries(s.markets).find(([,v])=>norm(v[1])===norm(r[9]));
    const clubs=pair(club(sport,r[3]),club(sport,r[8]));
    if(!market||!clubs||!r[0]||!r[1]||!r[2]||!Number.isFinite(r[10])||!(dt(r[7])>now()+20*60000)||!['standard','goblin','demon'].includes(r[11])||!['over','under','under_or_over'].includes(r[12])||r[16]===true||r[17]===true||r[21]||!['full','full game','game'].includes(norm(r[19])))continue;
    if(norm(r[2]).split(' ').length<2||norm(r[2]).split(' ')[0].length<2)continue;
    board[sport].push({offerId:r[0],playerId:r[1],player:r[2],game:r[5],teams:clubs,start:dt(r[7]),marketKey:market[0],market:market[1][0],line:r[10],tier:r[11],side:r[12]});
   }
  }
  return {observedAt:m.captureFinishedUTC,sha};
 }
 return null;
}
const header=(r,n)=>{const v=r.headers.get(n);return typeof v==='string'&&/^\d+$/.test(v)?Number(v):null;};
async function get(path,params={},cost=0){
 if(day(now())!==date||status.requests>=6||cost>0&&(!budgetReserved||remaining===null||remaining<RESERVE+cost||planned+cost>CAP||activeSportSpent+cost>SPORT_CAP))throw Error('budget_refused');
 if(cost>0){planned+=cost;activeSportSpent+=cost;}
 const u=new URL('https://api.the-odds-api.com/v4/sports/'+path);Object.entries({...params,apiKey:key}).forEach(([k,v])=>u.searchParams.set(k,v));status.requests++;
 if(cost>0)receipt({phase:'attempt',costCeiling:cost,remainingBefore:remaining});
 const res=await fetch(u,{signal:AbortSignal.timeout(25000)}),c=header(res,'x-requests-last');remaining=header(res,'x-requests-remaining');
 if(cost>0)receipt({phase:'response',costCeiling:cost,costReported:c,remainingAfter:remaining,used:header(res,'x-requests-used'),http:res.status});
 if(c===null)status.quotaCreditsReported=null;else if(status.quotaCreditsReported!==null)status.quotaCreditsReported+=c;
 if(!res.ok)throw Error('provider_http_'+res.status);
 if(c===null||c>cost||remaining===null)throw Error('cost_or_remaining_unverified');
 return res.json();
}
async function officialSchedule(){
 try{
  const u='https://api-web.nhle.com/v1/schedule/'+date,r=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok)throw Error('schedule_http');
  const d=await r.json(),g=(d.gameWeek||[]).flatMap(x=>x.games||[]).map(x=>({id:x.id,home:x.homeTeam?.abbrev,away:x.awayTeam?.abbrev,startTimeUTC:x.startTimeUTC,gameState:x.gameState}));
  if(!g.length||new Set(g.map(x=>x.id)).size!==g.length||!g.every(x=>Number.isInteger(x.id)&&x.home&&x.away&&Number.isFinite(dt(x.startTimeUTC))))throw Error('schedule_schema');
  return {games:g,fresh:true,observedAt:new Date().toISOString()};
 }catch{
  try{const d=read('outputs/official-nhl/season-schedules/2026-27.json');return {games:d.complete===true?d.games:[],fresh:false,observedAt:d.generatedAt};}catch{return {games:[],fresh:false};}
 }
}
function reserve(sport){
 const p=markerFor(sport);
 if(available(sport)!==SPORT_CAP)return false;
 fs.mkdirSync(DIR,{recursive:true});
 fs.writeFileSync(p,JSON.stringify({kind:'private_sportsbook_sport_reservation_v2',pacificDate:date,sport,reservedCredits:SPORT_CAP,createdAt:new Date().toISOString(),accountReserve:RESERVE,legacyRecovery:!!legacy})+'\n',{flag:'wx'});
 git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
 git(['add','-f',p]);git(['commit','-m','data: reserve '+sport+' bounded daily sportsbook quota before requests']);
 for(let i=0;i<3;i++){git(['fetch','-q','origin','main']);git(['rebase','-q','origin/main']);try{git(['push','-q','origin','HEAD:main']);return true;}catch{}}
 throw Error('reservation_not_persisted');
}
function capturePairs(sport,e,requested,data,target){
 const stamp=new Date().toISOString(),s=sports[sport],pairs=[];
 if(data.id!==e.id||data.home_team!==e.home_team||data.away_team!==e.away_team||data.commence_time!==e.commence_time||!(dt(stamp)<Math.min(dt(e.commence_time),target.officialTime?dt(target.officialTime):Infinity)))throw Error('event_mismatch');
 for(const b of data.bookmakers||[]){
  if(!books.includes(b.key))continue;
  for(const m of b.markets||[]){
   if(!requested.includes(m.key)||!Number.isFinite(dt(m.last_update))||dt(m.last_update)>dt(stamp)||dt(stamp)-dt(m.last_update)>30*60000)continue;
   const pm=new Map(),bad=new Set();
   for(const o of m.outcomes||[]){
    if(!['Over','Under'].includes(o.name)||typeof o.description!=='string'||!o.description.trim()||!Number.isFinite(o.point)||!Number.isInteger(o.price)||Math.abs(o.price)<100)continue;
    const k=JSON.stringify([o.description,o.point]),a=pm.get(k)||{player:o.description,line:o.point};if(a[o.name]!==undefined)bad.add(k);a[o.name]=o.price;pm.set(k,a);
   }
   for(const [k,a] of pm)if(!bad.has(k)&&Number.isFinite(a.Over)&&Number.isFinite(a.Under))pairs.push({sport,player:a.player,line:a.line,market:s.markets[m.key][0],period:'full_game',overOdds:a.Over,underOdds:a.Under,book:b.key,eventId:e.id,homeTeam:e.home_team,awayTeam:e.away_team,commenceTime:e.commence_time,capturedAt:stamp,marketUpdatedAt:m.last_update,source:'The Odds API',officialGameId:target.officialId,officialStartTimeUTC:target.officialTime,eventMatchMethod:target.method});
  }
 }
 return pairs;
}
async function main(){
 if(!key){console.log('Missing odds secret; no requests.');return;}
 const allowed=Object.fromEntries(Object.keys(sports).map(s=>[s,available(s)]));if(!Object.values(allowed).some(x=>x>0)){console.log('Daily sport quotas already reserved or legacy completion unverified; no requests.');return;}
 let source;try{source=recentBoard();}catch{console.log('Recent complete original board could not be verified; no requests.');return;}
 if(!source){console.log('No fresh complete board; no requests.');return;}
 status.sourceBoardAt=source.observedAt;status.sourceBoardCommit=source.sha;
 const plan=[];status.eventDiscovery={};status.availableSportCredits=allowed;status.legacyRecovery=!!legacy;
 const official=allowed.NHL?await officialSchedule():{games:[],fresh:false};
 status.officialSchedule={fresh:official.fresh,observedAt:official.observedAt??null};
 for(const [sport,s] of Object.entries(sports)){
  if(!allowed[sport]||!board[sport].length){status.eventDiscovery[sport]={status:!allowed[sport]?'quota_reserved':'no_eligible_full_game_offers',boardRows:board[sport].length};continue;}
  try{
   const events=await get(s.key+'/events');const picked=selectEvents({sport,events,board:board[sport],official:official.games,officialFresh:official.fresh,now:now(),club,pair,norm});status.eventDiscovery[sport]=picked.diag;plan.push(...picked.targets);
  }catch(e){status.eventDiscovery[sport]={status:'event_discovery_failed',reason:/^provider_http_\d+$/.test(e.message)?e.message:'network_or_quota_contract'};}
 }
 const diagnostic=()=>{fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(DIR+'/event-discovery-latest.json',JSON.stringify({kind:'private_sportsbook_event_discovery_v2',generatedAt:new Date().toISOString(),sourceBoardAt:source.observedAt,availableSportCredits:allowed,officialSchedule:status.officialSchedule,bySport:status.eventDiscovery,requests:status.requests,quotaCreditsReported:status.quotaCreditsReported},null,2)+'\n');};
 if(!plan.length||remaining===null||remaining<RESERVE+Math.min(SPORT_CAP,plan.reduce((n,x)=>n+x.markets.length,0))){diagnostic();console.log('No matched events or insufficient provider quota; no paid requests.');return;}
 const reserved=new Set(),crosswalk=[];
 for(const target of plan){const {sport,e}=target;let markets=target.markets;
  // Exchange two NFL prop-market credits for game context on the first NFL event. Never increase the existing daily budget.
  if(sport==='NFL'&&!reserved.has(sport))markets=[...markets.slice(0,1),'spreads','totals'];
  activeSport=sport;
  if(!reserved.has(sport)){if(remaining===null||remaining<RESERVE+SPORT_CAP||!reserve(sport))continue;reserved.add(sport);budgetReserved=true;activeSportSpent=0;}
  else if(activeSportSpent+markets.length>SPORT_CAP)continue;
  if(now()-dt(source.observedAt)>=25*60000||Math.min(dt(e.commence_time),target.officialTime?dt(target.officialTime):Infinity)<=now()+15*60000)continue;
 crosswalk.push({sport,eventId:e.id,homeTeam:e.home_team,awayTeam:e.away_team,commenceTime:e.commence_time,officialGameId:target.officialId,officialStartTimeUTC:target.officialTime,boardGame:target.boardGame,boardStart:target.boardStart,method:target.method,officialScheduleFresh:official.fresh,officialObservedAt:official.observedAt??null});
  const a=status.results[sport]??={status:'no_valid_pairs',rows:0,games:0,eventsQueried:0};
  if(now()-dt(source.observedAt)>=25*60000||dt(e.commence_time)<=now()+15*60000)continue;
  try{
   a.eventsQueried++;
   const data=await get(sports[sport].key+'/events/'+encodeURIComponent(e.id)+'/odds',{bookmakers:books.join(','),markets:markets.join(','),oddsFormat:'american'},markets.length);
   if(sport==='NFL'&&markets.includes('spreads')&&markets.includes('totals'))gameMarkets.push(...require('../src/nfl-pregame-game-market-v1.cjs').capture(data,e,new Date().toISOString(),books));
   const pairs=capturePairs(sport,e,markets.filter(k=>sports[sport].markets[k]),data,target);rows.push(...pairs);a.rows+=pairs.length;if(pairs.length){a.games++;a.status='fresh_two_sided_quotes';}
  }catch(e){status.failure=/^provider_http_\d+$/.test(e.message)?e.message:'request_or_contract_refused';break;}
 }
 status.gameMarketRows=gameMarkets.length;status.status=rows.length?'fresh_bounded_archive':'no_fresh_quotes';status.generatedAt=new Date().toISOString();status.reservedCredits=reserved.size*SPORT_CAP;status.plannedCreditsAttempted=planned;status.remainingCredits=remaining;status.eventCrosswalk=crosswalk;diagnostic();
 const rawName=status.generatedAt.replace(/[-:.]/g,'');
 fs.writeFileSync(DIR+'/capture-receipt-'+rawName+'.json',JSON.stringify({...status,rows,gameMarkets,source:'The Odds API',researchOnly:true})+'\n',{flag:'wx'});
 const archive={...status,rows,gameMarkets,source:'The Odds API',researchOnly:true,independentPlatformSettlementVerified:false};
 const consensus=study(archive,{now:status.generatedAt});
 const matches=[],seen=new Set(),bySport={NHL:{native:0,exactBoardGroups:0,matchedOfferSides:0},NFL:{native:0,exactBoardGroups:0,matchedOfferSides:0}};
 for(const q of consensus.groups){
  const a=bySport[q.sport];a.native++;
  const bridge=crosswalk.find(x=>x.sport===q.sport&&x.eventId===q.eventId);
  const candidates=board[q.sport].filter(p=>norm(p.player)===norm(q.player)&&p.market===q.market&&p.line===q.line&&p.teams===pair(norm(q.homeTeam),norm(q.awayTeam))&&bridge&&p.game===bridge.boardGame&&Math.abs(p.start-dt(bridge.officialStartTimeUTC||q.commenceTime))<=300000);
  if(new Set(candidates.map(p=>JSON.stringify([p.playerId,p.game]))).size!==1)continue;
  a.exactBoardGroups++;
  for(const p of candidates)for(const side of (p.side==='under_or_over'?['Higher','Lower']:p.side==='over'?['Higher']:['Lower'])){
   const k=JSON.stringify([q.sport,p.offerId,side]);if(seen.has(k))continue;seen.add(k);a.matchedOfferSides++;
   matches.push({sport:q.sport,player:q.player,market:q.market,line:q.line,side,tier:p.tier,sourceOfferId:p.offerId,providerPlayerId:p.playerId,eventId:q.eventId,books:q.books,consensusHigher:q.higher,consensusLower:q.lower,officialGameId:bridge.officialGameId,officialStartTimeUTC:bridge.officialStartTimeUTC,providerStartTimeUTC:q.commenceTime,eventMatchMethod:bridge.method,conditionalIdentityOnly:true});
  }
 }
 status.conditionalBoardMatches={bySport,sharedProviderIdsVerified:false,originalPlatformAvailabilityVerified:false};status.sourceNativeConsensusGroups=consensus.groups.length;
 fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(DIR+'/status-latest.json',JSON.stringify(status,null,2)+'\n');
 if(rows.length){
  const name=status.generatedAt.replace(/[-:.]/g,'');
  fs.writeFileSync(DIR+'/'+name+'.json',JSON.stringify({...archive,...status},null,2)+'\n');
  fs.writeFileSync(DIR+'/latest.json',JSON.stringify({...archive,...status},null,2)+'\n');
  for(const sport of reserved){fs.writeFileSync(DIR+'/status-'+sport+'-latest.json',JSON.stringify({...status,results:{[sport]:status.results[sport]},conditionalBoardMatches:{bySport:{[sport]:bySport[sport]},sharedProviderIdsVerified:false,originalPlatformAvailabilityVerified:false}},null,2)+'\n');}
  fs.writeFileSync(DIR+'/matched-board-latest.json',JSON.stringify({kind:'private_same_line_sportsbook_board_benchmark_v1',generatedAt:status.generatedAt,sourceBoardAt:source.observedAt,sourceBoardCommit:source.sha,bySport,matchedSides:matches.length,matches,researchOnly:true,sharedProviderIdsVerified:false,originalPlatformAvailabilityVerified:false,calibrated:false},null,2)+'\n');
 }
 console.log(JSON.stringify({status:status.status,requests:status.requests,credits:status.quotaCreditsReported,bySport,statusResults:status.results}));
}
if(require.main===module)main().catch(()=>{console.error('Bounded sportsbook capture failed closed; reservation prevents duplicate spending.');process.exitCode=1;});
module.exports={main};
