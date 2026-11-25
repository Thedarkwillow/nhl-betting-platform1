#!/usr/bin/env python3
"""Public archive only, retrospective research, no bets or model promotion."""
import collections as C, datetime as D, hashlib, json, math, pathlib, statistics
ROOT=pathlib.Path(__file__).resolve().parents[1]
METRICS=("completions","attempts","passing_yards","passing_tds","passing_interceptions","carries","rushing_yards","rushing_tds","receptions","targets","receiving_yards","receiving_tds","fg_made","fg_att","pat_made","pat_att","kicking_points")
MODELS=("last5","last10","ewma","shrunk")
def docs(rel,kind):
    for p in sorted((ROOT/rel).glob("*.json")):
        try:
            b=p.read_bytes()
            if hashlib.sha256(b).hexdigest()!=p.stem:continue
            d=json.loads(b)
            if d.get("kind")==kind:yield d,p.stem
        except (OSError,ValueError):continue
def predict(prior):
    a=prior[-5:];b=prior[-10:];w=[.65**i for i in range(len(b))]
    return dict(last5=statistics.mean(a),last10=statistics.mean(b),ewma=sum(x*y for x,y in zip(reversed(b),w))/sum(w),shrunk=.5*statistics.mean(a)+.5*statistics.mean(prior))
def nfl(documents):
    rows={};bad=set()
    for d in documents:
        if d.get("season") not in (2024,2025,2026):continue
        games={g["gameId"]:g for g in d["games"] if g["completedScoreObserved"]}
        for p in d["playerRows"]:
            g=games.get(p["gameId"])
            if not g or p["gameStartAt"]!=g["startAt"] or p["week"]!=g["week"] or {p["team"],p["opponent"]}!={g["home"],g["away"]}:continue
            k=(p["gameId"],p["playerId"]);v=(d["season"],p)
            if k in rows and rows[k]!=v:bad.add(k)
            rows[k]=v
    history=C.defaultdict(list);scores=C.defaultdict(lambda:{"n":0,"weeks":set(),"mae":C.Counter(),"se":C.Counter()})
    weekly=C.defaultdict(list)
    for k,(year,p) in rows.items():
        if k not in bad:weekly[year,p["week"]].append(p)
    for (year,week),group in sorted(weekly.items()):
        for p in group:
            for m in METRICS:
                x=p["stats"].get(m)
                if type(x) not in (int,float) or not math.isfinite(x):continue
                # Zero-opportunity kicking rows cannot establish kicker participation.
                if m.startswith(("fg_","pat_","kicking_")) and not any(p["stats"].get(t,0)>0 for t in ("fg_att","pat_att")):continue
                # Market workload conditional: no absent player/game converted to zero.
                if m.startswith("passing_") or m in ("attempts","completions"):
                    if p["stats"].get("attempts",0)<=0:continue
                if m in ("carries","rushing_yards","rushing_tds") and p["stats"].get("carries",0)<=0:continue
                if m in ("targets","receptions","receiving_yards","receiving_tds") and p["stats"].get("targets",0)<=0:continue
                h=history[p["playerId"],p["team"],m][-20:]
                if len(h)<5 or year<2025:continue
                s=scores[year,m];s["n"]+=1;s["weeks"].add(week)
                for k,v in predict(h).items():s["mae"][k]+=abs(v-x);s["se"][k]+=(v-x)**2
        # No same-week outcomes used for predictions.
        for p in group:
            for m in METRICS:
                x=p["stats"].get(m)
                if type(x) not in (int,float) or not math.isfinite(x):continue
                if m.startswith(("fg_","pat_","kicking_")) and not any(p["stats"].get(t,0)>0 for t in ("fg_att","pat_att")):continue
                if (m.startswith("passing_") or m in ("attempts","completions")) and p["stats"].get("attempts",0)<=0:continue
                if m in ("carries","rushing_yards","rushing_tds") and p["stats"].get("carries",0)<=0:continue
                if m in ("targets","receptions","receiving_yards","receiving_tds") and p["stats"].get("targets",0)<=0:continue
                history[p["playerId"],p["team"],m].append(x)
    out=[]
    for m in METRICS:
        a,b=scores.get((2025,m)),scores.get((2026,m))
        if not a or not b:continue
        chosen=min(MODELS,key=lambda k:a["mae"][k]/a["n"])
        out.append({"market":m,"developmentN":a["n"],"evaluationN":b["n"],"developmentWeeks":len(a["weeks"]),"evaluationWeeks":len(b["weeks"]),"selected":chosen,"developmentMAE":{k:a["mae"][k]/a["n"] for k in MODELS},"evaluationMAE":{k:b["mae"][k]/b["n"] for k in MODELS},"minimumEvidenceMet":a["n"]>=100 and b["n"]>=75 and len(a["weeks"])>=8 and len(b["weeks"])>=8})
    return {"inputPlayerGames":len(rows)-len(bad),"conflictingPlayerGames":len(bad),"markets":out,"selectionYear":2025,"retrospectiveEvaluationYear":2026,"conditionalOnObservedWorkload":True,"noPregameAvailabilityVerified":True,"actualPropLinesUsed":False,"modelApproved":False}
