#!/usr/bin/env python3
"""Download only MoneyPuck's linked game-by-game skater season ZIPs.

Builds temporary, deterministic 21-column game CSVs for Node analysis.
Never uploads or commits third-party raw data; no page scraping.
"""
import csv
import io
import os
from pathlib import Path
import urllib.request
import zipfile

SOURCES = {
    2024: "https://peter-tanner.com/moneypuck/downloads/seasonPlayersSummary/skaters/2024.zip",
    2025: "https://peter-tanner.com/moneypuck/downloads/seasonPlayersSummary/skaters/2025.zip",
}
FIELDS = ["playerId", "gameId", "gameDate", "situation", "icetime",
          "I_F_xOnGoal", "I_F_xGoals", "I_F_shotsOnGoal", "I_F_goals"]
OUTFIELDS = FIELDS + ["unused" + str(i) for i in range(12)]
MAX_ZIP_BYTES = 100_000_000
MAX_UNCOMPRESSED_BYTES = 450_000_000

def download(url):
    with urllib.request.urlopen(urllib.request.Request(
            url, headers={"User-Agent": "Private-NHL-Research-Approved-Data/1.0"}), timeout=60) as response:
        chunks, size = [], 0
        while True:
            part = response.read(1024 * 1024)
            if not part:
                break
            size += len(part)
            if size > MAX_ZIP_BYTES:
                raise ValueError("MoneyPuck archive exceeded compressed byte safety limit")
            chunks.append(part)
    return b"".join(chunks)

def process_zip(data, season, target):
    total, skipped = 0, 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = [m for m in archive.infolist() if not m.is_dir() and m.filename.lower().endswith(".csv")]
        if not members or sum(m.file_size for m in members) > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("Missing CSV members or uncompressed archive exceeds safety budget")
        with target.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=OUTFIELDS)
            writer.writeheader()
            for member in members:
                with archive.open(member) as raw:
                    rows = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
                    if not rows.fieldnames or not set(FIELDS).issubset(rows.fieldnames):
                        skipped += 1
                        continue
                    for row in rows:
                        if row.get("situation") != "all":
                            continue
                        if any(row.get(field, "") == "" for field in FIELDS):
                            raise ValueError("MoneyPuck archive contains blank required skater-game field")
                        writer.writerow({field: row.get(field, "") for field in FIELDS})
                        total += 1
    if total < 100:
        raise ValueError("MoneyPuck archive had too few valid skater-game rows: " + str(total))
    if target.stat().st_size > 9_000_000:
        raise ValueError("Normalized MoneyPuck CSV exceeds existing parser size ceiling")
    print("Season " + str(season) + " staged " + str(total) +
          " all-situation player-games; " + str(skipped) + " non-game CSV member(s) skipped", flush=True)

def main():
    folder = Path(os.environ.get("MONEYPUCK_STAGE_DIR", "/tmp/moneypuck-game-lab"))
    folder.mkdir(parents=True, exist_ok=True)
    for season, url in SOURCES.items():
        process_zip(download(url), season, folder / (str(season) + ".csv"))

if __name__ == "__main__":
    main()
