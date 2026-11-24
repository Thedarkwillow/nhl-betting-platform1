"use strict";
const fs=require("node:fs");
const path=require("node:path");
function parseCsv(input){
  const rows=[];let row=[],field="",quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field="";}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==""))rows.push(row);row=[];field="";}
    else field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  if(quoted)throw new Error("Unclosed quoted CSV field");
  const headers=rows.shift().map(x=>x.replace(/^\uFEFF/,""));
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
}
const markets={"Shots on Goal":"shotsOnGoal","Goals":"goals","Points":"points","Assists":"assists","Goalie Saves":"saves","Blocked Shots":"blockedShots"};
const key=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function alias(s){
  const parts=String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
  if(parts.length<2)return "";
  return parts[0][0]+"|"+parts.slice(1).join("");
}
function convert(rows,history){
  const players=Array.isArray(history.players)?history.players:Object.values(history.players||{});
  const byName=new Map(),byAlias=new Map();
  for(const p of players){const k=key(p.playerName||p.name);if(!k)continue;const list=byName.get(k)||[];list.push(p);byName.set(k,list);
    const a=alias(p.playerName||p.name);if(a){const aliases=byAlias.get(a)||[];aliases.push(p);byAlias.set(a,aliases);}
  }
  const accepted=[],excluded=[],unmatched=[];
  for(const r of rows){
    if(r.league!=="NHL")continue;
    const market=markets[r.prop_type];
    if(!market){excluded.push({player:r.player,market:r.prop_type,reason:"unsupported or period-specific market"});continue;}
    // Position labels occasionally appear in the source's team column.
    // Recover a team only when the matchup explicitly identifies it and
    // the player has exactly one matching historical roster team.
    let sourceTeam=String(r.team||"").trim().toUpperCase();
    const positionLabels=new Set(["C","LW","RW","D","G","F","W","CENTER","LEFT WING","RIGHT WING","DEFENSE","GOALIE"]);
    if(positionLabels.has(sourceTeam)){
      const teams=String(r.matchup||"").toUpperCase().match(/\b[A-Z]{3}\b/g)||[];
      const eligible=players.filter(p=>key(p.playerName||p.name)===key(r.player)||alias(p.playerName||p.name)===alias(r.player));
      const rosterTeams=[...new Set(eligible.map(p=>String(p.team||"").toUpperCase()).filter(t=>teams.includes(t)))];
      sourceTeam=rosterTeams.length===1?rosterTeams[0]:"";
      if(!sourceTeam){unmatched.push({player:r.player,team:r.team,market:r.prop_type,reason:"position shown instead of team; matchup unresolved"});continue;}
    }
    const exact=byName.get(key(r.player))||[];
    const candidates=exact.length?exact:(byAlias.get(alias(r.player))||[]);
    // Fail closed on team mismatch or ambiguous abbreviated names.
    const candidatesToUse=candidates.filter(p=>!sourceTeam||!p.team||key(p.team)===key(sourceTeam));
    if(candidatesToUse.length!==1){unmatched.push({player:r.player,team:r.team,market:r.prop_type,reason:candidatesToUse.length?"ambiguous player":candidates.length?"team mismatch":"player not found"});continue;}
    const p=candidatesToUse[0],playerId=Number(p.playerId);
    if(!Number.isInteger(playerId)){unmatched.push({player:r.player,reason:"missing NHL player ID"});continue;}
    const line=Number(r.line);
    if(!Number.isFinite(line)||line<0){excluded.push({player:r.player,reason:"invalid line"});continue;}
    const capturedAt=r.extracted_at_utc;
    if(!Number.isFinite(Date.parse(capturedAt))){excluded.push({player:r.player,reason:"invalid timestamp"});continue;}
    accepted.push({source:"PickFinder",playerId,playerName:r.player,market,line,capturedAt,team:sourceTeam,matchup:r.matchup,providerUrl:r.player_prop_url});
  }
  return {lines:accepted,summary:{inputRows:rows.length,accepted:accepted.length,excluded:excluded.length,unmatched:unmatched.length},excluded,unmatched};
}
function main(){
  const file=process.argv[2];if(!file)throw new Error("Usage: node scripts/import-pickfinder-csv.cjs <csv>");
  const rows=parseCsv(fs.readFileSync(file,"utf8"));
  const history=JSON.parse(fs.readFileSync("outputs/history/players.json","utf8"));
  const result=convert(rows,history);
  fs.mkdirSync("outputs/pickfinder",{recursive:true});
  fs.writeFileSync("outputs/pickfinder/import-latest.json",JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result.summary));
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={parseCsv,convert};
