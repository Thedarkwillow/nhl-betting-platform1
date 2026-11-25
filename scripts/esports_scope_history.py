"""Exact series-scope historical count backtest, not a prop-line backtest."""
from collections import Counter,defaultdict
from datetime import date
from statistics import mean,median

def series_rows(rows,markets,indices):
    groups=defaultdict(dict);bad=set()
    for r in rows:
        try:
            match,ordinal=r["event"].rsplit("|",1);i=int(ordinal)
            if i not in indices:continue
            date.fromisoformat(r["date"]);key=(match,r["player"])
            if i in groups[key]:bad.add(key)
            groups[key][i]=r
        except (KeyError,ValueError,TypeError,AttributeError):continue
    out=[]
    for key,rs in groups.items():
        if key in bad or not all(i in rs for i in indices):continue
        if len({rs[i]["date"] for i in indices})!=1:continue
        if any(type(rs[i].get(m)) is not int or rs[i][m]<0 for i in indices for m in markets):continue
        out.append(dict(event=key[0],player=key[1],date=rs[indices[0]]["date"],**{m:sum(rs[i][m] for i in indices) for m in markets}))
    return out

def evaluate(rows,markets,indices):
    clean=series_rows(rows,markets,indices)
    days=defaultdict(list);h=defaultdict(list);metrics=defaultdict(lambda:[0,0.,0.,0.])
    for r in clean:days[r["date"]].append(r)
    dates=sorted(days);cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    for day in dates:
        batch=days[day]
        if cut and day>=cut:
            for r in batch:
                for m in markets:
                    a=h[r["player"],m]
                    if len(a)<10:continue
                    y=r[m];z=metrics[m];z[0]+=1;z[1]+=abs(mean(a[-5:])-y);z[2]+=abs(mean(a[-20:])-y);z[3]+=abs(median(a[-20:])-y)
        for r in sorted(batch,key=lambda x:(x["event"],x["player"])):
            for m in markets:h[r["player"],m].append(r[m])
    return {"scope":list(indices),"completePlayerSeries":len(clean),"distinctDates":len(dates),"holdoutStart":cut,
       "markets":{m:{"n":z[0],"last5MAE":z[1]/z[0],"last20MAE":z[2]/z[0],"last20MedianMAE":z[3]/z[0]} for m,z in metrics.items() if z[0]},
       "minimumPriorSeries":10,"priorDatesOnly":True,"actualPropLines":0,"modelPromoted":False}