def identity(documents):
    out=C.defaultdict(lambda:{"eventCandidates":0,"playerCandidates":0,"sourceContextCorroborated":0,"missingSourceEventClock":0,"missingTeam":0,"missingOpponent":0,"ambiguousEvent":0,"ambiguousPlayer":0})
    # Most recent candidate document only; avoid counting repeated snapshots.
    if not documents:return {}
    d=max(documents,key=lambda d:d["observedAt"])
    for g in d["rows"]:
        s=out[g["sport"]];s["eventCandidates"]+=len(g["possibleEvents"])==1
        for p in g["players"]:
            s["playerCandidates"]+=p["uniqueRosterCandidate"] is True
            s["sourceContextCorroborated"]+=p["sourceContextCorroborated"] is True
            s["missingSourceEventClock"]+=len(g["sourceStartTimes"])!=1
            s["missingTeam"]+=len(p["sourceTeams"])!=1;s["missingOpponent"]+=len(p["sourceOpponents"])!=1
            s["ambiguousEvent"]+=len(g["possibleEvents"])!=1;s["ambiguousPlayer"]+=len(p["candidates"])!=1
    return dict(out)
def dota(documents):
    games={};conflicts=set()
    for d in documents:
        for r in d["finals"]:
            g=r["game"];k=g["providerGameId"]
            if r["playerCount"]!=10 or not g.get("providerReportedFinal") or not g.get("providerSeriesId"):continue
            if k in games and games[k]!=g:conflicts.add(k)
            games[k]=g
    groups=C.defaultdict(list)
    for k,g in games.items():
        if k not in conflicts:groups[g["leagueId"],g["providerSeriesId"]].append(g)
    candidates=0
    for a in groups.values():
        a.sort(key=lambda g:g["startAt"])
        if len(a)<2 or len({tuple(sorted(g["teamIds"])) for g in a})!=1 or len({g["providerSeriesType"] for g in a})!=1 or any(x["endAt"]>y["startAt"] for x,y in zip(a,a[1:])):continue
        candidates+=1
    return {"deduplicatedNativeMapsWithTenPlayersAndSeriesId":len(games)-len(conflicts),"conflictingMaps":len(conflicts),"chronologicalSeriesCandidates":candidates,"independentMapOrdinalVerified":0,"originalOfferMatched":False}
def main():
    sources=lambda rel,kind:[d for d,_ in docs(rel,kind)]
    report={"kind":"public_native_model_scope_validation_v1","generatedAt":D.datetime.now(D.timezone.utc).isoformat(),"nfl":nfl(sources("research/pickfinder-public-nfl-v1/season","nflverse_public_native_history_v1")),"identity":identity(sources("research/pickfinder-public-identity-v1/candidate-crosswalks","public_pickfinder_identity_candidate_v1")),"dota":dota(sources("research/pickfinder-public-identity-v1/dota-match-receipts","opendota_index_detail_reconciliation_v1")),"paidRequests":0,"privateRepoUsed":False,"modelApproved":False,"independentlyReviewedPickfinderCrosswalks":0}
    p=ROOT/"data/public-native-model-scope-health.json";p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n");print(json.dumps(report))
if __name__=="__main__":main()
