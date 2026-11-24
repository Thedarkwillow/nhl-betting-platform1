#!/usr/bin/env python3
"""Market-specific past-only NHL source ablations; all thresholds synthetic."""
import collections as C, importlib.util, math, json
from pathlib import Path
spec=importlib.util.spec_from_file_location("core",Path(__file__).with_name("research-nhl-expanded-probabilities.py"))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
base=core.lab.normalize
LINES={"shotsOnGoal":(1.5,2.5,3.5),"goals":(.5,1.5),"assists":(.5,1.5),"points":(.5,1.5,2.5),"hits":(1.5,2.5,3.5),"blockedShots":(.5,1.5,2.5),"timeOnIceSeconds":(899.5,1199.5,1499.5),"saves":(19.5,24.5,29.5),"goalsAgainst":(1.5,2.5,3.5)}
def n(row,key):
    try:return core.lab.nonnegative(row.get(key))
    except (ValueError,TypeError):return None
def normalize(row,season,role):
    r=base(row,season,role)
    if not r:return r
    a=r["actual"];f={}
    if role=="skaters":
        a["timeOnIceSeconds"]=r["toi"]
        p,s=n(row,"I_F_primaryAssists"),n(row,"I_F_secondaryAssists")
        if p is not None and s is not None:
            a["assists"]=p+s
            points=n(row,"I_F_points")
            if points==a["goals"]+p+s:a["points"]=points
        for m,k in (("hits","I_F_hits"),("blockedShots","shotsBlockedByPlayer")):
            v=n(row,k)
            if v is not None:a[m]=v
        for k,v in (("attempts","I_F_shotAttempts"),("xg","I_F_xGoals"),("onIceGoals","OnIce_F_goals"),("againstAttempts","OnIce_A_shotAttempts"),("shifts","I_F_shifts")):f[k]=n(row,v)
    else:
        a["goalsAgainst"]=n(row,"goals")
        f["faced"]=n(row,"ongoal");f["qualityAgainst"]=n(row,"xGoals")
    r["features"]=f
    return r
def mean(a):return sum(a)/len(a)
def avg(rows,key):return mean([x["actual"][key] for x in rows])
def ratio(rows,market,exposure,prior_rate,prior_n):
    a=[r for r in rows if r["features"].get(exposure) is not None and r["features"][exposure]>=0 and r["actual"].get(market) is not None]
    if len(a)<8:return None
    total=sum(x["features"][exposure] for x in a)
    if total<=0:return None
    return (sum(x["actual"][market] for x in a)+prior_rate*prior_n)/(total+prior_n)
def dedicated(m,prior,opponent=()):
    a=prior[-20:];recent=a[-5:];expected_toi=.65*mean([r["toi"] for r in a[-10:]])+.35*mean([r["toi"] for r in recent])
    if len(a)<8:return None
    def exposure(k):
        v=[r["features"].get(k) for r in a]
        if any(x is None for x in v):return None
        return sum(v)*expected_toi/sum(r["toi"] for r in a)
    if m=="shotsOnGoal":
        q=ratio(a,m,"attempts",.55,20);e=exposure("attempts")
    elif m=="goals":
        q=ratio(a,m,"xg",1,10);e=exposure("xg")
    elif m=="assists":
        q=ratio(a,m,"onIceGoals",.45,15);e=exposure("onIceGoals")
    elif m=="points":
        # Sum separately modeled mean components; recenter observed joint
        # point totals below, preserving empirical component dependence.
        g=dedicated("goals",a,opponent);ass=dedicated("assists",a,opponent)
        return g+ass if g is not None and ass is not None else None
    elif m=="hits":
        # Defensive-zone opportunity proxy, not verified contact/forecheck count.
        q=ratio(a,m,"againstAttempts",.08,30);e=exposure("againstAttempts")
    elif m=="blockedShots":
        q=ratio(a,m,"againstAttempts",.07,30);e=exposure("againstAttempts")
    elif m=="timeOnIceSeconds":
        shifts=exposure("shifts")
        if shifts is None or shifts<=0:return None
        v=sum(r["features"]["shifts"] for r in a)
        if v<=0:return None
        recent_shifts=mean([r["features"]["shifts"] for r in recent])
        return min(3900,max(0,recent_shifts*sum(r["toi"] for r in a)/v))
    elif m in ("saves","goalsAgainst"):
        q=ratio(a,m,"faced",.9 if m=="saves" else .1,30);e=exposure("faced")
        if len(opponent)>=5 and e is not None:
            e=.7*e+.3*mean(opponent[-10:])*expected_toi/3600
    else:return None
    if e is None or q is None:return None
    if m in ("shotsOnGoal","assists","saves","goalsAgainst"):q=min(1,max(0,q))
    return max(0,e*q)
