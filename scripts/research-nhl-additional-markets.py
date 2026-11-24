#!/usr/bin/env python3
"""Private historical NHL additional-market research using published MoneyPuck game archives.
Numeric stat forecasts only. Missing provider fields are not zeros."""
import collections as C
import csv, io, json, math, urllib.request, zipfile
from pathlib import Path
from datetime import date
from research_nhl_import import load_three_season
lab=load_three_season()
FIELDS={"assists":("I_F_primaryAssists","I_F_secondaryAssists"),"points":("I_F_points",),
        "hits":("I_F_hits",),"blockedShots":("shotsBlockedByPlayer",),"faceoffsWon":("faceoffsWon",)}
MARKETS=tuple(FIELDS)
def normalize(row,season):
    base=lab.normalize(row,season,"skaters")
    if base is None:return None
    a={}
    for name,cols in FIELDS.items():
        if not all(k in row and str(row[k] or "").strip() for k in cols):continue
        v=sum(lab.nonnegative(row[k]) for k in cols)
        if not v.is_integer():raise ValueError("noninteger additional count")
        a[name]=v
    base["extra"]=a
    return base
def download(season):
    req=urllib.request.Request(lab.BASE+f"skaters/{season}.zip",headers={"User-Agent":"Private-NHL-Research/1.0"})
    with urllib.request.urlopen(req,timeout=65) as r:data=r.read(100_000_001)
    if len(data)>100_000_000:raise ValueError("archive bound")
    rows=[];seen=set();schema=C.Counter()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members=[m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".csv")]
        if not members or sum(m.file_size for m in members)>500_000_000:raise ValueError("archive bounds")
        for m in members:
            with z.open(m) as raw:
                reader=csv.DictReader(io.TextIOWrapper(raw,encoding="utf-8-sig",newline=""))
                if not reader.fieldnames or not {"gameId","playerId","situation"}.issubset(reader.fieldnames):continue
                schema.update(key for key in reader.fieldnames if any(t in key.lower() for t in ("faceoff","block","assist","point","hit")))
                for row in reader:
                    x=normalize(row,season)
                    if x is None:continue
                    key=(x["game"],x["player"])
                    if key in seen:raise ValueError("duplicate player game")
                    seen.add(key);rows.append(x)
    if len(rows)<30000:raise ValueError("incomplete season")
    return rows,dict(schema)
def candidates(prior,opp,league):
    if len(prior)<5 or len(opp)<5 or len(league)<20:return None
    p=[x[0] for x in prior];last=prior[-20:];ten=prior[-10:];five=prior[-5:]
    ref=lab.mean(league)
    if ref<=0:return None
    seconds=.65*lab.mean(x[1] for x in ten)+.35*lab.mean(x[1] for x in five)
    rate=sum(x[0] for x in last)*seconds/sum(x[1] for x in last)
    factor=max(.8,min(1.2,1+(lab.mean(opp)/ref-1)*len(opp)/(len(opp)+20)))
    baseline=.5*lab.mean(p[-5:])+.3*lab.mean(p[-10:])+.2*lab.mean(p)
    return {"form":baseline,"prior_mean":lab.mean(p),"usage_rate":rate,"opponent_rate":rate*factor,"blend":.5*baseline+.5*rate*factor}
def evaluate(rows):
    by_day=C.defaultdict(list);history=C.defaultdict(list);teams=C.defaultdict(lambda:C.deque(maxlen=20));league=C.defaultdict(lambda:C.deque(maxlen=1200))
    errors=C.defaultdict(lambda:C.defaultdict(lambda:[0,0.,0.,0.]));count=C.Counter();available=C.Counter();dates=C.defaultdict(set);games=C.defaultdict(set)
    for r in rows:by_day[r["day"]].append(r)
    for day,group in sorted(by_day.items()):
        updates=[];by_game=C.defaultdict(list)
        for r in group:
            by_game[r["game"]].append(r)
            for market,actual in r["extra"].items():
                key=(r["player"],market);available[(r["season"],market)]+=1
                f=candidates(history[key],teams[(r["opponent"],market)],league[market])
                if f is not None and r["season"] in (2024,2025):
                    k=(r["season"],market);count[k]+=1;dates[k].add(day);games[k].add(r["game"])
                    for n,v in f.items():
                        e=v-actual;a=errors[k][n];a[0]+=1;a[1]+=abs(e);a[2]+=e*e;a[3]+=e
                updates.append((key,(actual,r["toi"])))
        for k,v in updates:history[k].append(v)
        for group in by_game.values():
            by_team=C.defaultdict(list)
            for r in group:by_team[r["team"]].append(r)
            if len(by_team)!=2 or any(len(x)!=18 for x in by_team.values()):continue
            for t,own in by_team.items():
                other=next(x for x in by_team if x!=t);attack=by_team[other]
                if any(x["opponent"]!=other for x in own):raise ValueError("opponent mismatch")
                for m in MARKETS:
                    # Blocking opportunity uses opponent shots generated; not blocks allowed.
                    source=own if m=="blockedShots" else attack
                    if m=="blockedShots":v=sum(x["actual"]["shotsOnGoal"] for x in source)
                    elif all(m in x["extra"] for x in source):v=sum(x["extra"][m] for x in source)
                    else:continue
                    teams[(t,m)].append(v);league[m].append(v)
    def score(k):
        return {n:{"mae":round(a[1]/a[0],6),"rmse":round(math.sqrt(a[2]/a[0]),6),"bias":round(a[3]/a[0],6)} for n,a in errors[k].items() if a[0]}
    result={}
    for m in MARKETS:
        a,b=(2024,m),(2025,m);train,test=score(a),score(b)
        chosen=min(train,key=lambda n:train[n]["mae"]) if count[a]>=100 and len(dates[a])>=20 else None
        result[m]={"sourceRowsBySeason":{str(s):available[(s,m)] for s in (2023,2024,2025)},"trainRows":count[a],"testRows":count[b],"testGames":len(games[b]),"testDates":len(dates[b]),"selectedFrom2024Only":chosen,"training":train,"evaluation":test,"status":"evaluated" if chosen and count[b]>=100 else "insufficient_source_or_history"}
    return {"kind":"nhl_additional_market_moneypuck_stat_research_v1","source":"MoneyPuck.com","markets":result,"modelPromoted":False,"prospective":False,"sourceRowsPublic":False,"limitations":"Date embargo; observed participation; historical seasons already inspected. Numeric-stat error only; hits and faceoff context proxy unvalidated. No original platform settlement or ROI."}
def main():
    rows=[];schemas={}
    for season in (2023,2024,2025):
        data,schema=download(season);rows.extend(data);schemas[str(season)]=schema
    report=evaluate(rows);report["providerFieldInventory"]=schemas
    if not any(v["status"]=="evaluated" for v in report["markets"].values()):raise ValueError("no validated extra markets")
    out=Path("outputs/backtests/nhl-extended-market-context-latest.json");out.write_text(json.dumps(report,indent=2)+"\n")
if __name__=="__main__":main()
