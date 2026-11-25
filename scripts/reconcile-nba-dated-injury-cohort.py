#!/usr/bin/env python3
"""Reconstruct the original dated injury cohort from pinned free source tables.
Only count summaries leave runner memory; no new paid calls, no roster-based
retrospective identity resolution asserted to be pregame availability proof."""
import csv, hashlib, io, json, pathlib, re, sys, unicodedata, urllib.request, os
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
def historical_inputs():
    import pyarrow.parquet as pq
    cfg=json.loads((ROOT/"config/nba/prior-season-identity-assets-v1.json").read_text())
    cross=[];er=[];nr=[]
    for a in cfg["assets"]:
        if not a["url"].startswith("https://raw.githubusercontent.com/sportsdataverse/") or not 0<a["bytes"]<=2_000_000:raise ValueError("historical config")
        with urllib.request.urlopen(urllib.request.Request(a["url"],headers={"User-Agent":"NBAIdentityResearch/1.0"}),timeout=35) as f:raw=f.read(a["bytes"]+1)
        if len(raw)!=a["bytes"] or hashlib.sha1(("blob "+str(len(raw))).encode()+b"\0"+raw).hexdigest()!=a["gitBlob"]:raise ValueError("historical source integrity")
        rows=pq.read_table(io.BytesIO(raw)).to_pylist()
        if "crosswalk" in a["path"]:
            season=a["path"].rsplit("_",1)[-1].split(".")[0]
            cross.extend({**x,"identityEvidenceSeason":season} for x in rows)
        elif a["repo"].endswith("hoopR-nba-data"):er.extend(rows)
        else:nr.extend(rows)
    return cross,er,nr
def historical_index(cross,er,nr):
    en=defaultdict(set);nn=defaultdict(set)
    for x in er:
        for name in names(x.get("athlete_display_name")):
            if ident(x.get("athlete_id")):en[name].add(ident(x["athlete_id"]))
    for x in nr:
        for name in names(str(x.get("first_name",""))+" "+str(x.get("last_name",""))):
            if ident(x.get("player_id")):nn[name].add(ident(x["player_id"]))
    pairs=defaultdict(set);ni=defaultdict(set);ei=defaultdict(set);corroboration=defaultdict(set)
    for x in cross:
        n,e=ident(x.get("nba_player_id")),ident(x.get("espn_athlete_id"))
        if not n or not e:continue
        ni[n].add(e);ei[e].add(n)
        for nm in names(x.get("nba_player_name"))&names(x.get("espn_full_name")):
            if en[nm]=={e} and nn[nm]=={n}:pairs[nm].add((n,e))
            if (en[nm]=={e} or nn[nm]=={n}) and x.get("identityEvidenceSeason"):corroboration[nm,n,e].add(x["identityEvidenceSeason"])
    strong={nm:{(n,e) for n,e in vals if ni[n]=={e} and ei[e]=={n}} for nm,vals in pairs.items()}
    # Report-ID-bound fallback requires corroborated name and two historical crosswalk rows.
    for (nm,n,e),num in corroboration.items():
        if len(num)>=2 and ni[n]=={e} and ei[e]=={n}:strong.setdefault("reportid:"+nm,set()).add((n,e))
    return strong

def supplemental_roster():
    """Pinned release asset; ESPN identity evidence only, never active-status proof."""
    import pyarrow.parquet as pq
    url="https://github.com/WalrusQuant/sportsleader-data/releases/download/nba_rosters/2027.parquet"
    sha="90b14839dd7b9182178f577e203ecf3141f56b9fc3c0812abd42c5f69ff5b636"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"NBAIdentityResearch/1.0"}),timeout=35) as f:raw=f.read(58339)
    if len(raw)!=58338 or hashlib.sha256(raw).hexdigest()!=sha:raise ValueError("supplemental source integrity")
    return pq.read_table(io.BytesIO(raw),columns=["league","season","team_abbr","player_id","player_name","valid_from","valid_to","last_seen"]).to_pylist()
