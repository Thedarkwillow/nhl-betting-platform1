"""Owner-reported VCT Reference permission: private historical research only.
No redistribution, source authority, current offer or prospective approval inferred.
"""
import os,sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
from valorant_pregame_agent_research import vct,free
URL="https://vct-reference.com/dataset/vct.duckdb"
def run(root):
    root=Path(root).resolve()
    if root==Path(__file__).resolve().parents[1] or not (root/".git").exists() or os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1":raise ValueError("private checkout required")
    base=root/"research/esports-native-history/vct-reference"
    if any(x.is_symlink() for x in (base,base.parent,base.parent.parent)):raise ValueError("symlink")
    raw=free.download(URL,32_000_000);digest=hashlib.sha256(raw).hexdigest()
    report=vct(raw=raw)
    if report["sha256"]!=digest or report["completeMaps"]<=0:raise ValueError("empty or invalid cohort")
    base.mkdir(parents=True,exist_ok=True)
    p=base/(digest+".duckdb");meta=base/(digest+".json")
    if p.is_symlink() or meta.is_symlink():raise ValueError("symlink")
    if p.exists():
        if p.read_bytes()!=raw or not meta.is_file():raise ValueError("cache conflict")
        new=False
    else:
        if meta.exists():raise ValueError("cache conflict")
        with p.open("xb") as f:f.write(raw)
        with meta.open("x") as f:json.dump({"kind":"vct_reference_native_historical_cache_v1","sourceUrl":URL,"sha256":digest,"bytes":len(raw),"observedAt":datetime.now(timezone.utc).isoformat(),"completeMaps":report["completeMaps"],"playerMapRows":report["completeMaps"]*10,"ownerReportsPermission":True,"permissionIndependentlyReviewed":False,"redistributionApproved":False,"crossSourceIdentityVerified":False,"officialFinalClockVerified":False,"prospectiveUseApproved":False},f,sort_keys=True)
        new=True
    return {"kind":"vct_private_historical_intake_v1","newCache":new,"completeMaps":report["completeMaps"],"playerMapRows":report["completeMaps"]*10,"sha256":digest,"research":report,"paidRequests":0,"rawRowsPublished":0,"originalOffersVerified":0,"modelPromoted":False}
if __name__=="__main__":
    try:print(json.dumps(run(sys.argv[1]),allow_nan=False),flush=True)
    except Exception as e:print(json.dumps({"kind":"vct_private_historical_intake_failure_v1","reason":free.safe_error(e),"paidRequests":0,"rawRowsPublished":0}),flush=True);sys.exit(1)
