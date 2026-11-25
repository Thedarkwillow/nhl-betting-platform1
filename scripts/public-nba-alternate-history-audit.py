#!/usr/bin/env python3
"""Counts-only alternate NBA history and native identity audit.
No source rows, player IDs, or commercial model outputs are republished.
NBA Stats-derived hoopR release mirrors are not independent official finals.
"""
import collections, datetime as dt, hashlib, io, json, math, pathlib, re, subprocess, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
RELEASE="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
SEASONS=(2024,2025,2026,2027)
FIELDS=("pts","reb","ast","fg3m","stl","blk","tov")
TEAM_ALIAS={"GS":"GSW","NO":"NOP","NY":"NYK","SA":"SAS","SAN":"SAS","PHO":"PHX","UTAH":"UTA","WSH":"WAS","BRK":"BKN","WAS":"WAS"}
TEAM_CODES=set("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split())
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def team(x): return TEAM_ALIAS.get(str(x or "").upper(),str(x or "").upper())
def name(x):
    import unicodedata
    return " ".join(re.sub(r"[^a-z0-9]+"," ",unicodedata.normalize("NFKD",str(x or "")).encode("ascii","ignore").decode().lower()).split())
def pid(x):
    s=str(x or "")
    return s if re.fullmatch(r"[1-9][0-9]{0,11}",s) else None
def fetch(tag,stem,season):
    import pyarrow.parquet as pq
    url=RELEASE+tag+"/"+stem+"_"+str(season)+".parquet"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"public-sports-research-audit/1.0"}),timeout=40) as res:
        if not res.geturl().startswith("https://"): raise ValueError("non-https redirect")
        raw=res.read(40_000_001)
    if len(raw)>40_000_000: raise ValueError("asset too large")
    t=pq.read_table(io.BytesIO(raw))
    if t.num_rows>200000: raise ValueError("unexpected size")
    return t.to_pylist(),{"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"sourceRows":t.num_rows}
def normalize(rows,season,today):
    games=collections.defaultdict(list);seen=set();bad=set();excluded=0
    for x in rows:
        if x.get("season_type")!="Regular Season": continue
        try:
            g=x["game_id"];p=pid(x["player_id"]);day=dt.date.fromisoformat(str(x["game_date"])[:10])
            t=team(x["team_abbreviation"]);m=re.fullmatch(r"([A-Z]{2,3}) (vs\.|@) ([A-Z]{2,3})",x["matchup"])
            if not m or team(m[1])!=t:raise ValueError()
            o=team(m[3]);minutes=x["min"]
            if x.get("season")!=season or str(x.get("season_id"))!="2"+str(season-1) or not isinstance(g,str) or not re.fullmatch(r"002"+str(season-1)[-2:]+r"\d{5}",g) or not p or t not in TEAM_CODES or o not in TEAM_CODES or t==o or day>=today or day.year+(day.month>=7)!=season or not name(x["player_name"]) or x["wl"] not in ("W","L") or type(minutes) not in (int,float) or not math.isfinite(minutes) or not 0<minutes<=70 or not all(type(x[k]) in (int,float) and math.isfinite(x[k]) and x[k]==int(x[k]) and x[k]>=0 for k in FIELDS):raise ValueError()
            k=(g,p)
            if k in seen:bad.add(g);continue
            seen.add(k);games[g].append({"game":g,"player":p,"name":x["player_name"],"team":t,"opponent":o,"day":day.isoformat(),"home":m[2]=="vs.","wl":x["wl"],"minutes":minutes,**{k:int(x[k]) for k in FIELDS}})
        except (ValueError,KeyError,TypeError,OverflowError):excluded+=1
    accepted=[]
    for g,rs in games.items():
        ts={r["team"] for r in rs}
        if g in bad or len(ts)!=2 or len({r["day"] for r in rs})!=1 or len({r["wl"] for r in rs})!=2:excluded+=len(rs);continue
        a,b=([r for r in rs if r["team"]==t] for t in ts)
        if min(len(a),len(b))<5 or any(len({(r["home"],r["wl"],r["opponent"]) for r in side})!=1 for side in (a,b)) or a[0]["home"]==b[0]["home"] or a[0]["wl"]==b[0]["wl"] or a[0]["opponent"]!=b[0]["team"] or b[0]["opponent"]!=a[0]["team"]:excluded+=len(rs);continue
        accepted.extend(rs)
    if not accepted:raise ValueError("no validated games")
    return accepted,excluded
def read_docs(rel,kind):
    for p in sorted((ROOT/rel).glob("*.json")):
        try:
            raw=p.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=p.stem:continue
            d=json.loads(raw)
            if d.get("kind")==kind:yield d
        except (ValueError,OSError):continue
def native_facts(sport):
    ds=[d for d in read_docs("research/pickfinder-public-identity-v1/native-facts","independent_public_sport_identity_facts_v1") if d.get("sport")==sport and d.get("source")=="espn:"+sport]
    return max(ds,key=lambda d:d["observedAt"]) if ds else {}
def nba_join(cross,roster,history):
    # Published crosswalks can themselves be name matches. Require explicit IDs,
    # matching current ESPN team, and historical NBA person ID/name/team evidence.
    by=collections.defaultdict(set);reverse=collections.defaultdict(set);last={}
    for x in cross:
        e,n=pid(x.get("espn_athlete_id")),pid(x.get("nba_player_id"))
        if e and n and x.get("season")==2027:
            by[e].add(n);reverse[n].add(e)
    for x in history:
        k=x["player"]
        if k not in last or x["day"]>last[k]["day"]:last[k]=x
    matched=set()
    for e in roster:
        eid=pid(e.get("playerId")); candidates=by.get(eid,set())
        if len(candidates)!=1:continue
        n=next(iter(candidates));h=last.get(n)
        if len(reverse[n])!=1 or not h or name(h["name"])!=name(e.get("name")) or h["team"]!=team(e.get("team")):continue
        if not any(pid(x.get("espn_athlete_id"))==eid and pid(x.get("nba_player_id"))==n and pid(x.get("espn_team_id"))==pid(e.get("teamId")) and name(x.get("espn_full_name"))==name(e.get("name")) and name(x.get("nba_player_name"))==name(h["name"]) for x in cross):continue
        matched.add((eid,n))
    return matched
def nfl_join(facts,history,at):
    # Exact IDs, same week/team and event clocks; no paid calls or name-only joins.
    rows=set();games=set();parse=lambda x:dt.datetime.fromisoformat(x.replace("Z","+00:00"))
    for g in facts.get("events",[]):
        if g.get("status")!="pre" or parse(g["startAt"])<=at:continue
        def nt(t):return {"JAC":"JAX","WSH":"WAS","LA":"LAR","AZ":"ARI"}.get(t,t)
        pair={nt(t["abbr"]) for t in g["teams"]}
        matches=[x for x in history.get("games",[]) if x["espnEventId"]==g["eventId"] and {x["home"],x["away"]}==pair and abs((parse(x["startAt"])-parse(g["startAt"])).total_seconds())<=300]
        if len(matches)!=1:continue
        n=matches[0];games.add(n["gameId"])
        for e in facts.get("roster",[]):
            c=[x for x in history.get("rosters",[]) if x["week"]==n["week"] and x["espnId"]==e["playerId"] and x["team"]==nt(e["team"]) and x["team"] in pair]
            if len(c)==1:rows.add((n["gameId"],e["playerId"],c[0]["gsisId"]))
    return {"matchedEvents":len(games),"candidateRows":len(rows),"pickfinderIdentityVerified":False}
def main():
    today=dt.datetime.now(dt.timezone.utc).date();history=[];seasons={}
    for season in SEASONS:
        try:
            raw,meta=fetch("nba_stats_player_game_logs","player_game_logs",season)
            rows,excluded=normalize(raw,season,today);history.extend(rows);games=len({x["game"] for x in rows})
            seasons[str(season)]={**meta,"status":"observed","acceptedRows":len(rows),"games":games,"excludedRegularSeasonRows":excluded,"firstGame":min(x["day"] for x in rows),"lastGame":max(x["day"] for x in rows),"expectedCompletedSeasonGames":1230 if season<2027 else None,"allExpectedGamesObserved":season<2027 and games==1230}
        except Exception as e:seasons[str(season)]={"status":"pending","reason":type(e).__name__}
    cross={"status":"pending"}
    try:
        data,meta=fetch("nba_crosswalk","nba_player_crosswalk",2027);facts=native_facts("nba")
        current=[x for x in history if x["day"]>="2026-07-01"]
        cross={**meta,"status":"observed","espnRosterPlayers":len(facts.get("roster",[])),"nativeIdentityCandidates":len(nba_join(data,facts.get("roster",[]),current)),"pickfinderIdentityVerified":False}
    except Exception as e:cross={"status":"pending","reason":type(e).__name__}
    nfls=[x for x in read_docs("research/pickfinder-public-nfl-v1/season","nflverse_public_native_history_v1") if x.get("season")==2026]
    nfl=nfl_join(native_facts("nfl"),max(nfls,key=lambda x:x["observedAt"]) if nfls else {},dt.datetime.now(dt.timezone.utc))
    out={"kind":"public_nba_alternate_history_audit_v1","generatedAt":now(),"seasons":seasons,"acceptedRows":len(history),"nbaNativeCrosswalk":cross,"nflNativeCrosswalk":nfl,"rawRowsPublished":0,"officialFinalClockVerified":False,"independentlyReviewedPickfinderCrosswalks":0,"modelApproved":False,"paidRequests":0,"privateRepoUsed":False,"sourceUse":"counts-only research source audit; upstream redistribution and commercial rights not established"}
    p=ROOT/"data/pickfinder-public-nba-alternate-health.json";p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(out,indent=2)+"\n");print(json.dumps(out))
if __name__=="__main__":main()
