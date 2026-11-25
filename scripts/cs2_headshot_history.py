"""Separate Steam-native headshot count forecasts, no actual current-map input."""
from collections import defaultdict,Counter
from statistics import mean
def evaluate(rows):
    seen=Counter((r["event"],r["player"]) for r in rows)
    clean=[r for r in rows if seen[r["event"],r["player"]]==1 and all(type(r.get(k)) is int and r[k]>=0 for k in ("kills","headshots","rounds")) and 0<=r["headshots"]<=r["kills"] and r["rounds"]>0]
    days=defaultdict(list);history=defaultdict(list)
    for r in clean:days[r["date"]].append(r)
    dates=sorted(days);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    scores=[0,0.,0.,0.]
    for day in dates:
        for r in days[day]:
            a=history[r["player"]][-20:]
            if not cut or day<cut or len(a)<10:continue
            k=sum(x["kills"] for x in a);hs=sum(x["headshots"] for x in a);rnd=sum(x["rounds"] for x in a)
            if not k or not rnd:continue
            # Estimated counts use previous maps only. Do not multiply by the actual current kills.
            recent=a[-5:];pred_kills=k/rnd*mean(x["rounds"] for x in recent)
            pred_hs=pred_kills*(hs+5)/(k+10)
            y=r["headshots"];scores[0]+=1;scores[1]+=abs(mean(x["headshots"] for x in a)-y);scores[2]+=abs(pred_hs-y);scores[3]+=abs(hs/rnd*mean(x["rounds"] for x in recent)-y)
        for r in sorted(days[day],key=lambda x:(x["event"],x["player"])):history[r["player"]].append(r)
    n=scores[0]
    return {"rows":len(clean),"distinctPlayers":len({r["player"] for r in clean}),"dates":len(dates),"holdoutStart":cut,"n":n,"last20MAE":scores[1]/n if n else None,"killRateTimesHeadshotShareMAE":scores[2]/n if n else None,"headshotsPerRoundMAE":scores[3]/n if n else None,"priorDatesOnly":True,"actualPropLines":0,"modelPromoted":False}
