"""Separate historical cohorts; never describe these as original-line or untouched future performance.
ChainCC CC BY 4.0 https://chaincc.lol/free/data/ (accessed 2026-11-25 UTC).
"""
import sys,json,hashlib,urllib.request,urllib.parse,importlib.util
from pathlib import Path
def run(kind):
    if kind=="lol":
        from lol_specialist_research import get,read_players,complete_games
        from lol_strength_patch_research import evaluate
        raw=get("https://chaincc.lol/data/chaincc-players-2024.csv.gz",25_000_000)
        rows,_=read_players(raw);rows=[r for r in rows if r["date"].startswith("2024-")]
        games,excluded=complete_games(rows)
        return {"cohort":"2024 ChainCC","sha256":hashlib.sha256(raw).hexdigest(),"rows":sum(map(len,games)),"excluded":excluded,"results":evaluate(games),"sameSourceDifferentSeason":True}
    if kind=="dota":
        from dota_lane_and_scope_probability import SQL,parse,probability,M
        from esports_context_models import evaluate
        sql=SQL.replace("m.start_time>=1735689600 AND m.start_time<1795564800","m.start_time>=1704067200 AND m.start_time<1722470400").replace("ORDER BY m.match_id DESC","ORDER BY m.match_id ASC")
        req=urllib.request.Request("https://api.opendota.com/api/explorer?"+urllib.parse.urlencode({"sql":sql}),headers={"User-Agent":"EsportsHistoricalResearch/1.0"})
        with urllib.request.urlopen(req,timeout=60) as f:raw=f.read(24_000_001)
        if len(raw)>24_000_000:raise ValueError("source bound")
        rows,scoped,groups,excluded=parse(json.loads(raw)["rows"])
        return {"cohort":"2024 Jan-Jul OpenDota earliest bounded series sample","sha256":hashlib.sha256(raw).hexdigest(),"rows":len(rows),"candidateSeries":groups,"excluded":excluded,"specialists":evaluate(rows,M,["hero","opponent","hero_opponent","lane_role"]),"syntheticCandidateScopes":probability(scoped),"verifiedMapOrdinals":0}
    if kind=="valorant":
        from valorant_pregame_agent_research import vct
        x=vct(2024)
        return {"cohort":"VCT Reference 2024 calendar subset of previously accessed data","rows":x["completeMaps"]*10,"sha256":x["sha256"],"agentMixture":x["pregameAgentMixture"],"sameSourceCalendarDiagnostic":True}
    raise ValueError("kind")
if __name__=="__main__":
    kind=sys.argv[1]
    try:result=run(kind);status="read"
    except Exception as e:result={"reason":type(e).__name__};status="unavailable"
    print(json.dumps({"kind":"esports_separate_historical_cohort_v1","title":kind,"status":status,**result,"actualPropLines":0,"independentUntouchedFutureEvidence":False,"modelPromoted":False,"rawRowsPublished":0,"paidRequests":0}),flush=True)
