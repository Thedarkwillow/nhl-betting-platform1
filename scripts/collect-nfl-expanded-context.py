#!/usr/bin/env python3
"""Private complementary NFL sources. Existing archives are never overwritten.
Published data only. No charges, no consumer-site scraping, no future-stat forecasts."""
import gzip,json,math,os
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
YEARS=(2025,2026)
def stamp(v):
    try:
        x=datetime.fromisoformat(str(v).replace("Z","+00:00"))
        return x if x.tzinfo else None
    except (ValueError,TypeError):return None
def num(x):return isinstance(x,(float,int)) and not isinstance(x,bool) and math.isfinite(x)
def depth_at(rows,team,player,cutoff):
    """Use latest TEAM snapshot only; missing player not assumed healthy/active."""
    t=stamp(cutoff)
    if not t:return None
    dated=[(stamp(r.get("dt")),r) for r in rows if r.get("team")==team]
    past=[(d,r) for d,r in dated if d and d<t]
    if not past:return None
    last=max(d for d,r in past)
    if (t-last).total_seconds()>72*3600:return None
    matches=[r for d,r in past if d==last and r.get("gsis_id")==player]
    ranks={r.get("pos_rank") for r in matches if num(r.get("pos_rank")) and r["pos_rank"]>=1}
    return {"rank":min(ranks),"sourceLoadedAt":last.isoformat(),"projectedRoleNotConfirmed":True} if len(ranks)==1 else None
def prior_opportunity(rows,player,season,week,field):
    # Reconstructed, not point-in-time published; use only two-week-old stats.
    valid=[r for r in rows if r.get("player_id")==player and r.get("season")==season and
      isinstance(r.get("week"),int) and 1<=r["week"]<=week-2 and num(r.get(field))]
    keys=[r["week"] for r in valid]
    if len(keys)!=len(set(keys)):return None
    values=[r[field] for r in sorted(valid,key=lambda r:r["week"])[-5:]]
    return sum(values)/len(values) if len(values)>=3 else None
def validate(rows,columns,key,year):
    required={"dt","team","gsis_id","pos_rank"} if key=="depth_charts" else {"season","week","game_id"}
    if not rows or not required.issubset(columns):raise ValueError("source schema missing")
    if key=="depth_charts" and not any(stamp(r.get("dt")) and r.get("gsis_id") for r in rows):raise ValueError("no dated identities")
    if key=="ff_opportunity" and (not any(k in columns for k in ("player_id","gsis_id")) or not any(r.get("season")==year for r in rows)):raise ValueError("no season identity")
def collect(provider,root=ROOT,now=None):
    now=now or datetime.now(timezone.utc); tag=now.strftime("%Y%m%dT%H%M%SZ")
    dest=root/"outputs/nfl/context/source-captures"/tag
    dest.mkdir(parents=True,exist_ok=False)
    status=[]
    for year in YEARS:
        for name,load in (("depth_charts",lambda:provider.load_depth_charts(seasons=year)),
             ("ff_opportunity",lambda:provider.load_ff_opportunity(seasons=year,stat_type="weekly",model_version="v1.0.0"))):
            try:
                f=load();rows=f.to_dicts();validate(rows,set(f.columns),name,year)
                payload={"source":"nflverse / ffopportunity" if name=="ff_opportunity" else "nflverse / ESPN depth charts","observedAt":now.isoformat(),"dataset":name,"season":year,"rows":rows,"recordCount":len(rows),"retrospectiveNotPregameProof":True}
                path=dest/f"{year}-{name}.json.gz"
                with gzip.open(path,"wt",encoding="utf-8") as stream:json.dump(payload,stream,default=str,allow_nan=False,separators=(",",":"))
                status.append({"season":year,"dataset":name,"status":"collected","records":len(rows),"columns":list(f.columns)})
            except Exception as e:
                if (dest/f"{year}-{name}.json.gz").exists():(dest/f"{year}-{name}.json.gz").unlink()
                status.append({"season":year,"dataset":name,"status":"unavailable","errorType":type(e).__name__})
    manifest={"kind":"private_additional_nfl_context_capture_v1","observedAt":now.isoformat(),"datasets":status,"modelPromoted":False,"commercialRedistributionVerified":False}
    (dest/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    return manifest
if __name__=="__main__":
    import nflreadpy
    m=collect(nflreadpy)
    print("Private source coverage capture complete.")
    if not any(r["status"]=="collected" for r in m["datasets"]):raise SystemExit(1)