def supplemental_espn_ids(roster,nm,team,cutoff):
    out=set()
    for x in roster:
        a=utc(x.get("valid_from"));b=utc(x.get("valid_to"));last=utc(x.get("last_seen"))
        if x.get("league")!="nba" or x.get("season")!=2027 or abbr(x.get("team_abbr"))!=team or not a or not last or not a<=cutoff<=last or (x.get("valid_to") is not None and (not b or b<=cutoff)):continue
        if names(x.get("player_name"))&nm and ident(x.get("player_id")):out.add(ident(x["player_id"]))
    return out
def supplemental_aliases():
    import pyarrow.parquet as pq
    url="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_groups/nba_player_aliases.parquet"
    sha="26a4cbfb40c39e57f8557686d0bc2f6f7cc077ef72c0c017b7b003f5abfd2890"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"NBAIdentityResearch/1.0"}),timeout=35) as f:raw=f.read(110616)
    if len(raw)!=110615 or hashlib.sha256(raw).hexdigest()!=sha:raise ValueError("alias asset integrity")
    return pq.read_table(io.BytesIO(raw)).to_pylist()
def exact_alias_candidate(aliases,nid,espn_team_ids,known_espn_ids,ids,reverse):
    if not nid or len(espn_team_ids)!=1:return None
    pairs={(ident(x.get("source_player_id")),ident(x.get("athlete_id"))) for x in aliases
      if x.get("league")=="nba" and x.get("source")=="nba_stats" and x.get("athlete_id_source")=="espn"
      and x.get("match_method") in ("exact_name","override") and x.get("match_confidence")==1
      and type(x.get("valid_from")) is int and type(x.get("valid_to")) is int and x["valid_from"]<=2027<=x["valid_to"]
      and ident(x.get("team_id")) in espn_team_ids and ident(x.get("source_player_id")) and ident(x.get("athlete_id"))}
    candidates={e for n,e in pairs if n==nid}
    if len(candidates)!=1:return None
    eid=next(iter(candidates))
    if {n for n,e in pairs if e==eid}!={nid}:return None
    if known_espn_ids and known_espn_ids!={eid}:return None
    if (ids.get(nid) and ids[nid]!={eid}) or (reverse.get(eid) and reverse[eid]!={nid}):return None
    return eid
