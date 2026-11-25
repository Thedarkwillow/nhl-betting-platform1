#!/usr/bin/env python3
"""Bounded no-key research. Never writes raw data to public Git, never invents prop lines."""
import csv, gzip, io, json, hashlib, pathlib, sys, time, urllib.request, urllib.error
from collections import defaultdict, Counter
from datetime import datetime, timezone
P=pathlib.Path
ROOT=P(__file__).resolve().parents[1]
def download(url, limit):
    req=urllib.request.Request(url,headers={"User-Agent":"SportsResearchDataAudit/1.0","Accept":"*/*"})
    with urllib.request.urlopen(req,timeout=35) as f:
        b=f.read(limit+1)
    if len(b)>limit: raise ValueError("source exceeds limit")
    return b
def safe_error(e):
    return "http_"+str(e.code) if isinstance(e,urllib.error.HTTPError) else type(e).__name__
def nba(out):
    import pyarrow.parquet as pq
    cfg=json.loads((ROOT/"config/nba/free-pinned-recovery-v1.json").read_text())
    rows=[]
    tables={}
    for s in cfg["assets"]:
        r={"file":s["path"].split("/")[-1],"repository":s["repo"]}
        try:
            if not s["url"].startswith("https://raw.githubusercontent.com/sportsdataverse/") or not 0<s["bytes"]<=2_000_000: raise ValueError("source")
            raw=download(s["url"],s["bytes"])
            gitblob=hashlib.sha1(("blob "+str(len(raw))).encode()+b"\0"+raw).hexdigest()
            if len(raw)!=s["bytes"] or gitblob!=s["gitBlob"]:raise ValueError("integrity")
            table=pq.read_table(io.BytesIO(raw))
            tables[(s["repo"],r["file"])]=table
            r.update(status="verified_download",rows=table.num_rows,columns=table.schema.names,sha256=hashlib.sha256(raw).hexdigest())
        except Exception as e:r.update(status="unavailable",reason=safe_error(e))
        rows.append(r)
    # Exact ID crosswalk only; report candidate coverage for full 2027 injury source.
    # Do not claim these are the 135 unresolved historical out rows until the original 57-game cohort is reproduced.
    result={"status":"schema_recovery_only","candidateOutRows":None,"candidateExactIdMatches":None,"original135ResolvedVerified":0}
    try:
        i=tables[("sportsdataverse/hoopR-nba-stats-data","injury_report_2027.parquet")].to_pylist()
        c=tables[("sportsdataverse/hoopR-nba-data","nba_player_crosswalk_2027.parquet")].to_pylist()
        if not i or not c or not {"person_id","match_method","current_status"}<=i[0].keys() or not {"nba_player_id","espn_athlete_id"}<=c[0].keys():raise ValueError("schema")
        ids=defaultdict(set)
        for x in c:
            if x["nba_player_id"] is not None and x["espn_athlete_id"] is not None:ids[str(x["nba_player_id"])].add(str(x["espn_athlete_id"]))
        outs=[x for x in i if str(x["current_status"]).lower()=="out"]
        match=sum(x["match_method"]=="exact" and len(ids.get(str(x["person_id"]),()))==1 for x in outs)
        result.update(status="full_source_exact_crosswalk_diagnostic",candidateOutRows=len(outs),candidateExactIdMatches=match)
    except Exception as e:result["mappingDiagnosticBlocker"]=safe_error(e)
    return {"kind":"public_nba_free_recovery_v2","assets":rows,"verifiedDownloads":sum(x["status"]=="verified_download" for x in rows),"mapping":result,"freezeApproved":False,"paidRequests":0}
def baseline(rows):
    # Retrospective observed stats only; full dates are withheld as a block.
    clean=[];seen=set();bad=set()
    for x in rows:
        key=(x["event"],x["player"])
        if key in seen:bad.add(key)
        seen.add(key);clean.append(x)
    clean=[x for x in clean if (x["event"],x["player"]) not in bad]
    dates=sorted({x["date"] for x in clean})
    cutoff=dates[int(len(dates)*.8)] if len(dates)>=5 else None
    h=defaultdict(list);score=defaultdict(lambda:[0,0.,0.]);days=defaultdict(list)
    for x in clean:days[x["date"]].append(x)
    for day in dates:
        batch=days[day]
        if cutoff and day>=cutoff:
            for x in batch:
                for market in ("kills","assists","deaths"):
                    a=h[(x["player"],market)]
                    if len(a)<5:continue
                    z=score[market];z[0]+=1;z[1]+=abs(sum(a[-5:])/len(a[-5:])-x[market]);z[2]+=abs(sum(a[-20:])/len(a[-20:])-x[market])
        for x in batch:
            for m in ("kills","assists","deaths"):h[(x["player"],m)].append(x[m])
    return {"validRows":len(clean),"dates":len(dates),"duplicateKeysExcluded":len(bad),"holdoutStart":cutoff,"markets":{m:{"n":z[0],"last5MAE":z[1]/z[0],"last20MAE":z[2]/z[0]} for m,z in score.items() if z[0]},"actualPropLines":0,"prospectiveApproval":False}
