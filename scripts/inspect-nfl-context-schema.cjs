"use strict";
const fs=require("node:fs"),zlib=require("node:zlib"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const datasets=["player_weekly","team_weekly","snap_counts","weekly_rosters",
 "injuries","ftn_charting_research_only","schedule"];
for(const dataset of datasets){
 const f=path.join(ROOT,"outputs/nfl/history/2025",dataset+".json.gz");
 if(!fs.existsSync(f)){console.log(JSON.stringify({dataset,missing:true}));continue;}
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8"));
 const sample=data.rows.find(x=>Number(x.week)===8)??data.rows[0];
 const keys=["season","week","season_type","player_id","position","recent_team","team",
 "opponent_team","opponent","game_id","home_team","away_team",
 "passing_yards","rushing_yards","receiving_yards","attempts","carries",
 "targets","snap_count","offense_snaps","offense_pct","offense_snaps_pct",
 "air_yards","pass","run","defense","team_id","fte"];
 const vals={};for(const k of keys)if(Object.hasOwn(sample,k))vals[k]=sample[k];
 console.log(JSON.stringify({dataset,rows:data.rows.length,
  columns:data.columns,exampleFields:vals}));
}