def reconcile(offers,schedule,gamecross,cross,injuries,espnroster,nbaroster,historical=None,supplemental=(),aliases=(),restricted_review=None,all_unmapped=None):
    historical=historical or {}
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
    unresolved_diagnostics=Counter()
    def record_pending(row,e,n,team,latest,cutoff,why):
        if restricted_review is None:return
        # Only identity evidence, not medical reason or unrelated fields.
        v={"espnGameId":e,"nbaGameId":n,"team":team,"reportAt":latest.isoformat(),"cutoffAt":cutoff.isoformat(),"reportName":str(row.get("report_player_name") or ""),"nbaReportId":ident(row.get("person_id")),"reason":why}
        v["reconstructedIdentitySha256"]=hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest()
        restricted_review.append(v)
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
                if all_unmapped is not None:
                    all_unmapped.append({"team":team,"home":h,"away":a,"reportAt":latest.isoformat(),"cutoffAt":cutoff.isoformat(),"reportName":str(r.get("report_player_name") or ""),"nbaReportId":ident(r.get("person_id")),"nbaGameId":n})
                nm=names(r["report_player_name"])
                if not nm:methods["missingName"]+=1;record_pending(r,e,n,team,latest,cutoff,"missingName");continue
                er=[x for x in e_by[(e,team)] if names(x["athlete_display_name"])&nm and ident(x["athlete_id"])]
                nr=[x for x in n_by[(n,team)] if names(str(x["first_name"])+" "+str(x["last_name"]))&nm and ident(x["player_id"])]
                ei={ident(x["athlete_id"]) for x in er};ni={ident(x["player_id"]) for x in nr}
                report_id=ident(r["person_id"])
                if len(ei)!=1 or len(ni)!=1:
                    if prior_identity(r,nm,team,cutoff):
                        methods["priorDatedIdentityCandidate"]+=1
                    else:
                        historical_pairs=set().union(*(historical.get(x,set()) for x in nm))
                        good={(nid,eid) for nid,eid in historical_pairs if (not report_id or report_id==nid) and (not ids[nid] or ids[nid]=={eid}) and (not reverse[eid] or reverse[eid]=={nid})}
                        if not good and report_id:
                            extra=set().union(*(historical.get("reportid:"+x,set()) for x in nm))
                            if len(extra)==1:
                                good={(nid,eid) for nid,eid in extra if nid==report_id and (not ids[nid] or ids[nid]=={eid}) and (not reverse[eid] or reverse[eid]=={nid})}
                                historical_pairs=extra
                        if len(good)==1 and len(historical_pairs)==1:
                            methods["priorSeasonDualNamespaceIdentityCandidate"]+=1
                        elif (report_id and (not ni or ni=={report_id}) or not report_id and len(ni)==1) and exact_alias_candidate(
                            aliases,report_id or next(iter(ni)),{ident(x.get("team_id")) for x in e_by[(e,team)]}-{None},
                            ei|supplemental_espn_ids(supplemental,nm,team,cutoff),ids,reverse):
                            methods["exactSeasonAliasIdentityCandidate"]+=1
                        elif report_id and ni=={report_id}:
                            supplemental_ids=supplemental_espn_ids(supplemental,nm,team,cutoff)
                            if len(supplemental_ids)==1:
                                eid=next(iter(supplemental_ids))
                                if (not ids[report_id] or ids[report_id]=={eid}) and (not reverse[eid] or reverse[eid]=={report_id}):
                                    methods["supplementalDatedRosterCandidate"]+=1
                                    continue
                            methods["missingOrAmbiguousDatedRoster"]+=1
                            record_pending(r,e,n,team,latest,cutoff,"missingOrAmbiguousDatedRoster")
                            unresolved_diagnostics["supplemental_no_unique_compatible_match"]+=1
                            unresolved_diagnostics["present_report_id"]+=1
                            unresolved_diagnostics["historical_name_pair_absent" if not historical_pairs else "historical_name_pair_ambiguous" if len(historical_pairs)>1 else "historical_pair_conflicts_with_current_ids"]+=1
                            if len(ei)!=1:unresolved_diagnostics["espn_roster_missing_or_ambiguous"]+=1
                        else:
                            methods["missingOrAmbiguousDatedRoster"]+=1
                            record_pending(r,e,n,team,latest,cutoff,"missingOrAmbiguousDatedRoster")
                            if report_id is None:methods["unresolvedMissingReportId"]+=1
                            unresolved_diagnostics["missing_report_id" if report_id is None else "present_report_id"]+=1
                            unresolved_diagnostics["historical_name_pair_absent" if not historical_pairs else "historical_name_pair_ambiguous" if len(historical_pairs)>1 else "historical_pair_conflicts_with_current_ids"]+=1
                            if len(ei)!=1:unresolved_diagnostics["espn_roster_missing_or_ambiguous"]+=1
                            if len(ni)!=1:unresolved_diagnostics["nba_roster_missing_or_ambiguous"]+=1
                    continue
                eid,nid=next(iter(ei)),next(iter(ni))
                if report_id and report_id!=nid:methods["reportIdConflict"]+=1;record_pending(r,e,n,team,latest,cutoff,"reportIdConflict");continue
                if (ids[nid] and ids[nid]!={eid}) or (reverse[eid] and reverse[eid]!={nid}):
                    methods["crosswalkConflict"]+=1;record_pending(r,e,n,team,latest,cutoff,"crosswalkConflict");continue
                # Identity evidence is retrospective: both same-game rosters
                # explicitly corroborate player/team, not a pregame roster assertion.
                methods["dualDatedRosterCandidate"]+=1
    original={"games":57,"teamSlots":114,"freshSubmitted":109,"teamsWithExplicitOut":104,"explicitOutRows":362,"oldExactMapped":227,"oldUnmapped":135}
    reconstructed=len(games)==original["games"] and all(metrics[k]==v for k,v in original.items() if k!="games")
    return {"kind":"nba_original_injury_cohort_reconciliation_v1","archiveGames":len(gameoffers),"matchedGames":len(games),"unmatchedGames":unmatched,"reconstructedCounts":dict(metrics),"originalAggregateCounts":original,"originalAggregateReproduced":reconstructed,"candidateMethods":dict(methods),"unresolvedDiagnostics":dict(unresolved_diagnostics),"newCandidateMappings":methods["dualDatedRosterCandidate"]+methods["priorDatedIdentityCandidate"]+methods["priorSeasonDualNamespaceIdentityCandidate"]+methods["supplementalDatedRosterCandidate"]+methods["exactSeasonAliasIdentityCandidate"],"original135RowLevelReconciliationVerified":False,"reason":"Prior audit contains aggregate counts, not immutable row identities; same-game roster evidence is retrospective, not pregame status proof.","freezeApproved":False,"paidRequests":0,"rawRowsPublished":0}
