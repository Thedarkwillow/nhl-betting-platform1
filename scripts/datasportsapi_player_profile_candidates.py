"""Bounded current-profile corroboration; no authoritative Steam join inferred."""
import json,os,sys,urllib.parse
from pathlib import Path
from collections import Counter
from datasportsapi_esports_preflight import Client,valid_id
from cs2_cross_source_identity import norm,reviewed_team,one_to_one
def search(client,review,capture):
    rows=[];counts=Counter()
    if not review.get("sourceDocumentSha256") or review.get("sourceDocumentSha256")!=capture.get("sourceDocumentSha256"):raise ValueError("capture binding")
    offers={x.get("id"):x for x in capture.get("quarantinedSourceObservations",[])}
    for x in review.get("playerEventLinks",[])[:5]:
        if client.stopped or client.calls>=client.max_calls-1:break
        p=offers.get(x.get("sourceOfferId"),{}).get("player",{})
        alias=x.get("alias")
        if x.get("steamIdIndependentlyVerified") is not True or norm(alias)!=norm(p.get("name")) or not p.get("team"):continue
        try:
            doc=client.get("/v2/search?"+urllib.parse.urlencode({"q":alias,"type":"player"}))
            data=doc.get("data");meta=doc.get("meta",{})
            if not isinstance(data,list) or meta.get("hasNextPage") is not False:counts["incomplete_search"]+=1;continue
            hit=[r for r in data if isinstance(r,dict) and r.get("type")=="player" and r.get("sport")=="esports" and valid_id(r.get("id")) and norm(r.get("name"))==norm(alias) and isinstance(r.get("team"),dict) and valid_id(r["team"].get("id")) and reviewed_team((r.get("team") or {}).get("name"))==reviewed_team(p["team"])]
            if len(hit)!=1:counts["no_unique_profile"]+=1;continue
            h=hit[0];profile=client.get("/v2/players/"+str(h["id"])).get("data")
            if not isinstance(profile,dict) or profile.get("id")!=h["id"] or norm(profile.get("name"))!=norm(alias) or (profile.get("team") or {}).get("id")!=(h.get("team") or {}).get("id"):
                counts["profile_conflict"]+=1;continue
            rows.append({"steamIdCandidate":x["steamIdCandidate"],"providerPlayerId":str(h["id"]),"providerTeamId":str(h["team"]["id"]),"sourceOfferId":x["sourceOfferId"],"method":"exact_current_profile_alias_and_reviewed_team","providerRef":"https://api.datasportsapi.com/v2/players/"+str(h["id"]),"authoritativeSteamCrosswalk":False})
        except ValueError:counts["request_or_contract_error"]+=1
        except Exception:counts["source_unavailable"]+=1
    pairs=one_to_one({(r["steamIdCandidate"],r["providerPlayerId"]) for r in rows})
    rows=[r for r in rows if (r["steamIdCandidate"],r["providerPlayerId"]) in pairs]
    return {"kind":"datasportsapi_player_profile_candidates_v1","candidateCount":len(pairs),"requests":client.calls,"excluded":dict(counts),"rawRowsPublished":0,"paidRequests":0,"authoritativeCrosswalkVerified":False},rows
if __name__=="__main__":
    key=os.environ.get("DATASPORTSAPI_API_KEY","").strip()
    if not key:print(json.dumps({"kind":"datasportsapi_player_profile_candidates_v1","status":"missing_key","requests":0}));sys.exit(0)
    review=json.loads(Path(sys.argv[1]).read_text());capture=json.loads(Path(sys.argv[2]).read_text())
    report,rows=search(Client(key,max_calls=10),review,capture)
    p=Path(os.environ["DATASPORTS_IDENTITY_OUTPUT"]).resolve()
    if p.parent!=Path(os.environ["RUNNER_TEMP"]).resolve():raise ValueError("restricted_output")
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:json.dump({"report":report,"candidates":rows},f)
    print(json.dumps(report))
