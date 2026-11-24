#!/usr/bin/env python3
"""Trusted, one-way, source-only migration. Never executes private code."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tempfile

P = pathlib.Path
ALLOWED_CONFIG = {
    "config/ballpark-style-source-registry-v1.json",
    "config/canonical-research-entities-v1.json",
    "config/nba-phase-zero-schema.sql",
    "config/nba/dunk-cohort-study-v1.json",
    "config/nba/nba-context-study-v2.json",
    "config/nba/real-line-calibration-cohort-v1.json",
    "config/nba/free-pinned-recovery-v1.json",
    "config/nfl-weather-venue-registry-v1.json",
    "config/esports/sources-v1.json",
}
SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|"
    r"(?:ghp_|github_pat_|sk_live_|sk-proj-|AKIA)[A-Za-z0-9_-]{16,}|"
    r"(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*['\"][A-Za-z0-9_./+=-]{24,}['\"]|"
    r"https?://[^/\s:@]+:[^/\s@]+@",
    re.I,
)
PRIVATE_NAME = re.compile(r"(^|/)(fixtures?|credentials?|secrets?)(/|\.|$)|named-paper-slips|bankroll|private-prizepicks-follow-target|(^|/)\.env", re.I)
PERSONAL_VALUES = re.compile(r"['\"]?(?:startingDollars|unitDollars|accountEmail|accountPassword)['\"]?\s*:\s*(?:[0-9]+|['\"][^'\"]+['\"])", re.I)

def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.DEVNULL)

def safe_path(path):
    return bool(re.fullmatch(r"[A-Za-z0-9_.\-/]+", path)) and all(x not in ("", ".", "..", ".git") for x in path.split("/"))

def dest_for(path):
    if not safe_path(path) or PRIVATE_NAME.search(path):
        return None
    if path.startswith(".github/workflows/") and P(path).suffix in (".yml", ".yaml"):
        return "migration/legacy-workflow-templates/" + P(path).name
    if path in ALLOWED_CONFIG or path in ("package.json", ".gitignore"):
        return path
    if path.split("/")[0] in ("src", "scripts", "test") and P(path).suffix in (".cjs", ".js", ".mjs", ".py", ".sh"):
        return path
    return None

def valid_text(blob):
    if len(blob) > 512_000 or b"\x00" in blob:
        return False
    try:
        s = blob.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return not (SECRET.search(s) or PERSONAL_VALUES.search(s))

def entries(repo, ref):
    raw = git(repo, "ls-tree", "-r", "-z", "--full-tree", ref)
    for row in raw.split(b"\0"):
        if row:
            meta, p = row.split(b"\t", 1)
            mode, kind, sha = meta.decode().split()
            yield p.decode("utf-8", "surrogateescape"), mode, kind, sha

def digest(blob):
    return hashlib.sha256(blob).hexdigest()

def stage(args):
    private, public, candidate = map(lambda x: P(x).resolve(), (args.private, args.public, args.candidate))
    if candidate.exists():
        raise RuntimeError("Candidate directory already exists")
    candidate.mkdir(parents=True)
    plan = json.loads(P(args.plan).read_text())
    counts = collections.Counter()
    origins = collections.Counter()
    archive_count = 0
    manifest = {}
    variants = set()

    def add(path, mode, kind, sha, origin):
        counts["examined"] += 1
        dest = dest_for(path)
        if not dest or kind != "blob" or mode not in ("100644", "100755"):
            counts["withheld_by_policy"] += 1
            return
        blob = git(private, "cat-file", "blob", sha)
        if not valid_text(blob):
            counts["withheld_by_initial_scan"] += 1
            return
        old = public / dest
        target = candidate / dest
        if old.is_symlink() or target.is_symlink():
            raise RuntimeError("Unexpected symlink")
        old_data = old.read_bytes() if old.is_file() else target.read_bytes() if target.is_file() else None
        if old_data is not None:
            if old_data == blob:
                counts["already_present"] += 1
                return
            # Conflicting revisions remain inactive review material; never overwrite public code.
            key = (path, digest(blob))
            if key in variants:
                counts["duplicate_variant"] += 1
                return
            variants.add(key)
            dest = "migration/review/" + origin + "/" + path
            target = candidate / dest
            counts["review_variants"] += 1
        if not safe_path(dest) or target.exists() or (public / dest).exists():
            counts["destination_collision"] += 1
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        manifest[dest] = digest(blob)
        origins[origin] += 1
        counts["candidate_files"] += 1

    baseline = plan["baseline"]
    if git(private, "rev-parse", "HEAD").decode().strip() != baseline:
        raise RuntimeError("Private baseline not pinned")
    # Newest unmerged changes take precedence only when the public path is absent.
    for pr in plan["pull_requests"]:
        try:
            index = {p: (m, k, s) for p, m, k, s in entries(private, pr["head"])}
        except subprocess.CalledProcessError:
            counts["unavailable_branch_refs"] += 1
            continue
        counts["branch_refs_examined"] += 1
        for path in pr["paths"]:
            item = index.get(path)
            if item is None:
                counts["missing_branch_paths"] += 1
            else:
                add(path, *item, "pr-" + str(pr["number"]))
    for path, mode, kind, sha in entries(private, baseline):
        if path.startswith("outputs/"):
            archive_count += 1
            continue
        add(path, mode, kind, sha, "main-baseline")
    result = {"schema": 1, "counts": dict(counts), "origins": dict(origins),
              "historical_output_files_retained_privately": archive_count,
              "files": manifest}
    P(args.manifest).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"candidate_files": len(manifest), "historical_outputs_retained": archive_count,
                      "branch_refs_examined": counts["branch_refs_examined"]}))

def publish(args):
    public, candidate = P(args.public).resolve(), P(args.candidate).resolve()
    manifest = json.loads(P(args.manifest).read_text())
    leaks = json.loads(P(args.leaks).read_text())
    if not isinstance(leaks, list):
        raise RuntimeError("Invalid scanner report")
    flagged = set()
    for leak in leaks:
        f = P(leak["File"])
        if f.is_absolute():
            f = f.resolve().relative_to(candidate)
        else:
            direct = (candidate / f).resolve()
            if direct.is_file():
                f = direct.relative_to(candidate)
            else:
                f = f.resolve().relative_to(candidate)
        name = f.as_posix()
        if name not in manifest["files"]:
            raise RuntimeError("Scanner returned an unknown path")
        flagged.add(name)
    # Copy only verified manifest files. Never stage any other private file or raw archive.
    added = []
    for name, expected in manifest["files"].items():
        if name in flagged:
            continue
        if not safe_path(name) or (not dest_for(name) and not name.startswith(("migration/review/", "migration/legacy-workflow-templates/"))):
            raise RuntimeError("Unexpected destination")
        source = candidate / name
        dest = public / name
        if source.is_symlink() or dest.is_symlink() or dest.exists() or not source.is_file():
            raise RuntimeError("Destination lease changed")
        blob = source.read_bytes()
        if digest(blob) != expected or not valid_text(blob):
            raise RuntimeError("Candidate changed")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob)
        added.append(name)
    report = {
        "kind": "public_source_migration_inventory_v1",
        "baseline_and_branch_counts": manifest["counts"],
        "historical_output_files_retained_privately": manifest["historical_output_files_retained_privately"],
        "branch_candidate_counts": manifest["origins"],
        "secret_scanner_withheld_files": len(flagged),
        "source_files_staged": len(added),
        "raw_historical_rows_published": 0,
        "paid_sports_api_requests": 0,
        "legacy_workflows_activated": 0,
        "model_promoted": False,
        "note": "Code-only snapshot; original private Git history and raw archives retained. Review variants and workflow templates are not active. Existing public files were not overwritten.",
    }
    out = "migration/public-source-inventory.json"
    if (public / out).exists():
        raise RuntimeError("Existing inventory; refuse overwrite")
    (public / out).parent.mkdir(parents=True, exist_ok=True)
    (public / out).write_text(json.dumps(report, indent=2) + "\n")
    added.append(out)
    P(args.paths).write_bytes(b"\0".join(x.encode() for x in added) + b"\0")
    print(json.dumps(report))

def self_test():
    assert dest_for("src/model.cjs") == "src/model.cjs"
    assert dest_for("scripts/collector.py") == "scripts/collector.py"
    assert dest_for(".github/workflows/old.yml") == "migration/legacy-workflow-templates/old.yml"
    for path in ("outputs/raw.json", "config/platform.json", "docs/raw.md", "src/../oops.cjs",
                 "src/.env.cjs", "test/fixtures/a.cjs", "scripts/grade-nhl-named-paper-slips.cjs",
                 "scheduler/token.py", "src/.git/evil.cjs"):
        assert dest_for(path) is None, path
    assert not valid_text(b"-----BEGIN PRIVATE KEY-----")
    assert not valid_text(b'{"startingDollars": 12}')
    assert valid_text(b'const x = process.env.API_KEY;')
    with tempfile.TemporaryDirectory() as tmp:
        root = P(tmp)
        source, target = root / "source", root / "target"
        source.mkdir(); target.mkdir()
        (source / "src").mkdir()
        file = source / "src" / "test.cjs"
        file.write_text("module.exports = 1;\n")
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({"files": {"src/test.cjs": digest(file.read_bytes())},
            "counts": {}, "origins": {}, "historical_output_files_retained_privately": 1}))
        leaks = root / "leaks.json"; leaks.write_text("[]")
        paths = root / "paths"
        publish(argparse.Namespace(public=str(target), candidate=str(source),
            manifest=str(manifest), leaks=str(leaks), paths=str(paths)))
        assert (target / "src/test.cjs").read_bytes() == file.read_bytes()
        assert not (target / "outputs").exists()
    print("Migration guard self-test passed")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="action", required=True)
    st = sub.add_parser("stage")
    for a in ("private", "public", "candidate", "plan", "manifest"): st.add_argument("--" + a, required=True)
    pu = sub.add_parser("publish")
    for a in ("public", "candidate", "manifest", "leaks", "paths"): pu.add_argument("--" + a, required=True)
    sub.add_parser("self-test")
    args = p.parse_args()
    if args.action == "stage": stage(args)
    elif args.action == "publish": publish(args)
    else: self_test()