def main():
    t=load()
    historical=historical_index(*historical_inputs())
    with open(sys.argv[1],newline="",encoding="utf-8-sig") as f:offers=list(csv.DictReader(f))
    e="hoopR-nba-data";n="hoopR-nba-stats-data"
    try: supplemental=supplemental_roster();source_status="verified"
    except Exception: supplemental=[];source_status="unavailable_or_changed"
    try: aliases=supplemental_aliases();alias_status="verified"
    except Exception: aliases=[];alias_status="unavailable_or_changed"
    review_path=os.environ.get("NBA_RESTRICTED_IDENTITY_REVIEW")
    pending=[] if review_path else None
    all_path=os.environ.get("NBA_RESTRICTED_ALL_UNMAPPED")
    all_rows=[] if all_path else None
    x=reconcile(offers,t[(e,"nba_schedule_2027.parquet")],t[(e,"nba_schedule_crosswalk_2027.parquet")],t[(e,"nba_player_crosswalk_2027.parquet")],t[(n,"injury_report_2027.parquet")],t[(e,"game_rosters_2027.parquet")],t[(n,"game_rosters_2027.parquet")],historical=historical,supplemental=supplemental,aliases=aliases,restricted_review=pending,all_unmapped=all_rows)
    x["supplementalSourceStatus"]=source_status
    x["supplementalRosterRows"]=len(supplemental)
    x["supplementalAliasSourceStatus"]=alias_status
    x["supplementalAliasRows"]=len(aliases)
    if review_path:
        if not x["originalAggregateReproduced"] or len(pending)!=135-x["newCandidateMappings"]:raise ValueError("unresolved cohort accounting")
        root=pathlib.Path(os.environ["RUNNER_TEMP"]).resolve();dest=pathlib.Path(review_path).resolve()
        if dest.parent!=root:raise ValueError("restricted review destination")
        fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w") as f:json.dump({"kind":"nba_reconstructed_pending_identity_review_v1","originalImmutableRowsVerified":False,"rows":pending,"rawRowsPublished":0},f)
    if all_path:
        if not x["originalAggregateReproduced"] or len(all_rows)!=135:raise ValueError("all cohort accounting")
        dest=pathlib.Path(all_path).resolve()
        if dest.parent!=pathlib.Path(os.environ["RUNNER_TEMP"]).resolve():raise ValueError("restricted destination")
        fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w") as f:json.dump({"kind":"nba_reconstructed_all_unmapped_v1","rows":all_rows,"originalImmutableRowsVerified":False},f)
    print(json.dumps(x))
if __name__=="__main__":main()
