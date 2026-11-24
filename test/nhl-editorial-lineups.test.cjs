"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseGame,articleLinks,sourceHealth}=require("../src/nhl-editorial-lineups.cjs");
const {buildRoleGoalieShadow,readRole}=require("../src/nhl-dfo-role-goalie-shadow.cjs");
const at="2026-11-14T18:00:00Z",start="2026-11-15T00:00:00Z";
const g={id:2026020301,away:"BOS",home:"NYR",gameDate:"2026-11-14",startTimeUTC:start};
const url="https://www.nhl.com/news/boston-bruins-new-york-rangers-game-preview-november-14-2026";
function fixture(){
 const rosters={},blocks=[];
 for(const [team,name,offset] of [["BOS","Bruins",100],["NYR","Rangers",200]]){
  const r={forwards:[],defensemen:[],goalies:[]};rosters[team]=r;blocks.push("<p><strong>"+name+" projected lineup</strong></p>");
  for(let i=0;i<20;i++){
   const p={id:offset+i,firstName:{default:"Player"},lastName:{default:team+i}};
   r[i<12?"forwards":i<18?"defensemen":"goalies"].push(p);
  }
  for(let i=0;i<12;i+=3)blocks.push("<p>"+[i,i+1,i+2].map(j=>"Player "+team+j).join(" &ndash; ")+"</p>");
  for(let i=12;i<18;i+=2)blocks.push("<p>Player "+team+i+" -- Player "+team+(i+1)+"</p>");
  blocks.push("<p>Player "+team+"18<br>Player "+team+"19</p><p>Scratched: Player "+team+"0</p><p>Injured:</p>");
 }
 blocks.push("<p>Status report</p>");
 return {html:blocks.join(""),rosters};
}
test("exact dated link and roster-matched editorial projected groups; no PP or confirmed starter",()=>{
 const {html,rosters}=fixture(),x=parseGame(html,g,rosters,at,url);
 assert.deepEqual(articleLinks('<a href="'+url+'">Preview</a>',g),[url]);
 assert.equal(x.teams[0].players.length,17);
 assert.equal(x.teams[0].goalies.length,2);assert.equal(x.teams[0].goalies[0].starterConfirmed,false);
 assert.equal(x.teams[0].players[0].powerPlayGroup,null);
 assert.equal(x.teams[0].availability[0].playerId,100);
 assert.throws(()=>parseGame(html,g,rosters,start,url));
 assert.throws(()=>parseGame(html,g,rosters,at,url.replace("14-2026","13-2026")));
});
test("editorial fallback is research only and refuses flagged player and goalie start promotion",()=>{
 const {html,rosters}=fixture(),ed=parseGame(html,g,rosters,at,url);
 const approved={generatedAt:at,dailyFaceoff:{games:[],lineups:{}},nhlEditorial:{games:[ed]},moneyPuck:{}};
 const p={playerId:101,gameId:g.id,team:"BOS",opponent:"NYR",eventStartsAt:start,capturedAt:at,projection:2.8,market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher"};
 const x=buildRoleGoalieShadow({rankedProps:[p,{...p,playerId:100},{...p,playerId:118,market:"saves"}]},approved,at);
 assert.equal(x.counts.skaterRoleCandidates,1);assert.equal(x.counts.conditionalGoalieCandidates,0);
 assert.equal(x.rows[0].role.sourceProvider,"NHL.com editorial game preview");
 assert.equal(x.rows[0].role.powerPlayGroup,null);assert.equal(x.modelDeployed,false);
 assert.equal(readRole({...p,playerId:100},approved,at).role,null);
 assert.equal(sourceHealth([g],[],{},[ed],[{provider:"Daily Faceoff goalies",reason:"HTTP 403"}]).dfoStatus,"access_denied_partial_or_unavailable");
});
