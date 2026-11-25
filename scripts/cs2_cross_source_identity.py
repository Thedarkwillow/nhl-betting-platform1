"""Exact CS2 overlap audit; source-local IDs are never silently merged.
DataSportsAPI archive and manually reviewed Steam crosswalk remain private.
"""
import json,os,re
from collections import Counter,defaultdict
from datetime import date
from pathlib import Path
from cs2_team_identity import norm

MAP_ALIASES={"dust ii":"dust2","dust 2":"dust2","de_dust2":"dust2"}
MARKETS=("kills","deaths","assists")
def mapname(x):
    n=norm(x)
    return MAP_ALIASES.get(n,n.removeprefix("de_"))
def fingerprint(day,mp,sides):
    if len(sides)!=2:return None
    sig=[];aliases=set()
    for team,score,rows in sides:
        if not norm(team) or type(score)is not int or score<0 or len(rows)!=5:return None
        roster=[]
        for p in rows:
            alias=norm(p.get("alias") or p.get("name"))
            if not alias or alias in aliases or any(type(p.get(m))is not int or p[m]<0 for m in MARKETS):return None
            aliases.add(alias);roster.append((alias,*(p[m] for m in MARKETS)))
        sig.append((norm(team),score,tuple(sorted(roster))))
    if sig[0][0]==sig[1][0] or not mapname(mp):return None
    return day,mapname(mp),tuple(sorted(sig))
def one_to_one(pairs):
    left=defaultdict(set);right=defaultdict(set)
    for a,b in pairs:left[a].add(b);right[b].add(a)
    return {(a,next(iter(bs))) for a,bs in left.items() if len(bs)==1 and len(right[next(iter(bs))])==1}
