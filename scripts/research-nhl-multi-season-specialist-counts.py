#!/usr/bin/env python3
"""Synthetic count research; missing specialist fields remain unavailable, not zero."""
import collections as C, importlib.util, json, math
from pathlib import Path
spec=importlib.util.spec_from_file_location("core",Path(__file__).with_name("research-nhl-expanded-probabilities.py"))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
base=core.lab.normalize
LINES={"assists":(.5,1.5),"points":(.5,1.5,2.5),"hits":(1.5,2.5,3.5),"blockedShots":(.5,1.5,2.5),"faceoffsWon":(4.5,7.5,10.5)}
def optional(row,key):
    try:
        v=core.lab.nonnegative(row.get(key))
        return int(v) if v.is_integer() else None
    except (ValueError,TypeError):return None
def normalize(row,season,role):
    r=base(row,season,role)
    if not r or role!="skaters":return r
    a,b=optional(row,"I_F_primaryAssists"),optional(row,"I_F_secondaryAssists")
    if a is not None and b is not None:
        r["actual"]["assists"]=a+b
        p=optional(row,"I_F_points")
        if p is not None and p==r["actual"]["goals"]+a+b:r["actual"]["points"]=p
    for name,key in (("hits","I_F_hits"),("blockedShots","shotsBlockedByPlayer"),("faceoffsWon","I_F_faceOffsWon")):
        v=optional(row,key)
        if v is not None:r["actual"][name]=v
    return r
def evaluate(rows):
    prior=C.defaultdict(lambda:C.deque(maxlen=60));days=C.defaultdict(list);result=C.defaultdict(lambda:C.defaultdict(lambda:[0,0.,0.,0.]))
    games=C.defaultdict(set);dates=C.defaultdict(set);counts=C.Counter();available=C.Counter()
    for r in rows:days[r["day"]].append(r)
    for day,batch in sorted(days.items()):
        updates=[]
        for r in batch:
            for m,lines in LINES.items():
                if m not in r["actual"]:continue
                y=r["actual"][m];group=(r["season"],m);available[group]+=1
                k=(r["player"],m);hist=list(prior[k]);updates.append((k,(y,r["toi"],0)))
                if len(hist)<8 or r["season"] not in (2024,2025):continue
                last=hist[-20:];expected=.65*core.lab.mean(x[1] for x in last[-10:])+.35*core.lab.mean(x[1] for x in last[-5:])
                form=.5*core.lab.mean(x[0] for x in hist[-5:])+.3*core.lab.mean(x[0] for x in hist[-10:])+.2*core.lab.mean(x[0] for x in hist)
                rate=sum(x[0] for x in last)*expected/sum(x[1] for x in last)
                models={"form":form,"recent_rate":rate,"blend":.5*(rate+form)}
                counts[group]+=1;games[group].add(r["game"]);dates[group].add(day)
                for name,p in models.items():
                    v=result[group][name];v[3]+=abs(p-y)
                    for line in lines:
                        q=core.mass(hist,p,line);actual=int(y>line);v[0]+=1;v[1]+=(actual-q)**2;v[2]-=math.log(q if actual else 1-q)
        for k,v in updates:prior[k].append(v)
    def metrics(k):return {name:{"thresholds":v[0],"brier":v[1]/v[0],"logLoss":v[2]/v[0],"mae":v[3]/counts[k]} for name,v in result[k].items() if v[0]}
    markets={}
    for m in LINES:
        a,b=(2024,m),(2025,m);train,test=metrics(a),metrics(b)
        selected=min(train,key=lambda n:(train[n]["brier"],n)) if counts[a]>=100 and len(dates[a])>=20 else None
        markets[m]={"trainingSourceRows":available[a],"evaluationSourceRows":available[b],"trainingAppearances":counts[a],"evaluationAppearances":counts[b],"evaluationGames":len(games[b]),"evaluationDates":len(dates[b]),"selectedOnTrainingOnly":selected,"training":train,"evaluation":test,"status":"evaluated" if selected and counts[b]>=100 else "insufficient_verified_source"}
    return {"kind":"nhl_specialist_multi_season_synthetic_count_v1","markets":markets,"source":"MoneyPuck archives; only explicit nonnegative count fields","actualOfferLines":False,"conditionalOnAppearance":True,"calibrated":False,"modelPromoted":False}
def main():
    core.lab.normalize=normalize
    rows=[]
    for season in core.lab.SEASONS:rows.extend(core.lab.download_archive(season,"skaters"))
    report=evaluate(rows);path=Path("outputs/backtests/nhl-multi-season-specialist-counts-latest.json");path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2)+"\n")
    print("Private specialist count report saved.")
if __name__=="__main__":main()
