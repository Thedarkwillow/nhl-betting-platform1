"use strict";
const fs=require("node:fs"),path=require("node:path"),{boxes,evaluate}=require("../src/nba-pinnacle-independent-replay-v1.cjs");
const root=path.resolve(__dirname,".."),archive=process.env.NBA_REAL_LINE_ARCHIVE||path.join(root,"outputs/nba/research/pinnacle-2026-10-24-to-31-nba.csv");
async function load(season){
 const url="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_"+season+".csv";
 const res=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(90000)});
 if(!res.ok)throw Error("historical box download HTTP "+res.status);
 const reader=res.body.getReader(),chunks=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024){await reader.cancel();throw Error("box CSV exceeds bounded size");}chunks.push(Buffer.from(value));}
 const raw=Buffer.concat(chunks).toString("utf8");
 const sha256=require("node:crypto").createHash("sha256").update(raw).digest("hex");
 return {data:boxes(raw,season),source:{url,sha256,bytes:size}};
}
async function main(){
 const [prior,current]=await Promise.all([load(2026),load(2027)]);
 const report=evaluate(fs.readFileSync(archive,"utf8"),prior.data,current.data);
 console.log(JSON.stringify({...report,sourceDigests:[prior.source,current.source],sourceSeasonCompletenessCertified:false},null,2));
}
if(require.main===module)main().catch(e=>{console.error(String(e.message).slice(0,300));process.exitCode=1;});
