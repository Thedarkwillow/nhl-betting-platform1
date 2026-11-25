"""Prior-only per-team win rates and opponent allowance; conditional team identities."""
from collections import defaultdict,Counter
from statistics import mean
from datetime import date
def evaluate(rows,markets,exposure):
    games=defaultdict(list)
    for r in rows:
        if r.get("team") and r.get("opponent") and type(r.get(exposure)) is int and r[exposure]>0:games[r["event"]].append(r)
    days=defaultdict(list)
    for a in games.values():
        if len(a)!=10 or len({r["player"] for r in a})!=10 or len({r["date"] for r in a})!=1 or len({r[exposure] for r in a})!=1:continue
        counts=Counter(r["team"] for r in a)
        if sorted(counts.values())!=[5,5] or any(r["team"]==r["opponent"] or r["opponent"] not in counts for r in a):continue
        if any(not all(type(r.get(m)) is int and r[m]>=0 for m in markets) for r in a):continue
        days[a[0]["date"]].append(a)
    dates=sorted(days);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    p=defaultdict(list);allow=defaultdict(list);length=defaultdict(list);global_rate=defaultdict(list);scores=defaultdict(lambda:[0,0.,0.,0.])
    for day in dates:
        for a in days[day]:
            for r in a:
                if not cut or day<cut:continue
                old=p[r["player"]][-20:];own=length[r["team"]][-20:];opp=length[r["opponent"]][-20:]
                if len(old)<10 or len(own)<5 or len(opp)<5:continue
                expected=(10*mean(x[exposure] for x in old[-5:])+sum(own)+sum(opp))/(10+len(own)+len(opp))
                for m in markets:
                    o=allow[r["opponent"],m][-100:];g=global_rate[m][-1000:]
                    if len(o)<20 or len(g)<100 or mean(g)<=0:continue
                    baseline=mean(x[m] for x in old);rate=sum(x[m] for x in old)/sum(x[exposure] for x in old)
                    adj=max(.85,min(1.15,(mean(o)/mean(g)*len(o)+100)/(len(o)+100)))
                    z=scores[m];z[0]+=1;z[1]+=abs(baseline-r[m]);z[2]+=abs((baseline+rate*expected)/2-r[m]);z[3]+=abs((baseline+rate*expected*adj)/2-r[m])
        for a in days[day]:
            for t in {r["team"] for r in a}:length[t].append(a[0][exposure])
            for r in a:
                p[r["player"]].append(r)
                for m in markets:
                    rate=r[m]/r[exposure];allow[r["opponent"],m].append(rate);global_rate[m].append(rate)
    return {"kind":"esports_opponent_strength_research_v1","completeMaps":sum(len(x) for x in days.values()),"holdoutStart":cut,"markets":{m:{"n":z[0],"last20MAE":z[1]/z[0],"exposureBlendMAE":z[2]/z[0],"opponentStrengthBlendMAE":z[3]/z[0]} for m,z in scores.items() if z[0]},"priorDatesOnly":True,"observedTeamConditional":True,"modelPromoted":False,"actualPropLines":0}
