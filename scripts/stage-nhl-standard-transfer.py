#!/usr/bin/env python3
"""Stage private temporary rows for a three-season transfer experiment."""
import importlib.util, json, sys, os
from pathlib import Path
spec=importlib.util.spec_from_file_location("dedicated",Path(__file__).with_name("research-nhl-dedicated-skater-goalie.py"))
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
def convert(r):
    a=r["actual"]
    out=dict(season=r["season"],gameDate=r["day"],gameId=r["game"],playerId=r["player"],team=r["team"],opponent=r["opponent"],type="skater" if r["role"]=="skaters" else "goalie",gameState="FINAL",timeOnIceSeconds=r["toi"])
    for m in ("shotsOnGoal","points","assists","goals","blockedShots","saves"):
        v=a.get(m)
        if v is not None and v>=0 and float(v).is_integer():out[m]=int(v)
    for k in ("attempts","xg","onIceGoals","againstAttempts"):
        v=r["features"].get(k)
        if v is not None and v>=0:out[k]=v
    if r["role"]=="goalies":
        v=r["features"].get("faced")
        if v is not None and float(v).is_integer() and v>=a["saves"]:out["shotsAgainst"]=int(v)
    return out
def main():
    if len(sys.argv)!=2:raise ValueError("temporary path required")
    dest=Path(sys.argv[1])
    lab.core.lab.normalize=lab.normalize
    os.umask(0o077)
    counts={}
    with dest.open("x") as out:
        for season in lab.core.lab.SEASONS:
            for role in ("skaters","goalies"):
                archive=lab.core.lab.download_archive(season,role)
                counts[f"{season}:{role}"]=len(archive)
                for r in archive:out.write(json.dumps(convert(r),separators=(",",":"))+"\n")
    print("Private temporary stage complete; six bounded season archives.")
if __name__=="__main__":main()
