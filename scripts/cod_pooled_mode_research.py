#!/usr/bin/env python3
"""Bounded public Cargo API research, stop on refusal; no scraping bypass."""
import json, urllib.parse, urllib.request, urllib.error, time, re, sys
from datetime import date
from collections import defaultdict, Counter
from esports_context_models import evaluate
BASE="https://cod-esports.fandom.com/api.php"
def query(params):
    params={"format":"json","formatversion":"2",**params}
    req=urllib.request.Request(BASE+"?"+urllib.parse.urlencode(params),headers={"User-Agent":"PublicSportsResearch/1.0 (bounded historical aggregate research)","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r:raw=r.read(4_000_001)
    if len(raw)>4_000_000:raise ValueError("response limit")
    d=json.loads(raw)
    if "error" in d:raise ValueError("source refused query")
    return d
def parse(rows):
    groups=defaultdict(list);excluded=0
    for r in rows:
        try:
            d=r["Date"][:10];date.fromisoformat(d)
            if d<"2024-01-01" or not r["SeriesId"] or not r["GameNumber"] or not r["PlayerLink"] or not r["Team"] or not r["TeamVs"] or r["Team"]==r["TeamVs"]:raise ValueError()
            if not r["GameTitle"] or not r["Gamemode"] or r["Win"] not in ("0","1"):raise ValueError()
            k=int(r["Kills"]);de=int(r["Deaths"])
            if min(k,de)<0:raise ValueError()
            key=r["SeriesId"]+"|"+r["GameNumber"]
            groups[key].append(dict(event=key,player=r["PlayerLink"],date=d,edition=r["GameTitle"],mode=r["Gamemode"],team=r["Team"],opponent=r["TeamVs"],win=r["Win"],kills=k,deaths=de))
        except (ValueError,TypeError,KeyError):excluded+=1
    clean=[]
    for a in groups.values():
        teams=Counter(r["team"] for r in a)
        if len(a)!=8 or len({r["player"] for r in a})!=8 or sorted(teams.values())!=[4,4] or len({(r["date"],r["edition"],r["mode"]) for r in a})!=1:continue
        if any(r["opponent"] not in teams or r["opponent"]==r["team"] or r["win"] not in ("0","1") for r in a) or len({r["team"] for r in a if r["win"]=="1"})!=1 or sum(r["win"]=="1" for r in a)!=4:continue
        clean.extend(a)
    return clean,excluded,len(groups)

def main():
    from statistics import mean,variance
    from scipy.stats import poisson,nbinom
    allrows=[];reports=[];stop=False
    for month in ("03","05","06"):
        rows=[];start=f"2026-{month}-01";end=f"2026-{int(month)+1:02d}-01"
        for i in range(3):
            if reports or i:time.sleep(60)
            try:
                obj=query({"action":"cargoquery","tables":"PlayerStats","fields":"Date,SeriesId,GameNumber,PlayerLink,Team,TeamVs,GameTitle,Gamemode,Win,Kills,Deaths,TournamentPage,UniqueLine","where":f"Date >= '{start}' AND Date < '{end}' AND TournamentPage LIKE 'Call of Duty League%'","order_by":"Date,UniqueLine","limit":"500","offset":str(i*500)})
                page=obj["cargoquery"];batch=[x["title"] for x in page]
                if len(batch)>500 or any(not r.get("UniqueLine") for r in batch) or len({r["UniqueLine"] for r in rows+batch})!=len(rows+batch):raise ValueError("pagination")
                rows.extend(batch)
                if len(batch)<500:break
            except Exception:stop=True;break
        clean,invalid,_=parse(rows);allrows.extend(clean);reports.append({"month":month,"rows":len(clean),"refusedOrUnavailable":stop})
        if stop:break
    counts=Counter((r["event"],r["player"]) for r in allrows);a=[r for r in allrows if counts[r["event"],r["player"]]==1]
    days=defaultdict(list);h=defaultdict(list);scores=defaultdict(lambda:[0,0.,0.])
    for r in a:days[r["date"]].append(r)
    ds=sorted(days);cut=ds[int(.8*len(ds))] if len(ds)>=10 else None
    for day in ds:
        for r in days[day]:
            if not cut or day<cut:continue
            for m in ("kills","deaths"):
                v=h[r["player"],r["edition"],r["mode"],m][-20:]
                if len(v)<10:continue
                mu=mean(v);var=variance(v)
                for line in (9.5,14.5,19.5,24.5):
                    p=(1+sum(x>line for x in v))/(len(v)+2);q=nbinom.sf(line,mu*mu/(var-mu),mu/var) if var>mu+.001 and mu>0 else poisson.sf(line,mu)
                    y=int(r[m]>line);z=scores[r["mode"],m];z[0]+=1;z[1]+=(p-y)**2;z[2]+=(q-y)**2
        for r in sorted(days[day],key=lambda r:(r["event"],r["player"])):
            for m in ("kills","deaths"):h[r["player"],r["edition"],r["mode"],m].append(r[m])
    print(json.dumps({"kind":"cod_pooled_mode_research_v1","cohorts":reports,"uniqueRows":len(a),"holdoutStart":cut,"context":evaluate(a,("kills","deaths"),["mode"],["edition"]),"syntheticProbability":{k[0]+"|"+k[1]:{"n":z[0],"empiricalBrier":z[1]/z[0],"countBrier":z[2]/z[0]} for k,z in scores.items() if z[0]},"syntheticThresholds":True,"observedModeConditional":True,"actualPropLines":0,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()
