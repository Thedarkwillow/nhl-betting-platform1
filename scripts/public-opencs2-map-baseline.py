#!/usr/bin/env python3
"""Metadata-only modern pro CS2 statistical baseline. No demos or raw output."""
import hashlib,importlib.util,json,pathlib,re,tempfile,urllib.request,os
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
def regulation_team_score(m):
    """Reconstruct regulation team rounds from explicit side winners.
    Require complete sequential rounds and exactly terminal MR12 score.
    This is a separately reported diagnostic, not an override of source totals.
    """
    n=m.get("rounds_played");x=m.get("match") or {}
    if type(n)is not int or not 13<=n<=24 or x.get("rounds_played")!=n:return None
    a,b=x.get("score_ct"),x.get("score_t")
    rounds=m.get("rounds") or []
    if len(rounds)!=n or [r.get("round_num") for r in rounds]!=list(range(1,n+1)):return None
    sides=[];team=[0,0]
    for i,r in enumerate(rounds):
        side=str(r.get("winner","")).strip().lower()
        if side not in ("ct","t"):return None
        if not isinstance(r.get("official_end"),int) or not isinstance(r.get("start"),int) or r["official_end"]<=r["start"]:return None
        sides.append(side)
        j=int(side=="t")^(int(i>=12))
        team[j]+=1
        if max(team)>=13 and i!=n-1:return None
    if max(team)!=13 or min(team)>11:return None
    if not (type(a)is int and type(b)is int and (a,b)==(sides.count("ct"),sides.count("t"))):return None
    return tuple(team)