def evaluate(rows):
    days=C.defaultdict(list);hist=C.defaultdict(list);team=C.defaultdict(list);stats=C.defaultdict(lambda:[0,0,0.,0.,0.,0.,0.,0.]);games=C.defaultdict(set);dates=C.defaultdict(set)
    for r in rows:days[r["day"]].append(r)
    for day,batch in sorted(days.items()):
        events=C.defaultdict(list)
        for r in batch:
            events[r["game"]].append(r)
            for m,lines in LINES.items():
                y=r["actual"].get(m)
                if y is None:continue
                prior=[a for a in hist[r["player"]] if a["actual"].get(m) is not None][-60:]
                if len(prior)<8 or r["season"] not in (2024,2025):continue
                # Filter role from prior use only; goalie and skater conditional on appearance.
                if m=="timeOnIceSeconds" and r["role"]!="skaters":continue
                if m in ("saves","goalsAgainst") and mean([a["toi"] for a in prior[-10:]])<2400:continue
                if m not in ("saves","goalsAgainst","timeOnIceSeconds") and mean([a["toi"] for a in prior[-10:]])<480:continue
                mu=dedicated(m,prior,team[r["opponent"]])
                if mu is None:continue
                actuals=[a["actual"][m] for a in prior]
                form=.5*mean(actuals[-5:])+.3*mean(actuals[-10:])+.2*mean(actuals)
                recent=[(v,0,0) for v in actuals];k=(r["season"],m);a=stats[k]
                games[k].add(r["game"]);dates[k].add(day);a[0]+=1;a[2]+=abs(form-y);a[3]+=abs(mu-y)
                for l in lines:
                    p=core.mass(recent,form,l);q=core.mass(recent,mu,l);z=int(y>l)
                    a[1]+=1;a[4]+=(p-z)**2;a[5]+=(q-z)**2;a[6]-=math.log(p if z else 1-p);a[7]-=math.log(q if z else 1-q)
        for r in batch:hist[r["player"]].append(r)
        for game in events.values():
            sides=C.defaultdict(list)
            for r in game:
                if r["role"]=="skaters":sides[r["team"]].append(r)
            if len(sides)!=2 or any(len(a)!=18 for a in sides.values()):continue
            for t,a in sides.items():team[t].append(sum(r["actual"]["shotsOnGoal"] for r in a))
    def summary(k):
        n,t,ma,mb,ba,bb,la,lb=stats[k]
        return {"appearances":n,"thresholds":t,"games":len(games[k]),"dates":len(dates[k]),"baseline":{"mae":ma/n,"brier":ba/t,"logLoss":la/t},"dedicated":{"mae":mb/n,"brier":bb/t,"logLoss":lb/t}} if n else {"appearances":0}
    return {"kind":"nhl_dedicated_market_source_ablation_v1","markets":{m:{"training":summary((2024,m)),"evaluation":summary((2025,m))} for m in LINES},"syntheticThresholds":True,"sameDayWithheld":True,"actualOfferLines":False,"conditionalOnAppearance":True,"calibrated":False,"modelPromoted":False}
def main():
    core.lab.normalize=normalize
    rows=[]
    for y in core.lab.SEASONS:
        for role in ("skaters","goalies"):rows.extend(core.lab.download_archive(y,role))
    report=evaluate(rows)
    p=Path("outputs/backtests/nhl-dedicated-market-source-latest.json");p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,indent=2)+"\n")
if __name__=="__main__":main()
