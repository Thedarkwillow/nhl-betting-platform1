#!/usr/bin/env python3
"""Bounded research-only MoneyPuck game-by-game goalie archive staging."""
import csv
import io
import os
from pathlib import Path
import urllib.request
import zipfile

FIELDS = ["playerId", "gameId", "gameDate", "situation", "icetime",
          "xOnGoal", "xGoals", "ongoal", "goals"]
OUTFIELDS = FIELDS + ["extra" + str(x) for x in range(12)]
BASE = "https://peter-tanner.com/moneypuck/downloads/seasonPlayersSummary/goalies/"
def main():
    output = Path(os.environ.get("MONEYPUCK_STAGE_DIR", "/tmp/moneypuck-game-lab"))
    output.mkdir(parents=True, exist_ok=True)
    for season in [2024, 2025]:
        url = BASE + str(season) + ".zip"
        req = urllib.request.Request(url, headers={"User-Agent": "Private-NHL-Research/1.0"})
        with urllib.request.urlopen(req, timeout=65) as r:
            buff = io.BytesIO()
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                if buff.tell() + len(chunk) > 100_000_000:
                    raise ValueError("Goalie ZIP too large")
                buff.write(chunk)
        count = 0
        with zipfile.ZipFile(io.BytesIO(buff.getvalue())) as z, (output / ("goalies-" + str(season) + ".csv")).open("w", encoding="utf-8", newline="") as out:
            info = [m for m in z.infolist() if m.filename.lower().endswith(".csv") and not m.is_dir()]
            if not info or sum(m.file_size for m in info) > 400_000_000:
                raise ValueError("Missing goalie CSV or unsafe archive size")
            writer = csv.DictWriter(out, fieldnames=OUTFIELDS)
            writer.writeheader()
            for m in info:
                with z.open(m) as stream:
                    reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
                    if not reader.fieldnames or not set(FIELDS).issubset(reader.fieldnames):
                        continue
                    for row in reader:
                        if row["situation"] != "all":
                            continue
                        if any(row.get(f, "") == "" for f in FIELDS):
                            raise ValueError("Missing mandatory goalie game field")
                        writer.writerow({f: row[f] for f in FIELDS})
                        count += 1
        if count < 100 or (output / ("goalies-" + str(season) + ".csv")).stat().st_size > 9_000_000:
            raise ValueError("Goalie archive missing or exceeds parser bounds")
        print("Goalie season", season, "historical all-situation player-games:", count, flush=True)
if __name__ == "__main__":
    main()
