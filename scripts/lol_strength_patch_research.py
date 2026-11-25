"""Prior-date Elo, role/patch challengers; no outcome inferred from kills."""
from collections import defaultdict,deque
from statistics import mean
import json
from lol_specialist_research import get,read_players,complete_games,MARKETS
def evaluate(games):
    days=defaultdict(list);rating=defaultdict(lambda:1500.);h=defaultdict(lambda:deque(maxlen=20));patch=defaultdict(lambda:deque(maxlen=100));out=defaultdict(lambda:[0,0.,0.]);avail=0
    for a in games:days[a[0]["date"]].append(a)
    ds=sorted(days);cut=ds[int(.8*len(ds))] if len(ds)>=5 else None
    for day in ds:
        changes=defaultdict(float)
        for a in days[day]:
            ts=sorted({r["team"] for r in a});x,y=ts
            w={t:{r.get("won") for r in a if r["team"]==t} for t in ts}
            ok=set(map(frozenset,w.values()))=={frozenset({0}),frozenset({1})}
            if ok:
                p=1/(1+10**((rating[y]-rating[x])/400));delta=16*(next(iter(w[x]))-p);changes[x]+=delta;changes[y]-=delta;avail+=1
            for r in a:
                if not cut or day<cut:continue
                for m in MARKETS:
                    hist=h[r["player"],m]
                    if len(hist)<10:continue
                    base=mean(hist)
                    if ok:
                        prob=1/(1+10**((rating[r["opponent"]]-rating[r["team"]])/400));adj=1+(.2 if m in ("kills","assists") else -.2 if m=="deaths" else 0)*(prob-.5)
                        z=out[m+"|elo"];z[0]+=1;z[1]+=abs(base-r[m]);z[2]+=abs(base*adj-r[m])
                    c=patch[r["role"],r.get("patch"),m];g=patch[r["role"],None,m]
                    if r.get("patch") and len(c)>=10 and len(g)>=10 and mean(g)>0:
                        q=max(.85,min(1.15,(mean(c)/mean(g)+2)/3));z=out[m+"|role_patch"];z[0]+=1;z[1]+=abs(base-r[m]);z[2]+=abs(base*q-r[m])
        for t,d in changes.items():rating[t]+=d
        for a in sorted(days[day],key=lambda a:a[0]["event"]):
            for r in a:
                for m in MARKETS:
                    h[r["player"],m].append(r[m]);patch[r["role"],None,m].append(r[m])
                    if r.get("patch"):patch[r["role"],r["patch"],m].append(r[m])
    return {"holdoutStart":cut,"explicitResultGames":avail,"comparisons":{k:{"n":v[0],"baselineMAE":v[1]/v[0],"candidateMAE":v[2]/v[0]} for k,v in out.items() if v[0]},"priorDatesOnly":True,"conditionalObservedPatchRole":True}
def main():
    a=[]
    for y in (2025,2026):
        r,_=read_players(get(f"https://chaincc.lol/data/chaincc-players-{y}.csv.gz",25_000_000));a.extend(r)
    g,e=complete_games(a)
    print(json.dumps({"kind":"lol_strength_patch_research_v1","completeGames":len(g),"excluded":e,**evaluate(g),"actualPropLines":0,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()
