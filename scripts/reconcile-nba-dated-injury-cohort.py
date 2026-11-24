#!/usr/bin/env python3
"""Reconstruct the original dated injury cohort from pinned free source tables.
Only count summaries leave runner memory; no new paid calls, no roster-based
retrospective identity resolution asserted to be pregame availability proof."""
import csv, hashlib, io, json, pathlib, re, sys, unicodedata, urllib.request
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
ROOT=pathlib.Path(__file__).resolve().parents[1]
EAST=ZoneInfo("America/New_York")
def norm(x):
    return re.sub("[^a-z0-9]","",unicodedata.normalize("NFKD",str(x or "")).encode("ascii","ignore").decode().lower())
def names(x):
    s=str(x or "").strip()
    a={norm(s)}
    if "," in s:
        left,right=s.split(",",1);a.add(norm(right+" "+left))
    return a-{""}
def ident(x):
    if x is None or isinstance(x,bool):return None
    s=str(x)
    if re.fullmatch(r"[0-9]+(?:\.0+)?",s):
        n=int(s.split(".")[0])
        return str(n) if n>0 else None
    return None
def utc(x,naive_east=False):
    try:
        d=x if isinstance(x,datetime) else datetime.fromisoformat(str(x).replace("Z","+00:00"))
        if d.tzinfo is None:
            if not naive_east:return None
            a=d.replace(tzinfo=EAST,fold=0);b=d.replace(tzinfo=EAST,fold=1)
            if a.utcoffset()!=b.utcoffset():return None
            d=a
        return d.astimezone(timezone.utc)
    except (ValueError,TypeError):return None
def abbr(x):
    s=str(x or "").strip().upper()
    return {"GS":"GSW","NY":"NYK","NO":"NOP","SA":"SAS","UTAH":"UTA","WSH":"WAS","BKN":"BKN","BRK":"BKN","PHO":"PHX"}.get(s,s)
def table_team(x):
    return norm(x).replace("losangelesclippers","laclippers")
def load():
    import pyarrow.parquet as pq
    cfg=json.loads((ROOT/"config/nba/free-pinned-recovery-v1.json").read_text())
    wanted={"nba_player_crosswalk_2027.parquet","nba_schedule_crosswalk_2027.parquet","nba_schedule_2027.parquet","game_rosters_2027.parquet","injury_report_2027.parquet"}
    out={}
    for s in cfg["assets"]:
        name=s["path"].split("/")[-1]
        if name not in wanted:continue
        if not s["url"].startswith("https://raw.githubusercontent.com/sportsdataverse/") or not 0<s["bytes"]<=2_000_000:raise ValueError("source config")
        req=urllib.request.Request(s["url"],headers={"User-Agent":"PublicNBAIdentityReconciliation/1.0"})
        with urllib.request.urlopen(req,timeout=35) as f:raw=f.read(s["bytes"]+1)
        if len(raw)!=s["bytes"] or hashlib.sha1(("blob "+str(len(raw))).encode()+b"\0"+raw).hexdigest()!=s["gitBlob"]:raise ValueError("source hash")
        out[(s["repo"].split("/")[-1],name)]=pq.read_table(io.BytesIO(raw)).to_pylist()
    if len(out)!=6:raise ValueError("missing pinned inputs")
    return out