def audit(history,archives,review=None,capture=None):
    by_event=defaultdict(list);index=defaultdict(list);alias_hist=defaultdict(list)
    for p in history:
        by_event[p["event"]].append(p);alias_hist[norm(p.get("alias"))].append(p)
    for eid,rows in by_event.items():
        sides=defaultdict(list)
        for p in rows:sides[p["team"]].append(p)
        if len(rows)!=10:continue
        f=fingerprint(rows[0]["date"],rows[0]["map"],[(ps[0].get("teamLabel"),ps[0].get("teamScore"),ps) for ps in sides.values()])
        if f:index[f].append((eid,rows))
    counts=Counter();evidence=[];pairs=set();team_pairs=set();map_matches=[];api_alias=defaultdict(list)
    seen={}
    for a in archives:
        if a.get("kind")!="datasportsapi_restricted_game_archive_v1" or a.get("source")!="DataSportsAPI":continue
        for g in a.get("rows",[]):
            if g.get("title")!="CS2" or g.get("providerCompleted") is not True:continue
            key=(g.get("providerFixtureId"),g.get("providerGameId"))
            if not all(isinstance(v,str) and v for v in key):continue
            if key in seen and seen[key]!=g:seen[key]=None
            elif key not in seen:seen[key]=g
    for key,g in seen.items():
        counts["apiCompletedMapKeys"]+=1
        if not g:counts["conflictingArchiveMaps"]+=1;continue
        ps=g.get("players",[])
        if len(ps)!=10 or len({p.get("providerPlayerId") for p in ps})!=10:continue
        for i,p in enumerate(ps):
            alias=norm(p.get("name"));team=g.get("homeTeam") if i<5 else g.get("awayTeam")
            api_alias[alias].append((p.get("providerPlayerId"),norm(team),str(g.get("fixtureStartsAt"))[:10]))
        if len({p.get("providerTeamId") for p in ps[:5]})!=1 or len({p.get("providerTeamId") for p in ps[5:]})!=1 or ps[0].get("providerTeamId")==ps[5].get("providerTeamId"):continue
        f=fingerprint(str(g.get("fixtureStartsAt"))[:10],g.get("map"),[(g.get("homeTeam"),g.get("homeScore"),ps[:5]),(g.get("awayTeam"),g.get("awayScore"),ps[5:])])
        if not f:counts["invalidFingerprint"]+=1;continue
        hits=index.get(f,[])
        if len(hits)!=1:counts["noUniqueExactOverlap"]+=1;continue
        eid,hs=hits[0];counts["exactMapMatches"]+=1
        h={norm(p["alias"]):p for p in hs}
        map_matches.append({"historyEvent":eid,"providerFixtureId":key[0],"providerGameId":key[1],"mapOrdinal":g.get("mapOrdinal"),"method":"exact_date_map_team_score_ten_alias_kda","sourceRef":g.get("sourceRef")})
        for p in ps:
            q=h[norm(p["name"])];pair=(q["player"],p["providerPlayerId"]);pairs.add(pair)
            team_pairs.add((q["team"],p["providerTeamId"]))
            evidence.append({"historyPlayerId":pair[0],"providerPlayerId":pair[1],"historyEvent":eid,"providerGameId":key[1],"method":"exact_map_fingerprint"})
    verified=one_to_one(pairs);teams=one_to_one(team_pairs)
    # Steam links: exact alias plus dated team membership; still a candidate,
    # not proof that the historical ID itself is an authoritative Steam ID.
    steam=[];raw={r.get("id"):r for r in (capture or {}).get("quarantinedSourceObservations",[])}
    links=(review or {}).get("playerEventLinks",[])
    bound=(review or {}).get("sourceDocumentSha256") and (review or {}).get("sourceDocumentSha256")== (capture or {}).get("sourceDocumentSha256")
    for x in links if bound else []:
        if x.get("steamIdIndependentlyVerified") is not True or not re.fullmatch(r"\d{17}",str(x.get("steamIdCandidate",""))):continue
        r=raw.get(x.get("sourceOfferId"),{});p=r.get("player",{});alias=norm(x.get("alias"));team=norm(p.get("team"));day=str(x.get("sourceObservedAt"))[:10]
        if not alias or alias!=norm(p.get("name")) or not team:continue
        try:cut=date.fromisoformat(day)
        except ValueError:continue
        counts["reviewedSteamObservations"]+=1
        def prior(d):
            try:return 0<=(cut-date.fromisoformat(d)).days<=45
            except ValueError:return False
        hs={q["player"] for q in alias_hist[alias] if prior(q["date"]) and norm(q.get("teamLabel"))==team}
        ap={pid for pid,tm,dt in api_alias[alias] if tm==team and prior(dt)}
        if len(hs)==1:
            h=next(iter(hs));counts["uniqueHistoryAliasTeamCandidates"]+=1
            steam.append({"historyPlayerId":h,"steamId":x["steamIdCandidate"],"providerPlayerIds":[pid for pid in ap if (h,pid) in verified],"method":"exact_alias_dated_team_review_candidate","originalPregameVerification":False})
    sp=one_to_one({(x["historyPlayerId"],x["steamId"]) for x in steam})
    steam=[x for x in steam if (x["historyPlayerId"],x["steamId"]) in sp]
    report={"kind":"cs2_cross_source_identity_audit_v1","counts":dict(counts),"uniquePlayerLinks":len(verified),"uniqueTeamLinks":len(teams),"steamHistoryCandidates":len(sp),"threeWayCandidates":len({(x["historyPlayerId"],p,x["steamId"]) for x in steam for p in x["providerPlayerIds"]}),"conflictingPlayerPairCount":len(pairs-verified),"verifiedMapOrdinals":len(map_matches),"originalOfferVerified":False,"productionEligible":False,"paidRequests":0,"rawRowsPublished":0}
    private={"kind":"cs2_restricted_cross_source_links_v1","report":report,"playerLinks":[x for x in evidence if (x["historyPlayerId"],x["providerPlayerId"]) in verified],"teamLinks":[{"historyTeamId":a,"providerTeamId":b} for a,b in sorted(teams)],"mapLinks":map_matches,"steamCandidates":steam}
    return report,private
def run_restricted(rows,root):
    archives=[]
    for p in sorted(Path(root).glob("*.json"))[-60:]:
        if p.stat().st_size>8_000_000:raise ValueError("archive_size")
        archives.append(json.loads(p.read_text()))
    def read(var):
        path=os.environ.get(var)
        return json.loads(Path(path).read_text()) if path else {}
    report,private=audit(rows,archives,read("CS2_RESTRICTED_STEAM_REVIEW"),read("CS2_RESTRICTED_CAPTURE"))
    target=os.environ.get("CS2_RESTRICTED_OUTPUT")
    if target:
        p=Path(target).resolve()
        if p.parent!=Path(os.environ["RUNNER_TEMP"]).resolve():raise ValueError("restricted_output")
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w") as f:json.dump(private,f)
    print(json.dumps(report))
