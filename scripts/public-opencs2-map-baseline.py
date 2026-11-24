#!/usr/bin/env python3
"""Metadata-only modern pro CS2 statistical baseline. No demos or raw output."""
import hashlib,importlib.util,json,pathlib,re,tempfile,urllib.request
from collections import defaultdict,Counter
from datetime import datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("free",ROOT/"scripts/public-eight-free-history.py")
free=importlib.util.module_from_spec(spec);spec.loader.exec_module(free)
REPO="blanchon/opencs2_dataset_demo"
REV="912a363098feec3f220e41d68634d2f71676c28b"
METRICS=("kills","deaths","assists","headshots")
def counts(p):
    vals=tuple(p.get(k) for k in METRICS)
    if not all(type(x) is int and x>=0 for x in vals) or vals[3]>vals[0]:return None
    return vals
def player_total(rows,n):
    # Side-specific and full-map records are not additive to each other.
    totals={counts(p) for p in rows if p.get("n_rounds")==n and counts(p) is not None}
    sides={}
    for side in ("ct","t"):
        found={(p.get("n_rounds"),counts(p)) for p in rows if str(p.get("side")).lower()==side and type(p.get("n_rounds")) is int and counts(p) is not None}
        if len(found)==1:sides[side]=next(iter(found))
        elif len(found)>1:return None
    if len(sides)==2 and sum(x[0] for x in sides.values())==n:
        totals.add(tuple(sum(x[1][i] for x in sides.values()) for i in range(4)))
    if len(totals)!=1:return None
    return next(iter(totals))
def map_rows(m):
    n=m.get("rounds_played");x=m.get("match") or {}
    if type(n)is not int or n<13 or x.get("rounds_played")!=n:return []
    a,b=x.get("score_ct"),x.get("score_t")
    if type(a)is not int or type(b)is not int or a+b!=n or a==b or max(a,b)<13:return []
    mid=m.get("match_id");mp=m.get("map_index");day=str(m.get("match_date"))[:10]
    if not mid or type(mp)is not int or not 1<=mp<=7 or day<"2023-09-27":return []
    datetime.strptime(day,"%Y-%m-%d")
    teams=m.get("teams") or []
    if len(teams)!=2 or any(len(t.get("players") or [])!=5 for t in teams):return []
    roster=[str(p.get("steamid") or "") for t in teams for p in t["players"]]
    if len(set(roster))!=10 or any(not re.fullmatch(r"\d{17}",p) for p in roster):return []
    by=defaultdict(list)
    for p in m.get("players") or []:by[str(p.get("steamid") or "")].append(p)
    batch=[]
    for pid in roster:
        values=player_total(by[pid],n)
        if values is None:return []
        batch.append({"event":str(mid)+"|"+str(mp),"player":pid,"date":day,"map":m.get("map_name") or x.get("map_name") or x.get("map"),**dict(zip(METRICS,values))})
    return batch
def evaluate(rows):
    # chronological prior-date-only holdout; all maps on a day withheld together
    dates=sorted({r["date"] for r in rows});start=dates[int(.8*len(dates))] if len(dates)>=5 else None
    hist=defaultdict(list);out=defaultdict(lambda:[0,0.,0.]);days=defaultdict(list)
    for r in rows:days[r["date"]].append(r)
    for d in dates:
        for r in days[d]:
            if not start or d<start:continue
            for m in METRICS:
                h=hist[r["player"],m]
                if len(h)<5:continue
                z=out[m];z[0]+=1;z[1]+=abs(sum(h[-5:])/5-r[m]);z[2]+=abs(sum(h[-20:])/len(h[-20:])-r[m])
        for r in days[d]:
            for m in METRICS:hist[r["player"],m].append(r[m])
    return {"validRows":len(rows),"dates":len(dates),"dateMin":dates[0] if dates else None,"dateMax":dates[-1] if dates else None,"holdoutStart":start,"markets":{m:{"n":z[0],"last5MAE":z[1]/z[0],"last20MAE":z[2]/z[0]} for m,z in out.items() if z[0]},"actualPropLines":0,"prospectiveApproval":False}
def main():
    import pyarrow.parquet as pq
    import urllib.request
    entries=[];url=f"https://huggingface.co/api/datasets/{REPO}/tree/{REV}/data?limit=100"
    visited=set()
    for _ in range(10):
        if url in visited or not url.startswith(f"https://huggingface.co/api/datasets/{REPO}/tree/{REV}/data"):raise ValueError("manifest pagination")
        visited.add(url)
        req=urllib.request.Request(url,headers={"User-Agent":"CS2ResearchDataAudit/1.0"})
        with urllib.request.urlopen(req,timeout=35) as resp:
            body=resp.read(2_000_001)
            if len(body)>2_000_000:raise ValueError("manifest size")
            entries.extend(json.loads(body))
            link=resp.headers.get("Link","")
        nexts=re.findall(r'<([^>]+)>;\s*rel="next"',link)
        if not nexts:break
        url=nexts[0]
    else:raise ValueError("manifest pagination limit")
    assets=[e for e in entries if e.get("type")=="file" and re.fullmatch(r"data/metadata-[A-Za-z0-9_-]+\.parquet",e.get("path",""))]
    print(json.dumps({"stage":"manifest","metadataAssets":len(assets),"metadataBytes":sum(e["size"] for e in assets)}),flush=True)
    if not assets or len(assets)>400 or sum(e["size"] for e in assets)>80_000_000:raise ValueError("metadata bound")
    maps={};bad=set();reject=0;files=[]
    for e in assets:
        raw=free.download(f"https://huggingface.co/datasets/{REPO}/resolve/{REV}/{e['path']}",e["size"])
        sha=hashlib.sha256(raw).hexdigest()
        if len(raw)!=e["size"] or (e.get("lfs",{}).get("oid") and e["lfs"]["oid"]!=sha):raise ValueError("asset integrity")
        import io
        t=pq.read_table(io.BytesIO(raw),columns=["match_id","map_index","match_date","rounds_played","match","teams","players"]+ (["map_name"] if "map_name" in pq.ParquetFile(io.BytesIO(raw)).schema_arrow.names else []))
        files.append({"bytes":len(raw),"sha256":sha,"maps":t.num_rows})
        for m in t.to_pylist():
            try:r=map_rows(m)
            except (ValueError,TypeError,KeyError):r=[]
            if not r:reject+=1;continue
            k=r[0]["event"]
            if k in maps:bad.add(k)
            else:maps[k]=r
    rows=[r for k,a in maps.items() if k not in bad for r in a]
    from esports_context_models import evaluate as context_eval
    print(json.dumps({"kind":"opencs2_modern_map_baseline_v1","source":REPO,"revision":REV,"license":"CC BY 4.0; original rights not independently verified","assetsVerified":len(files),"metadataMapRows":sum(x["maps"] for x in files),"context":context_eval(rows,METRICS,["map"]),"completeMaps":len(rows)//10,"excludedMaps":reject,"duplicateMapsExcluded":len(bad),"baseline":evaluate(rows),"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":
    try:main()
    except Exception as e:print(json.dumps({"kind":"opencs2_modern_map_baseline_v1","status":"unavailable","reason":free.safe_error(e),"detail":str(e)[:160] if isinstance(e,ValueError) else None,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
