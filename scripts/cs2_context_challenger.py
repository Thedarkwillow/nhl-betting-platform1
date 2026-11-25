"""Prior-date-only KDA challenger; exact same holdout observations for all comparisons."""
from collections import defaultdict,Counter
from statistics import mean
def evaluate(rows,markets=("kills","deaths","assists")):
    dates=sorted({r["date"] for r in rows});cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    days=defaultdict(list)
    for r in rows:days[r["date"]].append(r)
    h=defaultdict(list);t=defaultdict(list);opp=defaultdict(list);scores=defaultdict(lambda:[0,0.,0.,0.,0.])
    for day in dates:
        batch=days[day]
        for r in batch:
            if not cut or day<cut:continue
            a=h[r["player"]]
            if len(a)<10:continue
            recent=a[-20:];same=t[r["player"],r["team"]][-20:]
            if len(same)<5 or any(x["rounds"]<=0 for x in recent):continue
            # Use previous rounds only, not the actual duration of this map.
            rounds=mean(x["rounds"] for x in recent)
            for m in markets:
                base=mean(x[m] for x in recent)
                team=(len(same)*mean(x[m] for x in same)+10*base)/(len(same)+10)
                pace=sum(x[m] for x in recent)/sum(x["rounds"] for x in recent)*rounds
                # Prior player maps of the same map name; conditional on map known.
                mp=[x for x in a if x["map"]==r["map"]][-20:]
                if len(mp)<3:continue
                p=(len(mp)*mean(x[m] for x in mp)+10*team)/(len(mp)+10)
                z=scores[m];z[0]+=1;z[1]+=abs(base-r[m]);z[2]+=abs(team-r[m]);z[3]+=abs(p-r[m]);z[4]+=abs(pace-r[m])
        for r in sorted(batch,key=lambda x:(x["event"],x["player"])):
            h[r["player"]].append(r);t[r["player"],r["team"]].append(r)
    return {"holdoutStart":cut,"markets":{m:{"n":z[0],"last20MAE":z[1]/z[0],"sameTeamShrinkageMAE":z[2]/z[0],"sameTeamMapShrinkageMAE":z[3]/z[0],"priorRoundRateMAE":z[4]/z[0]} for m,z in scores.items() if z[0]},"priorDatesOnly":True,"observedMapConditional":True,"actualPropLines":0,"modelPromoted":False}
