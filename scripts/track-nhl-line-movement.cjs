"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/board-snapshots/prizepicks");
const files=fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort();
if(files.length<2){console.log("Need two snapshots to detect movement");process.exit(0);}
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
const {diffBoards}=require("../src/nhl-line-movement.cjs");
const result=diffBoards(read(files.at(-2)),read(files.at(-1)));
const out=path.join(root,"outputs/line-movement/nhl-latest.json");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({changes:result.changes.length,removalsVerified:result.removalsVerified}));