def map_rows(m,reason=None,verified_regulation=False):
    def reject(k):
        if reason is not None:reason[k]+=1
        return []
    n=m.get("rounds_played");x=m.get("match") or {}
    if type(n)is not int or n<13 or x.get("rounds_played")!=n:return reject("round_count")
    a,b=x.get("score_ct"),x.get("score_t")
    if verified_regulation:
        if regulation_team_score(m) is None:return reject("regulation_reconstruction_unverified")
    elif type(a)is not int or type(b)is not int or a+b!=n or a==b or max(a,b)<13:return reject("final_score")
    mid=m.get("match_id");mp=m.get("map_index");day=str(m.get("match_date"))[:10]
    if not mid or type(mp)is not int or not 1<=mp<=7 or day<"2023-09-27":return reject("match_map_date")
    datetime.strptime(day,"%Y-%m-%d")
    teams=m.get("teams") or []
    if len(teams)!=2 or any(len(t.get("players") or [])!=5 for t in teams):return reject("team_roster_shape")
    roster=[str(p.get("steamid") or "") for t in teams for p in t["players"]]
    identities={str(p.get("steamid") or ""):(i,p,t) for i,t in enumerate(teams) for p in t["players"]}
    if len(set(roster))!=10 or any(not re.fullmatch(r"\d{17}",p) for p in roster):return reject("player_ids")
    by=defaultdict(list)
    for p in m.get("players") or []:by[str(p.get("steamid") or "")].append(p)
    batch=[]
    for pid in roster:
        values=player_total(by[pid],n)
        if values is None:return reject("player_total_conflict_or_missing")
        i,person,team=identities[pid]
        batch.append({"event":str(mid)+"|"+str(mp),"player":pid,"date":day,"map":m.get("map_name") or x.get("map_name") or x.get("map"),"sourceTeamSlot":i,"sourceAlias":person.get("name") if isinstance(person.get("name"),str) else None,"sourceTeamLabel":team.get("name") if isinstance(team.get("name"),str) else None,"rounds":n,"regulationScorePair":sorted(regulation_team_score(m)) if verified_regulation else None,**dict(zip(METRICS,values))})
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
    maps={};verified_maps={};all_ids=Counter();bad=set();reject=0;files=[];reasons=Counter();strict_reasons=Counter()
    for e in assets:
        raw=free.download(f"https://huggingface.co/datasets/{REPO}/resolve/{REV}/{e['path']}",e["size"])
        sha=hashlib.sha256(raw).hexdigest()
        if len(raw)!=e["size"] or (e.get("lfs",{}).get("oid") and e["lfs"]["oid"]!=sha):raise ValueError("asset integrity")
        import io
        t=pq.read_table(io.BytesIO(raw),columns=["match_id","map_index","match_date","rounds_played","match","teams","players","rounds"]+ (["map_name"] if "map_name" in pq.ParquetFile(io.BytesIO(raw)).schema_arrow.names else []))
        files.append({"bytes":len(raw),"sha256":sha,"maps":t.num_rows})
        for m in t.to_pylist():
            event=str(m.get("match_id"))+"|"+str(m.get("map_index"));all_ids[event]+=1
            try:
                q=map_rows(m,strict_reasons,verified_regulation=True)
                if q:verified_maps[event]=q
            except (ValueError,TypeError,KeyError):strict_reasons["malformed"]+=1
            try:r=map_rows(m,reasons)
            except (ValueError,TypeError,KeyError):r=[];reasons['malformed']+=1
            if not r:reject+=1;continue
            k=r[0]["event"]
            if k in maps:bad.add(k)
            else:maps[k]=r
    rows=[r for k,a in maps.items() if all_ids[k]==1 for r in a]
    strict=[r for k,a in verified_maps.items() if all_ids[k]==1 for r in a]
    if os.environ.get("CS2_INDEPENDENT_IDENTITY_AUDIT")=="1":
        from cs2_independent_steam_audit import run
        run(strict)
    from cs2_headshot_history import evaluate as hs_eval
    print(json.dumps({"kind":"cs2_native_headshot_research_v1","original":hs_eval(rows),"regulation":hs_eval(strict),"cohortsKeptSeparate":True,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}),flush=True)
    recovered=sum(k not in maps and all_ids[k]==1 for k in verified_maps)
    from esports_scope_history import evaluate as scope_eval
    print(json.dumps({"kind":"cs2_exact_scope_history_v1","originalCohort":[scope_eval(rows,METRICS,x) for x in ((1,),(2,),(1,2))],"regulationDiagnosticCohort":[scope_eval(strict,METRICS,x) for x in ((1,),(2,),(1,2))],"cohortsKeptSeparate":True,"paidRequests":0,"rawRowsPublished":0}))
    from esports_context_models import evaluate as context_eval
    review=os.environ.get("ESPORTS_CROSSWALK_REVIEW")
    if review:
        from esports_independent_crosswalk import audit as crosswalk_audit
        archived=json.loads(pathlib.Path(os.environ["ESPORTS_CROSSWALK_CAPTURE"]).read_text())
        reviewed=json.loads(pathlib.Path(review).read_text())
        print(json.dumps(crosswalk_audit(archived,reviewed,rows)))
        reg=crosswalk_audit(archived,reviewed,strict)
        print(json.dumps({"kind":"restricted_esports_regulation_history_diagnostic_v1","counts":reg["counts"],"qualified":0,"paidRequests":0,"rawRowsPublished":0}))

    # Optional restricted inputs; only aggregate readiness counts leave the runner.
    capture=os.environ.get("CS2_RESTRICTED_CAPTURE")
    if capture:
        from cs2_restricted_history_join import evaluate as join_eval
        def read_restricted(var):
            name=os.environ.get(var)
            return json.loads(pathlib.Path(name).read_text()) if name else []
        archive=json.loads(pathlib.Path(capture).read_text())
        print(json.dumps(join_eval(archive,rows,read_restricted("CS2_IDENTITY_LINKS"),read_restricted("CS2_EVENT_LINKS"))))
    print(json.dumps({"kind":"opencs2_modern_map_baseline_v1","source":REPO,"revision":REV,"license":"CC BY 4.0; original rights not independently verified","assetsVerified":len(files),"metadataMapRows":sum(x["maps"] for x in files),"context":context_eval(rows,METRICS,["map"]),"regulationDiagnostic":{"completeMaps":len(strict)//10,"notInOriginalCohort":recovered,"excludedReasons":dict(strict_reasons),"baseline":evaluate(strict),"context":context_eval(strict,METRICS,["map"]),"sourceRoundWinnerAndSideTotalsVerified":True,"separateCohort":True},"completeMaps":len(rows)//10,"excludedMaps":reject,"exclusionReasons":dict(reasons),"duplicateMapsExcluded":len(bad),"baseline":evaluate(rows),"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":
    try:main()
    except Exception as e:print(json.dumps({"kind":"opencs2_modern_map_baseline_v1","status":"unavailable","reason":free.safe_error(e),"detail":str(e)[:160] if isinstance(e,ValueError) else None,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
