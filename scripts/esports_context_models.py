"""Fixed context challenger, historical statistical research only.
Predictions on a date may use prior dates only; context is conditional on the
observed map/champion/hero/mode, not proof it was announced before a prop.
"""
from collections import defaultdict, Counter
from datetime import date
from statistics import mean
def evaluate(rows,markets,context_keys,partition_keys=()):
    seen=Counter((r.get("event"),r.get("player")) for r in rows)
    valid=[]
    for r in rows:
        try:
            date.fromisoformat(r["date"])
            if not r["event"] or not r["player"] or seen[r["event"],r["player"]]!=1:continue
            if any(not r.get(k) for k in partition_keys):continue
            if any(type(r.get(m)) is not int or r[m]<0 for m in markets):continue
            valid.append(r)
        except (ValueError,TypeError,KeyError):continue
    dates=sorted({r["date"] for r in valid});cut=dates[int(.8*len(dates))] if len(dates)>=5 else None
    days=defaultdict(list)
    for r in valid:days[r["date"]].append(r)
    h=defaultdict(list);ctx=defaultdict(list);out=defaultdict(lambda:[0,0.,0.,0.,0.]);available=Counter()
    def basekey(r,m):return (r["player"],m,*(r[k] for k in partition_keys))
    for d in dates:
        batch=sorted(days[d],key=lambda r:(r["event"],r["player"]))
        for r in batch:
            if not cut or d<cut:continue
            for m in markets:
                k=basekey(r,m);a=h[k]
                if len(a)<5:continue
                old=mean(a[-20:]);short=mean(a[-5:])
                for field in context_keys:
                    if not r.get(field):continue
                    c=ctx[k,field,str(r[field])]
                    if len(c)<3:continue
                    # Fixed prior sample shrinkage; no tuning on the holdout.
                    n=min(len(c),20);p=(n*mean(c[-20:])+10*old)/(n+10)
                    recent_context=mean(c[-5:]); recent=(min(len(c),5)*recent_context+10*short)/(min(len(c),5)+10)
                    z=out[field,m];z[0]+=1;z[1]+=abs(short-r[m]);z[2]+=abs(old-r[m]);z[3]+=abs(p-r[m]);z[4]+=abs(recent-r[m])
        for r in batch:
            for m in markets:
                k=basekey(r,m);h[k].append(r[m])
                for field in context_keys:
                    if r.get(field):ctx[k,field,str(r[field])].append(r[m])
            for field in context_keys:
                if r.get(field):available[field]+=1
    return {"validRows":len(valid),"dates":len(dates),"holdoutStart":cut,"contextCoverage":dict(available),"partitionKeys":list(partition_keys),"groups":{f+"|"+m:{"n":z[0],"last5MAE":z[1]/z[0],"last20MAE":z[2]/z[0],"contextMAE":z[3]/z[0],"fixedRecentContextMAE":z[4]/z[0]} for (f,m),z in out.items() if z[0]},"priorDatesOnly":True,"observedContextConditional":True,"actualPropLines":0,"prospectiveApproval":False}
