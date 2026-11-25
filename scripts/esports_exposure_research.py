"""Historical rate x projected exposure. Current map length is never a feature."""
from collections import Counter,defaultdict
from datetime import date
from statistics import mean

def evaluate(rows,markets,exposure):
    seen=Counter((r.get("event"),r.get("player")) for r in rows)
    days=defaultdict(list)
    for r in rows:
        try:
            date.fromisoformat(r["date"])
            if seen[r["event"],r["player"]]!=1 or type(r.get(exposure)) is not int or r[exposure]<=0:continue
            if not all(type(r.get(m)) is int and r[m]>=0 for m in markets):continue
            days[r["date"]].append(r)
        except (KeyError,TypeError,ValueError):continue
    dates=sorted(days);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    history=defaultdict(list);scores=defaultdict(lambda:[0,0.,0.,0.])
    for day in dates:
        for r in days[day]:
            a=history[r["player"]][-20:]
            if not cut or day<cut or len(a)<10:continue
            expected=mean(x[exposure] for x in a[-5:])
            for m in markets:
                baseline=mean(x[m] for x in a)
                rate=sum(x[m] for x in a)/sum(x[exposure] for x in a)
                projected=rate*expected
                s=scores[m];s[0]+=1;s[1]+=abs(baseline-r[m]);s[2]+=abs(projected-r[m]);s[3]+=abs((baseline+projected)/2-r[m])
        for r in sorted(days[day],key=lambda x:(x["event"],x["player"])):history[r["player"]].append(r)
    return {"exposure":exposure,"validRows":sum(map(len,days.values())),"holdoutStart":cut,"markets":{m:{"n":s[0],"last20MAE":s[1]/s[0],"rateTimesProjectedExposureMAE":s[2]/s[0],"fixedBlendMAE":s[3]/s[0]} for m,s in scores.items() if s[0]},"priorDatesOnly":True,"usesActualCurrentExposure":False,"actualPropLines":0,"modelPromoted":False}
