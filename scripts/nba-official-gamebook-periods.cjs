'use strict';
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const NAMES={final:'FINAL BOX',q1:'1st QUARTER ONLY',q2:'2nd QUARTER ONLY',half:'FIRST HALF'};
const LIMIT={final:3960,q1:720,q2:720,half:1440};
const STAT=['points','rebounds','assists','steals','blocks','turnovers','threePointersMade'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const count=x=>Number.isSafeInteger(x)&&x>=0;
const canon=x=>x.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[.’']/g,'').replace(/\s+/g,' ').trim();
const cols=/^POS MIN FG FGA 3P 3PA FT FTA OR DR TOT A PF ST TO BS \+\/- PTS$/;
function sourceUrl(date,away,home){
 if(!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||
    ![away,home].every(t=>/^[A-Z]{3}$/.test(t))||away===home)return null;
 const key=date.replaceAll('-','');return 'https://statsdmz.nba.com/pdfs/'+key+'/'+key+'_'+away+home+'_book.pdf';
}
function row(parts,at,limit){
 const mt=/^(\d{1,3}):([0-5]\d)$/.exec(parts[at]||'');
 const values=parts.slice(at+1).map(Number);
 if(!mt||values.length!==16||parts.slice(at+1).some(x=>!/^[-+]?\d+$/.test(x))||values.some((x,i)=>i===14?!Number.isSafeInteger(x):!count(x)))return null;
 const seconds=60*Number(mt[1])+Number(mt[2]);
 const [fg,fga,three,threeAtt,ft,fta,orb,drb,reb,ast,,stl,to,blk,,pts]=values;
 if(seconds>limit||fg>fga||three>threeAtt||three>fg||threeAtt>fga||ft>fta||orb+drb!==reb||2*fg+three+ft!==pts||
    seconds===0&&values.some(x=>x!==0))return null;
 return {seconds,points:pts,rebounds:reb,assists:ast,steals:stl,blocks:blk,turnovers:to,threePointersMade:three};
}
function table(lines,scope){
 if(!lines.length||!cols.test(lines[0]))return null;
 const players=new Map(); let total;
 for(const line of lines.slice(1)){
  const p=line.split(' '),time=p.findIndex(x=>/^\d{1,3}:[0-5]\d$/.test(x));
  if(time===0){total=row(p,0,19800);break;}
  if(!/^\d{1,2}$/.test(p[0]))return null;
  const marker=p.indexOf('DNP');
  if(marker>=2&&p[marker+1]==='-'&&time<0){
   const name=canon(p.slice(1,marker).join(' '));
   if(!name||players.has(name))return null;
   players.set(name,{seconds:0,...Object.fromEntries(STAT.map(k=>[k,0]))});continue;
  }
  if(time<2)return null;
  const end=/^[FCG]$/.test(p[time-1])?time-1:time;
  const name=canon(p.slice(1,end).join(' ')),stats=row(p,time,LIMIT[scope]);
  if(!name||!stats||players.has(name))return null;
  players.set(name,stats);
 }
 if(!total||players.size<5||(scope==='final'?total.seconds<14400||total.seconds>19800:total.seconds!==LIMIT[scope]*5)||
    Math.abs([...players.values()].reduce((n,x)=>n+x.seconds,0)-total.seconds)>15||
    STAT.filter(k=>k!=='turnovers').some(k=>[...players.values()].reduce((n,x)=>n+x[k],0)!==total[k]))return null;
 return {players,total};
}
function sections(text,gameDate){
 if(typeof text!=='string'||text.length>2e6||!sourceUrl(gameDate,'AAA','BBB'))return null;
 const date=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(gameDate));
 const by={};
 for(const page of text.split('\f')){
  const lines=page.split('\n').map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
  if(lines[0]!=="NATIONAL BASKETBALL ASSOCIATION OFFICIAL SCORER'S REPORT")continue;
  const scope=Object.keys(NAMES).find(k=>lines[1]===NAMES[k]);
  if(!scope)continue;
  if(!lines[2]?.startsWith(date+' '))return null;
  const a=lines.findIndex(x=>x.startsWith('VISITOR: ')),h=lines.findIndex(x=>x.startsWith('HOME: '));
  if(a<0||h<=a)return null;
  const away=table(lines.slice(a+1,h),scope),home=table(lines.slice(h+1),scope);
  if(!away||!home)return null;
  const stage={away,home};
  const fingerprint=x=>JSON.stringify(x,(_k,v)=>v instanceof Map?[...v].sort(([a],[b])=>a.localeCompare(b)):v);
  if(by[scope]&&fingerprint(by[scope])!==fingerprint(stage))return null;
  by[scope]=stage;
 }
 if(!['final','q1','q2'].every(k=>by[k]))return null;
 for(const side of ['home','away']){
  if(by.q1[side].total.points+by.q2[side].total.points>by.final[side].total.points)return null;
  if(by.half&&STAT.some(k=>by.q1[side].total[k]+by.q2[side].total[k]!==by.half[side].total[k]))return null;
  if([by.q1,by.q2].some(q=>[...q[side].players.keys()].some(n=>!by.final[side].players.has(n))))return null;
 }
 return by;
}
function calculate(stages,finalPlayer,market){
 const periods=market==='1st_quarter_player_points'?['q1']:
   ['1st_half_player_points','1st_half_player_points_+_rebounds_+_assists'].includes(market)?['q1','q2']:null;
 if(!periods||!stages||!finalPlayer||finalPlayer.appeared!==true||typeof finalPlayer.home!=='boolean'||typeof finalPlayer.player!=='string')return null;
 const side=finalPlayer.home?'home':'away',name=canon(finalPlayer.player),full=stages.final[side].players.get(name);
 const data=periods.map(p=>stages[p][side].players.get(name));
 if(!full||!full.seconds||data.some(x=>!x)||!data.some(x=>x.seconds>0)||STAT.some(k=>finalPlayer[k]!==full[k]))return null;
 const sum=Object.fromEntries(STAT.map(k=>[k,data.reduce((n,x)=>n+x[k],0)]));
 const seconds=data.reduce((n,x)=>n+x.seconds,0);
 if(seconds>full.seconds+1||STAT.some(k=>sum[k]>full[k]))return null;
 if(periods.length===2&&stages.half){
  const half=stages.half[side].players.get(name);
  if(!half||Math.abs(seconds-half.seconds)>1||STAT.some(k=>sum[k]!==half[k]))return null;
 }
 return {scope:periods.length===1?'1st_quarter':'1st_half',periods,seconds,stats:sum,
   nativeValue:market.endsWith('assists')?sum.points+sum.rebounds+sum.assists:sum.points,
   originalSourceDisplayVerified:false,originalPlatformSettlementVerified:false,modelApproved:false};
}
function build({pdfPath,date,away,home,url,final,playerId,market,capturedAt}){
 const source=sourceUrl(date,away,home),d=final?.doc;
 if(!source||source!==url||!d||d.officialFinalClockVerified!==true||!/^[a-f0-9]{64}$/.test(final.digest||'')||
    !['nba_official_web_final_history_v1','nba_official_cdn_final_history_v1'].includes(d.kind)||
    !/^[a-f0-9]{64}$/.test(d.sourceResponseSha256||'')||
    !Number.isSafeInteger(d.gameId)||!Number.isSafeInteger(playerId)||!Number.isFinite(Date.parse(capturedAt))||
    !(Date.parse(d.startAt)<Date.parse(d.capturedAt)&&Date.parse(d.capturedAt)<=Date.parse(final.first)+999&&
      Date.parse(final.first)<=Date.parse(capturedAt))||!Array.isArray(d.rows))return null;
 const artifact=fs.readFileSync(pdfPath);
 if(artifact.length>3e6||artifact.subarray(0,5).toString()!=='%PDF-')return null;
 const pdfText=execFileSync('pdftotext',['-layout','-','-'],{input:artifact,encoding:'utf8',timeout:6000,maxBuffer:2e6});
 const parsed=sections(pdfText,date);
 const targets=d.rows.filter(p=>p.playerId===playerId&&p.gameId===d.gameId&&p.gameDate===date&&p.officialGameFinalVerified===true&&p.identityVerified===true&&
   typeof p.home==='boolean'&&p.team===(p.home?home:away)&&p.opponent===(p.home?away:home));
 if(!parsed||targets.length!==1)return null;
 for(const side of ['home','away']){
  const rows=d.rows.filter(p=>p.appeared===true&&p.home===(side==='home'));
  if(rows.length<5||rows.reduce((n,p)=>n+p.points,0)!==parsed.final[side].total.points)return null;
 }
 const result=calculate(parsed,targets[0],market);
 return result&&{kind:'nba_official_gamebook_period_research_v1',source:'NBA official scorer game book',sourceUrl:source,
   sourcePdfSha256:hash(artifact),nativeFinalDigest:final.digest,gameId:d.gameId,gameDate:date,playerId,
   capturedAt,market,retrospectiveOnly:true,...result};
}
module.exports={sourceUrl,sections,calculate,build};
