#!/usr/bin/env python3
"""Bounded public Cargo API research, stop on refusal; no scraping bypass."""
import json, urllib.parse, urllib.request, time, re, sys
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
        if any(r["opponent"] not in teams or r["win"] not in ("0","1") for r in a) or len({r["team"] for r in a if r["win"]=="1"})!=1 or sum(r["win"]=="1" for r in a)!=4:continue
        clean.extend(a)
    return clean,excluded,len(groups)
def main():
    rows=[];pages=0;status="bounded_sample"
    year=sys.argv[1] if len(sys.argv)>1 else "2025"
    if year not in ("2025","2026"):raise ValueError("invalid year")
    start=year+"-01-01";end="2026-01-01" if year=="2025" else "2026-11-25"
    fields="Date,SeriesId,GameNumber,PlayerLink,Team,TeamVs,GameTitle,Gamemode,Win,Kills,Deaths,TournamentPage,UniqueLine"
    try:
        # Bounded contiguous chronological sample; not a full modern archive.
        for i in range(3):
            if i:time.sleep(60)
            obj=query({"action":"cargoquery","tables":"PlayerStats","fields":fields,"where":f"Date >= '{start}' AND Date < '{end}' AND TournamentPage LIKE 'Call of Duty League%'","order_by":"Date,UniqueLine","limit":"500","offset":str(i*500)})
            page=obj.get("cargoquery")
            if not isinstance(page,list) or len(page)>500:raise ValueError("schema")
            rows.extend(x["title"] for x in page);pages+=1
            if len(page)<500:status="source_exhausted";break
    except Exception as e:status="source_unavailable_or_partial_"+type(e).__name__
    clean,excluded,groups=parse(rows)
    print(json.dumps({"kind":"modern_cod_wiki_baseline_v1","source":"Call of Duty Esports Wiki, CC BY-SA 3.0; https://cod-esports.fandom.com/wiki/Stats_Hub","status":status,"year":year,"pages":pages,"rawRowsRead":len(rows),"completeMaps":len(clean)//8,"invalidRows":excluded,"candidateMaps":groups,"context":evaluate(clean,("kills","deaths"),["mode"],["edition"]),"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()
