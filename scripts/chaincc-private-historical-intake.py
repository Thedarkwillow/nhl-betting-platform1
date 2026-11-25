"""Bounded ChainCC historical source cache, CC BY 4.0.
Source: https://chaincc.lol/free/data/ . Source-native historical statistics only.
No original platform lines, independent identity links or prospective certification.
"""
import hashlib,json,os,sys
from pathlib import Path
from datetime import datetime,timezone,date
from lol_specialist_research import get,read_players,complete_games
from lol_strength_patch_research import evaluate
YEARS=(2025,2026)
ATTRIBUTION="ChainCC. League of Legends esports match dataset. https://chaincc.lol/free/data/ (CC BY 4.0)."
def inspect(raw,year,today):
    rows,_=read_players(raw)
    if not rows or len(rows)>200000:raise ValueError("row bound")
    if any(not r["date"].startswith(str(year)+"-") or date.fromisoformat(r["date"])>=today for r in rows):raise ValueError("date cohort")
    games,excluded=complete_games(rows)
    if not games:raise ValueError("no complete games")
    explicit=sum({frozenset({r.get("won") for r in g if r["team"]==t}) for t in {r["team"] for r in g}}=={frozenset({0}),frozenset({1})} for g in games)
    return games,{"parsedRows":len(rows),"completeGames":len(games),"completePlayerRows":len(games)*10,"explicitOutcomeGames":explicit,"excluded":excluded}
def write_once(p,raw):
    if p.is_symlink():raise ValueError("symlink")
    if p.exists():
        if p.read_bytes()!=raw:raise ValueError("archive conflict")
        return False
    with p.open("xb") as f:f.write(raw)
    return True
def run(root):
    root=Path(root).resolve()
    if root==Path(__file__).resolve().parents[1] or not (root/".git").exists() or os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1":raise ValueError("private checkout required")
    base=root/"research/esports-native-history/chaincc"
    if any(p.is_symlink() for p in [base,base.parent,base.parent.parent]):raise ValueError("symlink")
    base.mkdir(parents=True,exist_ok=True)
    today=datetime.now(timezone.utc).date()
    reports=[]
    for year in YEARS:
        url=f"https://chaincc.lol/data/chaincc-players-{year}.csv.gz"
        raw=get(url,25_000_000)
        digest=hashlib.sha256(raw).hexdigest()
        games,counts=inspect(raw,year,today)
        name=f"{year}-{digest}.csv.gz"
        metrics=evaluate(games)
        p=base/name
        if p.exists():
            if p.is_symlink() or p.read_bytes()!=raw or not (base/(name+".json")).is_file():raise ValueError("existing cache conflict")
            created=False
        else:
            meta={"kind":"chaincc_native_historical_cache_v1","season":year,"sourceUrl":url,"sha256":digest,"bytes":len(raw),"observedAt":datetime.now(timezone.utc).isoformat(),"attribution":ATTRIBUTION,"license":"https://creativecommons.org/licenses/by/4.0/","sourceNativeOnly":True,"crossSourceIdentityVerified":False,"officialFinalClockVerified":False,"prospectiveUseApproved":False,"counts":counts}
            write_once(p,raw)
            write_once(base/(name+".json"),(json.dumps(meta,sort_keys=True)+"\n").encode())
            created=True
        reports.append({"season":year,"sha256":digest,"newCache":created,**counts,"retrospectiveContext":metrics})
    return {"kind":"chaincc_private_historical_intake_v1","reports":reports,"paidRequests":0,"rawRowsPublished":0,"actualOriginalOffers":0,"modelPromoted":False}
if __name__=="__main__":
    try:print(json.dumps(run(sys.argv[1]),allow_nan=False),flush=True)
    except Exception as e:
        print(json.dumps({"kind":"chaincc_private_historical_intake_failure_v1","reason":type(e).__name__,"paidRequests":0,"rawRowsPublished":0}),flush=True)
        sys.exit(1)