def reconcile(offers,schedule,gamecross,cross,injuries,espnroster,nbaroster):
    gameoffers={}
    for r in offers:
        if r.get("league")!="NBA":raise ValueError("non-NBA archived line")
        k=r["game_id"];v=(r["home_team"],r["away_team"],r["start_time_utc"])
        if k in gameoffers and gameoffers[k]!=v:raise ValueError("inconsistent archive game")
        gameoffers[k]=v
    gameids=defaultdict(set)
    for r in gamecross:
        e,n=ident(r["espn_game_id"]),ident(r["nba_game_id"])
        if e and n:gameids[e].add(n)
    ids=defaultdict(set);reverse=defaultdict(set)
    for r in cross:
        n,e=ident(r["nba_player_id"]),ident(r["espn_athlete_id"])
        if n and e:ids[n].add(e);reverse[e].add(n)
    def old(r):
        n=ident(r["person_id"])
        return r["match_method"]=="exact" and len(ids[n])==1
    e_by=defaultdict(list);n_by=defaultdict(list)
    for r in espnroster:
        g=ident(r["game_id"])
        if g:e_by[(g,abbr(r["team_abbreviation"]))].append(r)
    for r in nbaroster:
        g=ident(r["game_id"])
        if g:n_by[(g,abbr(r["team_abbreviation"]))].append(r)
    # Crosswalk snapshot is not evidence of availability. Prior dated records
    # corroborate identity only; never substitute a later roster or fuzzy name.
    clocks={}
    for s in schedule:
        k=ident(s.get("game_id") or s.get("id"));t=utc(s.get("game_date_time") or s.get("date"))
        if k and t and len(gameids[k])==1:
            clocks[k]=t;clocks[next(iter(gameids[k]))]=t
    def prior_identity(r,nm,team,cutoff):
        rid=ident(r.get("person_id"))
        possible=[]
        for x in cross:
            nid,eid=ident(x.get("nba_player_id")),ident(x.get("espn_athlete_id"))
            if not nid or not eid or (rid and rid!=nid) or ids[nid]!={eid} or reverse[eid]!={nid}:continue
            if not (names(x.get("nba_player_name"))&nm and names(x.get("espn_full_name"))&nm):continue
            # Both the NBA and ESPN namespaces corroborate the same name;
            # dated team evidence must precede the report cutoff.
            er=any(g in clocks and clocks[g]<cutoff and cutoff-clocks[g]<=timedelta(days=60) and tm==team and any(ident(y.get("athlete_id"))==eid and names(y.get("athlete_display_name"))&nm for y in a) for (g,tm),a in e_by.items())
            nr=any(g in clocks and clocks[g]<cutoff and cutoff-clocks[g]<=timedelta(days=60) and tm==team and any(ident(y.get("player_id"))==nid and names(str(y.get("first_name",""))+" "+str(y.get("last_name","")))&nm for y in a) for (g,tm),a in n_by.items())
            if er and (nr or rid==nid):possible.append((nid,eid))
        return len(set(possible))==1
    games=[];unmatched=0
    for h,a,t in gameoffers.values():
        tip=utc(t)
        if not tip:unmatched+=1;continue
        hits=[]
        for s in schedule:
            start=utc(s.get("game_date_time") or s.get("date"))
            if not start or abs((start-tip).total_seconds())>1800:continue
            if table_team(s["home_display_name"])!=table_team(h) or table_team(s["away_display_name"])!=table_team(a):continue
            e=ident(s.get("game_id") or s["id"])
            if e and len(gameids[e])==1:
                hits.append((e,next(iter(gameids[e])),abbr(s["home_abbreviation"]),abbr(s["away_abbreviation"]),tip,start))
        hits=list(set(hits))
        if len(hits)!=1:unmatched+=1;continue
        games.append(hits[0])
    if len({g[0] for g in games})!=len(games):raise ValueError("duplicate mapped game")
    # Index original PDF mirror rows by date + both teams. Non-null game IDs
    # must agree; do not use same-day opponent data from a different game.
    by=defaultdict(list)
    for r in injuries:
        d=str(r["game_date"])[:10];h=abbr(r["home_team_abbr"]);a=abbr(r["away_team_abbr"])
        if not h or not a:continue
        ts=utc(r["report_datetime"],True)
        if ts:by[(d,h,a)].append((ts,r))
    metrics=Counter()
    methods=Counter()
    for e,n,h,a,archive_tip,schedule_tip in games:
        day=schedule_tip.astimezone(EAST).date().isoformat()
        cutoff=archive_tip-timedelta(minutes=60)
        for team in (h,a):
            metrics["teamSlots"]+=1
            candidates=[]
            for ts,r in by[(day,h,a)]:
                g=ident(r["game_id"])
                if g and g!=n:continue
                # Mirror team names are compared to exact official schedule names,
                # not fuzzy matches. Use the report team_id when the game roster
                # has a unique official team ID for the selected abbreviation.
                nt={ident(x["team_id"]) for x in n_by[(n,team)]}-{None}
                teamid=ident(r["team_id"])
                team_names={norm(x.get("team_name")) for x in n_by[(n,team)]}
                team_names|={norm(str(x.get("team_city",""))+" "+str(x.get("team_name",""))) for x in n_by[(n,team)]}
                team_names|={norm(x.get("team_display_name")) for x in e_by[(e,team)]}
                if teamid and nt and teamid not in nt:continue
                if not ((teamid and teamid in nt) or norm(r["team"]) in team_names or abbr(r["team"])==team):continue
                if cutoff-timedelta(hours=6)<=ts<=cutoff:candidates.append((ts,r))
            if not candidates:metrics["noFreshReport"]+=1;continue
            latest=max(t for t,_ in candidates)
            rows=[r for t,r in candidates if t==latest]
            if any("NOT YET SUBMITTED" in str(r["reason"]).upper() for r in rows):
                metrics["notSubmitted"]+=1;continue
            metrics["freshSubmitted"]+=1
            outs=[r for r in rows if str(r["current_status"]).strip().lower()=="out"]
            if outs:metrics["teamsWithExplicitOut"]+=1
            for r in outs:
                metrics["explicitOutRows"]+=1
                if old(r):metrics["oldExactMapped"]+=1;continue
                metrics["oldUnmapped"]+=1
                nm=names(r["report_player_name"])
                if not nm:methods["missingName"]+=1;continue
                er=[x for x in e_by[(e,team)] if names(x["athlete_display_name"])&nm and ident(x["athlete_id"])]
                nr=[x for x in n_by[(n,team)] if names(str(x["first_name"])+" "+str(x["last_name"]))&nm and ident(x["player_id"])]
                ei={ident(x["athlete_id"]) for x in er};ni={ident(x["player_id"]) for x in nr}
                report_id=ident(r["person_id"])
                if len(ei)!=1 or len(ni)!=1:
                    methods["priorDatedIdentityCandidate" if prior_identity(r,nm,team,cutoff) else "missingOrAmbiguousDatedRoster"]+=1
                    continue
                eid,nid=next(iter(ei)),next(iter(ni))
                if report_id and report_id!=nid:methods["reportIdConflict"]+=1;continue
                if (ids[nid] and ids[nid]!={eid}) or (reverse[eid] and reverse[eid]!={nid}):
                    methods["crosswalkConflict"]+=1;continue
                # Identity evidence is retrospective: both same-game rosters
                # explicitly corroborate player/team, not a pregame roster assertion.
                methods["dualDatedRosterCandidate"]+=1
    original={"games":57,"teamSlots":114,"freshSubmitted":109,"teamsWithExplicitOut":104,"explicitOutRows":362,"oldExactMapped":227,"oldUnmapped":135}
    reconstructed=len(games)==original["games"] and all(metrics[k]==v for k,v in original.items() if k!="games")
    return {"kind":"nba_original_injury_cohort_reconciliation_v1","archiveGames":len(gameoffers),"matchedGames":len(games),"unmatchedGames":unmatched,"reconstructedCounts":dict(metrics),"originalAggregateCounts":original,"originalAggregateReproduced":reconstructed,"candidateMethods":dict(methods),"newCandidateMappings":methods["dualDatedRosterCandidate"]+methods["priorDatedIdentityCandidate"],"original135RowLevelReconciliationVerified":False,"reason":"Prior audit contains aggregate counts, not immutable row identities; same-game roster evidence is retrospective, not pregame status proof.","freezeApproved":False,"paidRequests":0,"rawRowsPublished":0}
def main():
    t=load()
    with open(sys.argv[1],newline="",encoding="utf-8-sig") as f:offers=list(csv.DictReader(f))
    e="hoopR-nba-data";n="hoopR-nba-stats-data"
    x=reconcile(offers,t[(e,"nba_schedule_2027.parquet")],t[(e,"nba_schedule_crosswalk_2027.parquet")],t[(e,"nba_player_crosswalk_2027.parquet")],t[(n,"injury_report_2027.parquet")],t[(e,"game_rosters_2027.parquet")],t[(n,"game_rosters_2027.parquet")])
    print(json.dumps(x))
if __name__=="__main__":main()
