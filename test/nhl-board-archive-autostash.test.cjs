"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {execFileSync,spawnSync}=require("node:child_process");
const ROOT=path.resolve(__dirname,"..");
function read(p){return fs.readFileSync(path.join(ROOT,p),"utf8");}
test("any permitted NHL vendor archival rebase autostashes while retired 09:00 makes zero paid calls",()=>{
 const text=read(".github/workflows/trial-free-prizepicks-nhl.yml");
 const rebases=text.match(/^\s*git (?:-c rebase\.autoStash=true )?rebase -X theirs origin\/main\s*$/gm)||[];
 assert.ok(rebases.length>=2,"Allowed collector must safely sync source and first-Git preview archives");
 assert.ok(rebases.every(x=>x.includes("-c rebase.autoStash=true")),
  "No plain git rebase with a dirty working tree");
 assert.match(text,/git add -f outputs\/free-source\/nhl\/latest\.json/);
 const paused=read(".github/workflows/nhl-0900-board-delta.yml");
 assert.match(paused,/Metered NHL 9 AM Collector Paused/);
 assert.match(paused,/No Vendor Calls/);
 assert.doesNotMatch(paused,/^\s+schedule:/m);
 assert.doesNotMatch(paused,/git\s+rebase|collect-prizepicks-asof-nhl\.cjs|secrets\.PRIZEPICKSAPI_KEY/);
});
test("Git can preserve unrelated generated tracked changes while rebasing complete NHL board commit",()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"nhl-board-rebase-"));
 const git=(...args)=>execFileSync("git",args,{cwd:folder,encoding:"utf8",stdio:"pipe"}).trim();
 try{
  git("init","-b","main");
  git("config","user.email","ci@example.invalid");
  git("config","user.name","NHL Test");
  fs.writeFileSync(path.join(folder,"models.json"),"prior model\n");
  fs.writeFileSync(path.join(folder,"main.txt"),"a\n");
  git("add",".");git("commit","-m","base");
  git("checkout","-b","capture");
  fs.writeFileSync(path.join(folder,"board.json"),'{"complete":true,"saved":"before_game"}\n');
  git("add","board.json");git("commit","-m","capture original board");
  git("checkout","main");
  fs.writeFileSync(path.join(folder,"main.txt"),"updated main\n");
  git("add","main.txt");git("commit","-m","concurrent main data update");
  git("checkout","capture");
  fs.writeFileSync(path.join(folder,"models.json"),"new projection not in this commit\n");
  const plain=spawnSync("git",["rebase","main"],{cwd:folder,encoding:"utf8"});
  assert.notEqual(plain.status,0,"plain rebase must fail on local changes");
  git("-c","rebase.autoStash=true","rebase","-X","theirs","main");
  assert.equal(fs.readFileSync(path.join(folder,"models.json"),"utf8"),
   "new projection not in this commit\n");
  assert.equal(fs.readFileSync(path.join(folder,"board.json"),"utf8"),
   '{"complete":true,"saved":"before_game"}\n');
  assert.equal(fs.readFileSync(path.join(folder,"main.txt"),"utf8"),"updated main\n");
  assert.match(git("status","--porcelain"),/models\.json/);
  assert.match(git("log","-1","--pretty=%s"),/capture original board/);
 }finally{fs.rmSync(folder,{force:true,recursive:true});}
});