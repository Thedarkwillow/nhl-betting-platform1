#!/usr/bin/env python3
"""Pinned Kaggle wide-format CS2 history, dated source-local IDs only.
Attribution: ektarr, Counter-Strike Pro Matches, CC BY-SA 4.0 as declared.
Underlying rights, map ordinal, original prop offers and settlement not verified.
"""
import csv,hashlib,io,json,re,urllib.request,zipfile
from collections import Counter,defaultdict
from datetime import date
from esports_context_models import evaluate
URL="https://www.kaggle.com/api/v1/datasets/download/ektarr/counter-strike-pro-matches"
SHA="02fd2eb78c50a9c2fa819ceaf8281f9db030f69f32f4e0cba34a1f64867131ee"
SIZE=5817137
MARKETS=("kills","deaths","assists")
def integer(v):
    if not isinstance(v,str) or not re.fullmatch(r"\d+(?:\.0+)?",v.strip()):raise ValueError("count")
    return int(v.split(".")[0])
def ident(v):
    n=integer(v)
    if not n:raise ValueError("id")
    return str(n)
def finished_score(a,b):
    w,l=max(a,b),min(a,b)
    return w==13 and l<=11 or w>=16 and (w-16)%3==0 and 2<=w-l<=4
def parse(reader):
    groups={};seen=Counter();excluded=Counter();flags=Counter();raw=0;days=set()
    for r in reader:
        raw+=1
        if raw>30000:raise ValueError("row_cap")
        try:
            day=r["datetime"][:10];date.fromisoformat(day)
            if not "2023-09-27"<=day<"2026-11-25":excluded["outside_cs2_history"]+=1;continue
            days.add(day)
            flag=str(r.get("is_total","")).strip().lower()
            flags[flag if flag in ("0","0.0","false","1","1.0","true","") else "other"]+=1
            if flag not in ("0","0.0","false"):
                excluded["series_summary_or_unknown_flag"]+=1;continue
            mid=ident(r["match_id"]);gid=r["game_id"].strip();
            if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}",gid):raise ValueError("game_id")
            key=(mid,gid);seen[key]+=1
            mp=r["map_name"].strip()
            if not mp or not ident(r["map_id"]):raise ValueError("map")
            teams=[ident(r["team1_id"]),ident(r["team2_id"])]
            if len(set(teams))!=2:raise ValueError("team")
            a,b=integer(r["score1_game"]),integer(r["score2_game"])
            if not finished_score(a,b):excluded["unverified_final_score"]+=1;continue
            batch=[]
            for side in (1,2):
                for i in range(1,6):
                    p=f"team{side}_player{i}"
                    pid=ident(r[p+"_id"])
                    vals={m:integer(r[p+"_"+m]) for m in MARKETS}
                    if vals["kills"]>5*(a+b) or vals["deaths"]>a+b:raise ValueError("round_counts")
                    name=r[p].strip()
                    if not name:raise ValueError("name")
                    batch.append(dict(event=mid+"|"+gid,player="ektarr:"+pid,date=day,map=mp,team=teams[side-1],rounds=a+b,**vals))
            if len({x["player"] for x in batch})!=10:raise ValueError("duplicate_player")
            groups[key]=batch
        except (ValueError,KeyError,AttributeError,TypeError):excluded["invalid_map_row"]+=1
    rows=[r for key,b in groups.items() if seen[key]==1 for r in b]
    dates=sorted({r["date"] for r in rows})
    return rows,{"sourceRows":raw,"completeMaps":len(rows)//10,"playerMapRows":len(rows),"distinctSourcePlayers":len({r["player"] for r in rows}),"dates":len(dates),"dateMin":dates[0] if dates else None,"dateMax":dates[-1] if dates else None,"excluded":dict(excluded),"totalFlagCounts":dict(flags),"duplicateMapKeys":sum(n>1 for n in seen.values()),"sourceLocalIdsOnly":True,"mapOrdinalVerified":False,"headshotCountsAvailable":False}
def main():
    try:
        req=urllib.request.Request(URL,headers={"User-Agent":"CS2ResearchDataAudit/1.0"})
        with urllib.request.urlopen(req,timeout=45) as f:raw=f.read(SIZE+1)
        if len(raw)!=SIZE or hashlib.sha256(raw).hexdigest()!=SHA:raise ValueError("pinned_source_changed")
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            matches=[x for x in z.infolist() if x.filename.split("/")[-1]=="cs2_all_tiers_games.csv"]
            if len(matches)!=1 or matches[0].file_size>80_000_000:raise ValueError("archive_contract")
            with z.open(matches[0]) as f:rows,report=parse(csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig",newline="")))
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        spec=spec_from_file_location("free",Path(__file__).with_name("public-eight-free-history.py"));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        print(json.dumps({"kind":"cs2_ektarr_wide_history_v1","sourceSha256":SHA,"declaredLicense":"CC BY-SA 4.0","underlyingRightsIndependentlyVerified":False,**report,"baseline":mod.baseline(rows),"context":evaluate(rows,MARKETS,["map"]),"actualPropLines":0,"modelPromoted":False,"paidRequests":0,"rawRowsPublished":0}))
    except Exception as e:
        print(json.dumps({"kind":"cs2_ektarr_wide_history_v1","status":"unavailable","reason":str(e) if isinstance(e,ValueError) and str(e) in ("pinned_source_changed","archive_contract","row_cap") else type(e).__name__,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()
