"""Bounded native CS2 and COD historical caches. Never certify original offers or identities.
Ektarr declared CC BY-SA 4.0; COD Esports Wiki CC BY-SA 3.0.
Only private historical research; source-native scopes and underlying rights remain distinct.
"""
import os,sys,json,hashlib,time
from datetime import datetime,timezone
from pathlib import Path
from cs2_ektarr_wide_history import URL,SHA,SIZE,load_pinned_history
from valorant_pregame_agent_research import free
from public_cod_wiki_history import query,parse
from esports_context_models import evaluate
def save(root,source,raw,ext,meta):
    root=Path(root).resolve()
    if root==Path(__file__).resolve().parents[1] or not (root/".git").exists() or os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1":raise ValueError("private destination")
    base=root/"research/esports-native-history"/source
    if any(p.is_symlink() for p in (base,base.parent,base.parent.parent)):raise ValueError("symlink")
    base.mkdir(parents=True,exist_ok=True)
    sha=hashlib.sha256(raw).hexdigest();p=base/(sha+ext);m=base/(sha+".json")
    if p.is_symlink() or m.is_symlink():raise ValueError("symlink")
    if p.exists():
        if p.read_bytes()!=raw or not m.is_file():raise ValueError("cache conflict")
        return sha,False
    if m.exists():raise ValueError("cache conflict")
    with p.open("xb") as f:f.write(raw)
    with m.open("x") as f:json.dump({**meta,"sha256":sha,"bytes":len(raw),"observedAt":datetime.now(timezone.utc).isoformat(),"crossSourceIdentityVerified":False,"officialFinalClockVerified":False,"prospectiveUseApproved":False,"originalOffersVerified":0},f,sort_keys=True)
    return sha,True
def cs2(root):
    raw=free.download(URL,SIZE)
    rows,report=load_pinned_history(raw)
    if not rows:raise ValueError("empty source")
    sha,new=save(root,"ektarr",raw,".zip",{"kind":"cs2_ektarr_native_historical_cache_v1","sourceUrl":URL,"declaredLicense":"CC BY-SA 4.0","underlyingRightsIndependentlyVerified":False,"counts":report})
    return {"sha256":sha,"newCache":new,**report}
def cod(root):
    # One bounded previously used calendar cohort, stop on any refusal. No alternate host.
    rows=[];pages=0;start="2026-05-01";end="2026-06-01"
    fields="Date,SeriesId,GameNumber,PlayerLink,Team,TeamVs,GameTitle,Gamemode,Win,Kills,Deaths,TournamentPage,UniqueLine"
    for i in range(3):
        if i:time.sleep(60)
        obj=query({"action":"cargoquery","tables":"PlayerStats","fields":fields,"where":f"Date >= '{start}' AND Date < '{end}' AND TournamentPage LIKE 'Call of Duty League%'","order_by":"Date,UniqueLine","limit":"500","offset":str(i*500)})
        page=obj["cargoquery"];batch=[x["title"] for x in page]
        if len(batch)>500:raise ValueError("page_size")
        if any(not x.get("UniqueLine") for x in batch):raise ValueError("missing_unique_line")
        if any(not start<=str(x.get("Date",""))[:10]<end for x in batch):raise ValueError("date_outside_window")
        if len({x["UniqueLine"] for x in rows+batch})!=len(rows+batch):raise ValueError("unstable_pagination")
        print(json.dumps({"stage":"cod_page_validated","page":i+1,"rows":len(batch)}),flush=True)
        rows.extend(batch);pages+=1
        if len(batch)<500:break
    clean,excluded,groups=parse(rows)
    if not clean:raise ValueError("no complete maps")
    payload={"kind":"cod_native_historical_observations_v1","windowStart":start,"windowEndExclusive":end,"rows":rows}
    raw=(json.dumps(payload,sort_keys=True,separators=(",",":"))+"\n").encode()
    report={"pages":pages,"rawRowsRead":len(rows),"completeMaps":len(clean)//8,"completePlayerRows":len(clean),"invalidRows":excluded,"candidateMaps":groups,"windowStart":start,"windowEndExclusive":end}
    sha,new=save(root,"cod-wiki",raw,".source.json",{"kind":"cod_wiki_native_historical_cache_v1","attribution":"Call of Duty Esports Wiki; CC BY-SA 3.0; https://cod-esports.fandom.com/wiki/Stats_Hub","counts":report})
    return {"sha256":sha,"newCache":new,**report,"historicalContext":evaluate(clean,("kills","deaths"),["mode","team","opponent"],["edition"])}
if __name__=="__main__":
    try:
        source=sys.argv[2]
        if os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1":raise ValueError("private destination")
        result={"cs2":cs2,"cod":cod}[source](sys.argv[1])
        print(json.dumps({"kind":"native_esports_private_historical_intake_v1","source":source,**result,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False},allow_nan=False),flush=True)
    except Exception as e:print(json.dumps({"kind":"native_esports_private_historical_intake_failure_v1","reason":free.safe_error(e),"paidRequests":0,"rawRowsPublished":0}),flush=True);sys.exit(1)
