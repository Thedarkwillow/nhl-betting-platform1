"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {compareLines}=require("../src/lines.cjs");
async function main(){
  const root=path.join(__dirname,"..");
  const input=process.argv[2];
  if(!input) throw new Error("Usage: npm run compare:lines -- path/to/lines.json");
  const [lines,projections]=await Promise.all([
    fs.readFile(path.resolve(input),"utf8").then(JSON.parse),
    fs.readFile(path.join(root,"outputs/projections/players.json"),"utf8").then(JSON.parse)
  ]);
  const result=compareLines(lines,projections);
  const out=path.join(root,"outputs/line-comparisons");
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,"latest.json"),JSON.stringify(result,null,2)+"\n");
  console.log("Matched "+result.candidates.length+" lines; skipped "+result.skipped.length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
