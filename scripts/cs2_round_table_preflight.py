"""Metadata only, same demo lineage, not independent identity."""
import urllib.request,json,io,hashlib
import pyarrow.parquet as pq
BASE="https://huggingface.co/datasets/blanchon/opencs2_dataset/resolve/main/"
def main():
    out=[]
    for f in ("index/matches.parquet","events/round_player.parquet","events/kills.parquet"):
        try:
            with urllib.request.urlopen(BASE+f,timeout=40) as r:raw=r.read(25_000_001)
            if len(raw)>25_000_000:raise ValueError("bound")
            p=pq.ParquetFile(io.BytesIO(raw));out.append({"file":f,"rows":p.metadata.num_rows,"columns":p.schema_arrow.names,"sha256":hashlib.sha256(raw).hexdigest()})
        except Exception as e:out.append({"file":f,"status":type(e).__name__})
    print(json.dumps({"kind":"cs2_round_table_preflight_v1","tables":out,"sameDemoLineage":True,"additionalUniquePlayerMapsVerified":0,"authoritativeLinksAdded":0,"paidRequests":0,"rawRowsPublished":0}))
if __name__=="__main__":main()
