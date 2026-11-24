#!/usr/bin/env python3
"""Bounded free source download with immutable Git blob integrity and local schema audit.
No commercial provider endpoints, API keys, raw data publication or model promotion."""
import argparse, hashlib, json, pathlib, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--output",required=True)
    a.add_argument("--private-research",action="store_true",required=True)
    args=a.parse_args()
    out=pathlib.Path(args.output)
    out.mkdir(parents=True,exist_ok=True)
    cfg=json.loads((ROOT/"config/nba/free-pinned-recovery-v1.json").read_text())
    import pyarrow.parquet as pq
    rows=[]
    for s in cfg["assets"]:
        if not s["url"].startswith("https://raw.githubusercontent.com/sportsdataverse/") or not 0<s["bytes"]<=2_000_000:
            raise ValueError("unexpected source or size")
        dest=out/(s["repo"].split("/")[-1]+"__"+pathlib.Path(s["path"]).name)
        if dest.exists():
            raw=dest.read_bytes()
        else:
            with urllib.request.urlopen(urllib.request.Request(s["url"],headers={"User-Agent":"private-nba-research"}),timeout=30) as response:
                raw=response.read(s["bytes"]+1)
        blob=hashlib.sha1(("blob "+str(len(raw))).encode()+bytes([0])+raw).hexdigest()
        if len(raw)!=s["bytes"] or blob!=s["gitBlob"]:
            raise ValueError("integrity mismatch "+s["path"])
        if not dest.exists():
            with dest.open("xb") as f: f.write(raw)
        table=pq.read_table(dest)
        rows.append({"source":s,"sha256":hashlib.sha256(raw).hexdigest(),"rows":table.num_rows,"columns":table.schema.names})
    report={"kind":"nba_pinned_recovery_schema_audit_v1","assets":rows,"newlyResolvedMappings":0,"realValidationExecuted":False,"providerCreditsConsumed":0,"productionApproved":False}
    (out/"schema-audit.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report))
if __name__=="__main__":main()
