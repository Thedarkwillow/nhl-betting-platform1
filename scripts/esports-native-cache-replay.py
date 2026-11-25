"""Replay already archived native cohorts without re-downloading or promoting models."""
import json,hashlib,sys,subprocess
from pathlib import Path
from collections import defaultdict
from esports_context_models import evaluate
def git(root,*args):
    return subprocess.check_output(["git","-C",str(root),*args],stderr=subprocess.DEVNULL,timeout=60)
def pinned(root,p):
    rel=str(p.relative_to(root));raw=git(root,"show","HEAD:"+rel)
    if p.is_symlink() or raw!=p.read_bytes():raise ValueError("worktree mismatch")
    return raw
def load(root,source,extension):
    base=root/"research/esports-native-history"/source
    for p in sorted(base.glob("*"+extension)):
        raw=pinned(root,p)
        meta=p.with_name(p.name+".json") if source=="chaincc" else p.with_name(p.name[:-len(extension)]+".json")
        m=json.loads(pinned(root,meta))
        if hashlib.sha256(raw).hexdigest()!=m["sha256"] or len(raw)!=m["bytes"]:raise ValueError("cache digest")
        yield raw,m
def run(root,title):
    from collections import Counter
    reports=[]
    if title=="CS2":
        from cs2_ektarr_wide_history import load_pinned_history,MARKETS
        for raw,m in load(root,"ektarr",".zip"):
            rows,counts=load_pinned_history(raw)
            reports.append({"rows":len(rows),"sha256":m["sha256"],"evaluation":evaluate(rows,MARKETS,["map","opponent","team"])})
    elif title=="LOL":
        from lol_specialist_research import read_players,complete_games,MARKETS
        from lol_strength_patch_research import evaluate as strength
        allrows=[]
        for raw,m in load(root,"chaincc",".csv.gz"):
            rows,_=read_players(raw);allrows.extend(rows)
        if allrows:
            games,excluded=complete_games(allrows)
            reports.append({"rows":sum(map(len,games)),"excluded":excluded,"evaluation":strength(games)})
    elif title=="VALORANT":
        from valorant_pregame_agent_research import vct
        for raw,m in load(root,"vct-reference",".duckdb"):
            result=vct(raw=raw)
            reports.append({"rows":result["completeMaps"]*10,"sha256":m["sha256"],"evaluation":result})
    elif title=="COD":
        from public_cod_wiki_history import parse
        for raw,m in load(root,"cod-wiki",".source.json"):
            rows,excluded,_=parse(json.loads(raw)["rows"])
            reports.append({"rows":len(rows),"excluded":excluded,"evaluation":evaluate(rows,("kills","deaths"),["mode","team","opponent"],["edition"])})
    elif title=="DOTA2":
        # Native OpenDota archive has game clocks but not independently verified map ordinals.
        groups={};conflicts=set()
        for p in sorted((root/"research/esports-free-providers").glob("*.json")):
            d=json.loads(pinned(root,p))
            if d.get("kind")!="restricted_esports_free_provider_observations_v1":continue
            for g in d.get("opendota",{}).get("games",[]):
                game=g.get("game",{});players=g.get("players",[]);mid=game.get("providerGameId")
                if not mid or not game.get("providerReportedFinal") or len(players)!=10 or len({x.get("providerPlayerId") for x in players})!=10:continue
                batch=[]
                for p in players:
                    stats=p.get("stats",{});fields={"kills":stats.get("kills"),"deaths":stats.get("deaths"),"assists":stats.get("assists"),"last_hits":stats.get("lastHits")}
                    if p.get("providerMatchId")!=mid or not p.get("providerPlayerId") or any(type(v) is not int or v<0 for v in fields.values()):break
                    batch.append(dict(event=mid,player=p["providerPlayerId"],date=game["startAt"][:10],hero=str(p.get("heroId") or ""),team=p.get("teamId"),opponent=p.get("opponentId"),**fields))
                if len(batch)!=10:continue
                batch.sort(key=lambda x:x["player"])
                if mid in groups and groups[mid]!=batch:conflicts.add(mid)
                groups[mid]=batch
        rows=[r for mid,b in groups.items() if mid not in conflicts for r in b]
        if rows:reports.append({"rows":len(rows),"conflictingGames":len(conflicts),"evaluation":evaluate(rows,("kills","deaths","assists","last_hits"),["hero","team","opponent"])})
    else:raise ValueError("title")
    return {"title":title,"status":"evaluated" if any(r.get("rows",0) for r in reports) else "cache_missing_or_empty","cohorts":reports,"sourceNativeOnly":True,"authoritativeCrosswalk":False,"actualPropLines":0,"prospective":False,"modelPromoted":False,"rawRowsPublished":0,"paidRequests":0}
if __name__=="__main__":
    try:print(json.dumps(run(Path(sys.argv[1]).resolve(),sys.argv[2]),allow_nan=False))
    except Exception as e:print(json.dumps({"status":"failed_closed","title":sys.argv[2],"reason":type(e).__name__}));sys.exit(1)
