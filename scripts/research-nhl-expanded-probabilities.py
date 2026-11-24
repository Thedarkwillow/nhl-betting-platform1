#!/usr/bin/env python3
"""Private chronological source-level comparison, not actual offered lines."""
import collections as C
import importlib.util
import json, math
from pathlib import Path
spec=importlib.util.spec_from_file_location("context",Path(__file__).with_name("research-nhl-three-season-context.py"))
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
LINES={"shotsOnGoal":(1.5,2.5,3.5),"goals":(.5,1.5),"saves":(19.5,24.5,29.5,34.5)}
MODELS=("form","recent_rate","opponent_rate","quality_rate","quality_opponent","blended")
def mass(prior,mu,line):
    counts=[x[0] for x in prior[-30:]]
    center=lab.mean(counts)
    return (1+sum(max(0,math.floor(x-center+mu+.5))>line for x in counts))/(len(counts)+2)
def evaluate(rows):
    hist=C.defaultdict(lambda:C.deque(maxlen=60));teams=C.defaultdict(lambda:C.deque(maxlen=20));league=C.defaultdict(lambda:C.deque(maxlen=1200))
    days=C.defaultdict(list)
    for r in rows:days[r["day"]].append(r)
    results=C.defaultdict(lambda:C.defaultdict(lambda:[0,0.,0.,0.]))
    games=C.defaultdict(set);dates=C.defaultdict(set);appearances=C.Counter()
    for day,batch in sorted(days.items()):
        events=C.defaultdict(list);updates=[]
        for r in batch:
            events[r["game"]].append(r)
            for m,y in r["actual"].items():
                if m not in LINES:continue
                k=(r["player"],m);prior=list(hist[k]);metric="offenseSOG" if m=="saves" else m
                estimates=lab.estimates(prior,teams[(r["opponent"],metric)],league[metric])
                if len(prior)>=8 and estimates and r["season"] in (2024,2025):
                    group=(r["season"],m);games[group].add(r["game"]);dates[group].add(day);appearances[group]+=1
                    for name in MODELS:
                        a=results[group][name];p=estimates[name];a[3]+=abs(p-y)
                        for line in LINES[m]:
                            q=mass(prior,p,line);actual=int(y>line)
                            a[0]+=1;a[1]+=(q-actual)**2;a[2]-=math.log(q if actual else 1-q)
                updates.append((k,(y,r["toi"],r["quality"][m])))
        for k,value in updates:hist[k].append(value)
        for event in events.values():
            skaters=[r for r in event if r["role"]=="skaters"]
            by=C.defaultdict(list)
            for r in skaters:by[r["team"]].append(r)
            if len(by)!=2 or any(len(v)!=18 for v in by.values()):continue
            for t,a in by.items():
                other=next(x for x in by if x!=t)
                if any(r["opponent"]!=other for r in a):raise ValueError("opponent identity conflict")
                for metric,market,source in (("shotsOnGoal","shotsOnGoal",by[other]),("goals","goals",by[other]),("offenseSOG","shotsOnGoal",a)):
                    v=sum(r["actual"][market] for r in source)
                    teams[t,metric].append(v);league[metric].append(v)
    def metrics(k):
        return {name:{"thresholds":v[0],"brier":v[1]/v[0],"logLoss":v[2]/v[0],"mae":v[3]/appearances[k]} for name,v in results[k].items() if v[0]}
    markets={}
    for m in LINES:
        train,test=(2024,m),(2025,m);a,b=metrics(train),metrics(test)
        selected=min(MODELS,key=lambda x:(a[x]["brier"],MODELS.index(x))) if set(a)==set(MODELS) and appearances[train]>=100 and len(dates[train])>=20 else None
        markets[m]={"trainingAppearances":appearances[train],"evaluationAppearances":appearances[test],"evaluationGames":len(games[test]),"evaluationDates":len(dates[test]),"selectedOnTrainingBrierOnly":selected,"training":a,"evaluation":b}
    return {"kind":"nhl_multi_season_fixed_probability_ablation_v1","warmupSeason":2023,"trainingSeason":2024,"evaluationSeason":2025,"markets":markets,"syntheticThresholds":True,"historicalSourceAvailabilityAsOfVerified":False,"conditionalOnObservedAppearance":True,"goalieStartingStatusVerified":False,"actualOfferLines":False,"calibrated":False,"modelPromoted":False}
def main():
    rows=[]
    for year in lab.SEASONS:
        for role in ("skaters","goalies"):rows.extend(lab.download_archive(year,role))
    report=evaluate(rows)
    if any(x["evaluationAppearances"]<100 or not x["selectedOnTrainingBrierOnly"] for x in report["markets"].values()):raise ValueError("insufficient complete historical evaluation")
    dest=Path("outputs/backtests/nhl-expanded-probabilities-latest.json")
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,indent=2)+"\n")
    print("Historical probability ablation saved privately.")
if __name__=="__main__":main()