def lol():
    rows=[];sources=[]
    for season in (2025,2026):
        url=f"https://chaincc.lol/data/chaincc-players-{season}.csv.gz"
        try:
            raw=download(url,25_000_000)
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as f:content=f.read(180_000_001)
            if len(content)>180_000_000:raise ValueError("expanded limit")
            reader=csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
            cols=set(reader.fieldnames or [])
            date=next((x for x in ("date","game_date","datetime","game_datetime") if x in cols),None)
            player=next((x for x in ("player_id","playerid","player_name","playername","player") if x in cols),None)
            if not date or not player or not {"game_id","kills","assists","deaths"}<=cols:raise ValueError("schema")
            valid=0
            for r in reader:
                try:
                    d=r[date][:10];datetime.strptime(d,"%Y-%m-%d")
                    if not r[player] or not r["game_id"]:continue
                    vals={m:int(r[m]) for m in ("kills","assists","deaths")}
                    if min(vals.values())<0:continue
                    row=dict(event=r["game_id"],player=r[player],date=d,champion=r.get("champion") or r.get("champion_name"),position=r.get("position") or r.get("role"),team=r.get("teamname") or r.get("team_name") or r.get("team"),league=r.get("league"),patch=r.get("patch"),**vals)
                    for k in ("total_cs","totalcs","creep_score","cs"):
                        v=r.get(k)
                        if v and v.isdecimal():
                            row["creep_score"]=int(v);break
                    rows.append(row);valid+=1
                except (TypeError,ValueError,KeyError):continue
            sources.append({"season":season,"status":"read","rows":valid,"sha256":hashlib.sha256(raw).hexdigest()})
        except Exception as e:sources.append({"season":season,"status":"unavailable","reason":safe_error(e)})
    from esports_context_models import evaluate as context_eval
    groups=defaultdict(list)
    for r in rows:groups[r["event"]].append(r)
    complete=[r for a in groups.values() if len(a)==10 and len({x["player"] for x in a})==10 and len({x["date"] for x in a})==1 for r in a]
    creep=[r for r in complete if "creep_score" in r]
    return {"completeGameRows":len(complete),"creepScoreRows":len(creep),"completeGameContext":context_eval(complete,("kills","deaths","assists"),["position","team","league","patch"]),"creepContext":context_eval(creep,("creep_score",),["position","team"]),"context":context_eval(rows,("kills","deaths","assists"),["champion","position"]),"title":"LOL","source":"ChainCC, League of Legends esports match dataset, https://chaincc.lol/free/data/, CC BY 4.0","sources":sources,"baseline":baseline(rows),"sourceClaimsIndependentlyVerified":False}
def dota():
    rows=[];requests=0;matches=0
    try:
        requests+=1;index=json.loads(download("https://api.opendota.com/api/proMatches",2_000_000))
        if not isinstance(index,list):raise ValueError("index")
        for x in index[:12]:
            mid=x.get("match_id")
            if type(mid)is not int or mid<=0:continue
            time.sleep(1.2);requests+=1
            try:
                m=json.loads(download(f"https://api.opendota.com/api/matches/{mid}",5_000_000))
                if m.get("match_id")!=mid or not m.get("leagueid") or not m.get("radiant_team_id") or not m.get("dire_team_id") or not m.get("duration") or len(m.get("players",[]))!=10:continue
                if len({p.get("account_id") for p in m["players"]})!=10:continue
                d=datetime.fromtimestamp(m["start_time"],timezone.utc).date().isoformat()
                batch=[]
                for p in m["players"]:
                    vals={k:p.get(k) for k in ("kills","assists","deaths")}
                    if not p.get("account_id") or any(type(v)is not int or v<0 for v in vals.values()):break
                    batch.append(dict(event=str(mid),player=str(p["account_id"]),date=d,**vals))
                if len(batch)==10:rows.extend(batch);matches+=1
            except urllib.error.HTTPError as e:
                if e.code in (403,429):break
            except (ValueError,KeyError,TypeError):continue
        return {"title":"DOTA2","source":"OpenDota professional match API","freeRequests":requests,"verifiedMatchShapes":matches,"baseline":baseline(rows),"seriesAndMapScopeVerified":False}
    except Exception as e:return {"title":"DOTA2","freeRequests":requests,"status":"unavailable","reason":safe_error(e),"baseline":baseline(rows)}
def main():
    cmd=sys.argv[1]
    if cmd=="nba":r=nba(None)
    elif cmd=="esports":r={"kind":"public_esports_free_history_attempt_v1","titles":[lol(),dota()],"paidRequests":0,"rawRowsPublished":0,"productionApproved":False}
    else:raise ValueError("mode")
    print(json.dumps(r,allow_nan=False))
if __name__=="__main__":main()
