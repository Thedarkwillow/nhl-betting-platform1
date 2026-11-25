#!/usr/bin/env python3
"""Bounded historical stats-only research; no raw public writes or prop claims."""
import csv, hashlib, importlib.util, json, pathlib, tempfile, time, urllib.parse, urllib.error
from collections import defaultdict, Counter
from datetime import datetime, timezone
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("free",ROOT/"scripts/public-eight-free-history.py")
free=importlib.util.module_from_spec(spec);spec.loader.exec_module(free)
def col(cols,names):
    for n in names:
        if n in cols:return n
    raise ValueError("missing documented field")
def vct():
    import duckdb
    raw=free.download("https://vct-reference.com/dataset/vct.duckdb",32_000_000)
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)/"vct.duckdb";p.write_bytes(raw)
        db=duckdb.connect(str(p),read_only=True,config={"enable_external_access":"false"})
        cols={t:{r[0] for r in db.execute("describe "+t).fetchall()} for t in ("matches","maps","player_map")}
        print(json.dumps({"stage":"vct_schema","bytes":len(raw),"columns":{k:sorted(x) for k,x in cols.items()}}),flush=True)
        candidates=["match_datetime_utc","match_date_utc","match_start_utc","start_time_utc","match_timestamp","timestamp_utc","start_at","match_datetime","match_date","datetime_utc","date_utc","start_time","date","match_time","timestamp","start_ts","start_ts_utc","match_ts","match_ts_utc","date_time_utc","start_utc","match_time_utc","date_time","datetime"]
        try:stamp=col(cols["matches"],candidates)
        except ValueError:
            typed=[x[0] for x in db.execute("describe matches").fetchall() if ("TIMESTAMP" in x[1].upper() or x[1].upper()=="DATE") and any(k in x[0].lower() for k in ("date","start","match","time")) and not any(k in x[0].lower() for k in ("update","created","scrape","end"))]
            if len(typed)!=1:raise ValueError("ambiguous match clock")
            stamp=typed[0]
        needed={"match_id","game_id","player_id","kills_all","deaths_all","assists_all"}
        if not needed<=cols["player_map"]:raise ValueError("player-map schema")
        optional=[]
        for field,names in (("agent",("agents","agent","agent_name")),("team",("team_id",)),("opening_kills",("fk_all","first_kills_all")),("opening_deaths",("fd_all","first_deaths_all"))):
            colname=next((n for n in names if n in cols["player_map"]),None)
            if colname:optional.append((field,colname))
        extra="".join(',pm."'+n+'"' for _,n in optional)
        q=f"""select cast(m."{stamp}" as varchar),cast(pm.match_id as varchar),cast(pm.game_id as varchar),cast(pm.player_id as varchar),
                    pm.kills_all,pm.deaths_all,pm.assists_all,mp.map_name,m.patch,m.team0_id,m.team1_id,pm.team_idx,mp.score0,mp.score1,mp.duration{extra}
              from player_map pm join matches m using(match_id)
              join maps mp using(match_id,game_id)
              where m.listing_status='Completed' and m.is_showmatch=false
              and pm.kills_all is not null and pm.deaths_all is not null and pm.assists_all is not null
              order by 1,2,3,4"""
        rows=[];maps=defaultdict(list)
        for dt,mid,gid,pid,k,d,a,mapname,patch,t0,t1,slot,s0,s1,duration,*extras in db.execute(q).fetchall():
            try:
                day=(datetime.fromtimestamp(float(dt)/(1000 if float(dt)>1e12 else 1),timezone.utc).date().isoformat() if str(dt).replace(".","",1).isdigit() else str(dt)[:10]);datetime.strptime(day,"%Y-%m-%d")
                if not all(x is not None and float(x).is_integer() and x>=0 for x in (k,d,a)):continue
                row=dict(event=mid+"|"+gid,player=pid,date=day,map=mapname,kills=int(k),deaths=int(d),assists=int(a))
                if patch is not None:row["patch"]=str(patch)
                if slot in (0,1) and t0 is not None and t1 is not None and t0!=t1:
                    row["team"]=str((t0,t1)[slot]);row["opponent"]=str((t1,t0)[slot])
                if all(type(x) is int and x>=0 for x in (s0,s1)) and max(s0,s1)>=13 and s0!=s1:row["rounds"]=s0+s1
                if type(duration) is int and duration>0:row["durationNative"]=duration
                for (key,_),value in zip(optional,extras):
                    if key=="agent" and value is not None:
                        if isinstance(value,list) and len(value)==1 and isinstance(value[0],str):row[key]=value[0]
                        elif isinstance(value,str) and value.strip() and not any(x in value for x in ("[","]",",",";","|")):row[key]=value.strip()
                    elif key=="team" and value is not None and "team" not in row:row[key]=str(value)
                    elif key in ("opening_kills","opening_deaths") and type(value) is int and value>=0:row[key]=value
                maps[(mid,gid)].append(row)
            except (TypeError,ValueError):continue
        for batch in maps.values():
            if len(batch)==10 and len({x["player"] for x in batch})==10:rows.extend(batch)
        if not rows:raise ValueError("no complete map rows")
        db.close()
    from esports_context_models import evaluate as context_eval
    from esports_exposure_research import evaluate as exposure_eval
    return {"sourceContextFields":[k for k,_ in optional],"context":context_eval(rows,("kills","deaths","assists"),["map","agent","team","opponent","patch"]),"openingContext":context_eval([r for r in rows if "opening_kills" in r and "opening_deaths" in r],("opening_kills","opening_deaths"),["map","agent","team","opponent","patch"]),"roundExposure":exposure_eval(rows,("kills","deaths","assists"),"rounds"),"durationNativeCoverage":sum("durationNative" in r for r in rows),"title":"VALORANT","source":"VCT Reference; user reports specific research permission; redistribution unverified","sha256":hashlib.sha256(raw).hexdigest(),"completeMaps":len(rows)//10,"baseline":free.baseline(rows),"paidRequests":0}
def dota():
    # The documented Explorer endpoint provides player-match rows in one bounded read.
    sql="""SELECT m.match_id,m.start_time,m.duration,pm.account_id,pm.kills,pm.deaths,pm.assists,pm.hero_id,pm.last_hits,pm.player_slot,m.radiant_team_id,m.dire_team_id
    FROM matches m JOIN player_matches pm ON m.match_id=pm.match_id
    WHERE m.leagueid>0 AND m.radiant_team_id>0 AND m.dire_team_id>0
    AND m.start_time>=1735689600 AND pm.account_id>0
    ORDER BY m.match_id DESC LIMIT 30000"""
    try:
        obj=json.loads(free.download("https://api.opendota.com/api/explorer?"+urllib.parse.urlencode({"sql":sql}),24_000_000))
        groups=defaultdict(list)
        for r in obj["rows"]:
            if not all(type(r.get(k)) is int and r[k]>=0 for k in ("kills","deaths","assists")):continue
            day=datetime.fromtimestamp(int(r["start_time"]),timezone.utc).date().isoformat()
            row=dict(event=str(r["match_id"]),player=str(r["account_id"]),date=day,hero=str(r["hero_id"]) if type(r.get("hero_id")) is int and r["hero_id"]>0 else None,**{k:r[k] for k in ("kills","deaths","assists")})
            if type(r.get("last_hits")) is int and r["last_hits"]>=0:row["last_hits"]=r["last_hits"]
            if type(r.get("duration")) is int and r["duration"]>0:row["durationSeconds"]=r["duration"]
            slot=r.get("player_slot");teams=(r.get("radiant_team_id"),r.get("dire_team_id"))
            if type(slot) is int and slot in (*range(5),*range(128,133)) and all(type(t) is int and t>0 for t in teams) and teams[0]!=teams[1]:
                side=int(slot>=128);row["team"]=str(teams[side]);row["opponent"]=str(teams[1-side])
            groups[str(r["match_id"])].append(row)
        rows=[r for g in groups.values() if len(g)==10 and len({x["player"] for x in g})==10 for r in g]
        if not rows:raise ValueError("no complete matches")
        from esports_context_models import evaluate as context_eval
        from esports_exposure_research import evaluate as exposure_eval
        return {"durationExposure":exposure_eval(rows,("kills","deaths","assists"),"durationSeconds"),"lastHitExposure":exposure_eval(rows,("last_hits",),"durationSeconds"),"lastHitRows":sum("last_hits" in r for r in rows),"lastHitContext":context_eval([r for r in rows if "last_hits" in r],("last_hits",),["hero","team","opponent"]),"context":context_eval(rows,("kills","deaths","assists"),["hero","team","opponent"]),"title":"DOTA2","source":"OpenDota Explorer professional league matches","completeMatches":len(rows)//10,"baseline":free.baseline(rows),"seriesMapScopeVerified":False,"freeRequests":1}
    except Exception as e:
        return {"title":"DOTA2","status":"explorer_unavailable","reason":free.safe_error(e),"fallback":free.dota()}
def main():
    results=[]
    for title,fn in [("VALORANT",vct),("DOTA2",dota)]:
        try:results.append(fn())
        except Exception as e:results.append({"title":title,"status":"unavailable","reason":free.safe_error(e)})
    print(json.dumps({"kind":"public_esports_history_sprint_v2","results":results,"paidRequests":0,"rawRowsPublished":0,"propValidation":False,"modelPromoted":False}))
if __name__=="__main__":main()
