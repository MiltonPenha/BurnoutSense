"""Local private evaluator API. No CLI, automatic approval, export or final refit."""

from contextlib import contextmanager, redirect_stderr, redirect_stdout
from dataclasses import asdict, dataclass
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
from importlib.metadata import distributions
import io
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess

from sklearn.model_selection import KFold

from tools.verify_v2_environment import audit as audit_environment, SNAPSHOT
from training.import_forms import import_official_forms_csv
from training.form_schema import SpecialValue
from training.optimization_v2 import run_optimization_v2
from training.optimization_v2_comparison import compare_predictor_sets
from training.optimization_v2_validation import verify_optimization_v2
from training.private_v2_contracts import (
    AggregateOutputs, FrozenEvaluationConfig, REQUIRED_MODULES, validate_aggregate_outputs,
    validate_config, validate_paths, validate_protocol_bytes,
)
from training.regression_experiments import ExperimentProtocol
from training.regression_preprocessing import prepare_regression_data


REPOSITORY = Path(__file__).resolve().parents[2]
MAX_INPUT_BYTES = 10 * 1024 * 1024
SOURCE_FILES = tuple(sorted({*(f"ai-service/{p}" for p in REQUIRED_MODULES),
    "ai-service/training/run_private_optimization_v2.py",
    "ai-service/tools/verify_v2_environment.py", "ai-service/requirements-v2-windows-py312.txt"}))
ERROR_CODES = frozenset((
    "OPERATIONAL_PREFLIGHT_FAILED", "ENVIRONMENT_MISMATCH", "UNSAFE_PATHS", "PRIVATE_PERMISSIONS_REQUIRED",
    "INPUT_CHANGED", "FILE_TOO_LARGE", "INVALID_REVIEW", "REVIEW_AUTHENTICATION_FAILED", "REVIEW_EXPIRED",
    "INVALID_PLAN", "INVALID_REVIEW_KEY", "DOCUMENTARY_REVIEW_REQUIRED", "CLEAN_CODE_REQUIRED",
    "PROVENANCE_MISMATCH", "DOCUMENT_CHANGED", "INPUT_HASH_MISMATCH", "INVALID_COUNTS", "INSUFFICIENT_DATA",
    "PRIVATE_INSPECTION_FAILED", "NETWORK_DISABLED", "POPULATION_REVIEW_MISMATCH", "POPULATION_REVIEW_REQUIRED",
    "PROVENANCE_CHANGED", "EVALUATION_OR_OUTPUT_FAILED", "PRIVATE_EVALUATION_FAILED"))


class PrivateExecutionError(ValueError):
    """Fixed codes only. No original exceptions, responses or paths."""


def _git(arguments, payload=None):
    """Read-only Git with no inherited redirection, global config, hooks or monitor."""
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_SYSTEM=os.devnull,
               GIT_CONFIG_GLOBAL=os.devnull, GIT_OPTIONAL_LOCKS="0")
    command = ["git", "--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false",
               "-c", "core.untrackedCache=false", "-c", f"core.hooksPath={os.devnull}", *arguments]
    return subprocess.check_output(command, cwd=REPOSITORY, env=env, input=payload,
                                   stderr=subprocess.DEVNULL)


def _git_integrity():
    _require(Path(_git(["rev-parse", "--show-toplevel"]).decode().strip()).resolve() == REPOSITORY,
             "OPERATIONAL_PREFLIGHT_FAILED")
    head = _git(["rev-parse", "--verify", "HEAD"]).decode().strip()
    _require(re.fullmatch(r"[0-9a-f]{40}", head) is not None, "OPERATIONAL_PREFLIGHT_FAILED")
    status_command = ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]
    status = _git(status_command)
    tree = _git(["ls-tree", "-r", "-z", "--full-tree", head, "--", *SOURCE_FILES])
    index = _git(["ls-files", "--stage", "-z", "--", *SOURCE_FILES])
    entries, indexed = {}, {}
    for raw in tree.split(b"\0"):
        if not raw:
            continue
        info, path = raw.split(b"\t", 1)
        mode, kind, oid = info.decode().split()
        name = path.decode("utf-8")
        _require(name in SOURCE_FILES and name not in entries and kind == "blob"
                 and mode in ("100644", "100755") and re.fullmatch(r"[0-9a-f]{40}", oid) is not None,
                 "OPERATIONAL_PREFLIGHT_FAILED")
        entries[name] = (mode, oid)
    for raw in index.split(b"\0"):
        if not raw:
            continue
        info, path = raw.split(b"\t", 1)
        mode, oid, stage = info.decode().split()
        name = path.decode("utf-8")
        _require(name in SOURCE_FILES and name not in indexed and stage == "0", "OPERATIONAL_PREFLIGHT_FAILED")
        indexed[name] = (mode, oid)
    names = sorted(entries)
    batch = _git(["cat-file", "--batch"], ("\n".join(entries[n][1] for n in names) + "\n").encode()) if names else b""
    blobs, cursor = {}, 0
    for name in names:
        end = batch.index(b"\n", cursor)
        oid, kind, length = batch[cursor:end].decode().split()
        size = int(length)
        _require(oid == entries[name][1] and kind == "blob" and 0 <= size <= MAX_INPUT_BYTES,
                 "OPERATIONAL_PREFLIGHT_FAILED")
        cursor = end + 1
        blobs[name] = batch[cursor:cursor + size]
        cursor += size
        _require(batch[cursor:cursor + 1] == b"\n", "OPERATIONAL_PREFLIGHT_FAILED")
        cursor += 1
    _require(cursor == len(batch), "OPERATIONAL_PREFLIGHT_FAILED")
    sources, mismatches = {}, []
    for name in SOURCE_FILES:
        path = REPOSITORY / name
        _require(path.is_file() and not path.is_symlink()
                 and not (getattr(path.lstat(), "st_file_attributes", 0) & 0x400), "OPERATIONAL_PREFLIGHT_FAILED")
        content = path.read_bytes()
        sources[name] = _sha(content)
        if (name not in blobs or indexed.get(name) != entries.get(name)
                or content.replace(b"\r\n", b"\n") != blobs[name].replace(b"\r\n", b"\n")):
            mismatches.append(name)
    _require(_git(["rev-parse", "--verify", "HEAD"]).decode().strip() == head
             and _git(status_command) == status, "OPERATIONAL_PREFLIGHT_FAILED")
    return dict(git_commit=head, working_tree_dirty=bool(status), source_sha256=sources,
                required_files_match_head=not mismatches, required_files_not_matching_head=mismatches)


def destination_sha256(path):
    """Exact resolved UTF-8 spelling; fail closed on ambiguous Windows aliases."""
    try:
        raw = Path(path).absolute()
        if os.name == "nt":
            _require(re.fullmatch(r"[A-Za-z]:", raw.drive) is not None, "UNSAFE_PATHS")
            for component in raw.parts[1:]:
                if component in (".", ".."):
                    continue
                _require(not component.endswith((".", " "))
                         and not re.search(r'[<>:"|?*\x00-\x1f]', component)
                         and re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", component) is None,
                         "UNSAFE_PATHS")
        for item in (raw, *raw.parents):
            if item.exists() or item.is_symlink():
                _require(not item.is_symlink() and not (getattr(item.lstat(), "st_file_attributes", 0) & 0x400),
                         "UNSAFE_PATHS")
        resolved = raw.resolve()
        if os.name == "nt":
            _require(re.fullmatch(r"[A-Za-z]:", resolved.drive) is not None, "UNSAFE_PATHS")
        return _sha(str(resolved).encode("utf-8"))
    except Exception:
        pass
    raise PrivateExecutionError("UNSAFE_PATHS")


def _require(condition, code):
    if not condition:
        raise PrivateExecutionError(code)


def _canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def _sha(payload):
    return hashlib.sha256(payload).hexdigest()


def _hex(value):
    return type(value) is str and re.fullmatch(r"[0-9a-f]{64}", value) is not None


@dataclass(frozen=True)
class PrivatePlan:
    source: Path
    output: Path
    private_root: Path
    trust_root: Path
    institution_document: Path
    tcle_document: Path
    documentary_review: Path
    population_review: Path
    verification_key: Path


@dataclass(frozen=True)
class PopulationInspection:
    input_sha256: str
    documentary_review_sha256: str
    code_sha256: str
    environment_sha256: str
    protocol_sha256: str
    destination_sha256: str
    counts: dict[str, int]
    ordered_population_commitment: str
    partitions_commitment: str


@dataclass(frozen=True)
class PrivateRunResult:
    status: str
    technically_complete: bool
    requires_human_review: bool = True


def describe_runtime():
    """Only code/config/environment. Does not read data or review material."""
    code = "OPERATIONAL_PREFLIGHT_FAILED"
    try:
        protocol = validate_protocol_bytes((REPOSITORY / "docs/ML_OPTIMIZATION_V2_PROTOCOL.md").read_bytes())
        validate_config(FrozenEvaluationConfig())
        environment = audit_environment(SNAPSHOT.read_bytes())
        _require(environment["matches"], "ENVIRONMENT_MISMATCH")
        libraries = tuple(sorted((d.metadata["Name"], d.version) for d in distributions()))
        integrity = _git_integrity()
        return dict(**integrity, code_sha256=_sha(_canonical(integrity)),
                    protocol_sha256=protocol, environment=environment, libraries=libraries,
                    environment_sha256=_sha(_canonical(dict(audit=environment, libraries=libraries))))
    except Exception as error:
        if type(error) is PrivateExecutionError and str(error) in ERROR_CODES:
            code = str(error)
    raise PrivateExecutionError(code)


def _external_file(path, root):
    raw = Path(path).absolute()
    for item in (raw, *raw.parents):
        if item.exists() or item.is_symlink():
            _require(not item.is_symlink() and not (getattr(item.lstat(), "st_file_attributes", 0) & 0x400), "UNSAFE_PATHS")
    resolved = raw.resolve()
    _require(resolved.is_relative_to(root) and not resolved.is_relative_to(REPOSITORY)
             and resolved.is_file() and resolved.stat().st_nlink == 1, "UNSAFE_PATHS")
    _require(not any((p / ".git").exists() for p in resolved.parents), "UNSAFE_PATHS")
    return resolved


def _private_permissions(paths):
    """Conservative ACL/mode check; no mutation or participant-related output."""
    if os.name == "nt":
        script = r'''
$ErrorActionPreference='Stop'
try {
 $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $allowed=@($me,'S-1-5-18','S-1-5-32-544')
 foreach($p in ($env:BURNOUTSENSE_ACL_PATHS | ConvertFrom-Json)) {
  $acl=Get-Acl -LiteralPath $p
  if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed) { exit 3 }
  foreach($entry in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
   $sid=$entry.IdentityReference.Value
   if($entry.AccessControlType -eq 'Allow' -and $sid -notin $allowed -and [int]$entry.FileSystemRights -ne 0) { exit 3 }
  }
 }
 exit 0
} catch { exit 3 }
'''
        env = os.environ.copy()
        env["BURNOUTSENSE_ACL_PATHS"] = json.dumps([str(p) for p in paths])
        executable = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        env["PSModulePath"] = str(executable.parent / "Modules")
        result = subprocess.run([str(executable), "-NoProfile", "-NonInteractive", "-Command", script],
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        _require(result.returncode == 0, "PRIVATE_PERMISSIONS_REQUIRED")
    else:
        _require(all(p.stat().st_uid == os.getuid() and not p.stat().st_mode & 0o077 for p in paths),
                 "PRIVATE_PERMISSIONS_REQUIRED")
    _require(all(os.access(p, os.R_OK) for p in paths), "PRIVATE_PERMISSIONS_REQUIRED")


def _read(path, limit):
    """Read a regular single-link file once; compare descriptor with path metadata."""
    before = path.lstat()
    _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
             and not (getattr(before, "st_file_attributes", 0) & 0x400), "UNSAFE_PATHS")
    _require(before.st_size <= limit, "FILE_TOO_LARGE")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags), "rb") as stream:
        opened = os.fstat(stream.fileno())
        _require((before.st_dev, before.st_ino) == (opened.st_dev, opened.st_ino), "INPUT_CHANGED")
        payload = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    current = path.lstat()
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_nlink)
    _require(len(payload) <= limit and signature(before) == signature(after) == signature(current), "INPUT_CHANGED")
    return payload


def _unique_pairs(pairs):
    value = {}
    for key, item in pairs:
        _require(key not in value, "INVALID_REVIEW")
        value[key] = item
    return value


def _review(payload, key, fields, version):
    envelope = json.loads(payload.decode("utf-8"), object_pairs_hook=_unique_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(PrivateExecutionError("INVALID_REVIEW")))
    _require(type(envelope) is dict and set(envelope) == {"record", "signature"}, "INVALID_REVIEW")
    record = envelope["record"]
    _require(type(record) is dict and set(record) == set(fields), "INVALID_REVIEW")
    _require(record["version"] == version and _hex(envelope["signature"]), "INVALID_REVIEW")
    _require(hmac.compare_digest(envelope["signature"], hmac.new(key, _canonical(record), "sha256").hexdigest()),
             "REVIEW_AUTHENTICATION_FAILED")
    _review_window(record)
    return record


def _review_window(record):
    now = datetime.now(timezone.utc)
    dates = []
    for field in ("issued_utc", "expires_utc"):
        _require(type(record[field]) is str and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", record[field]) is not None,
                 "INVALID_REVIEW")
        dates.append(datetime.strptime(record[field], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc))
    _require(dates[0] <= now < dates[1] and dates[1] - dates[0] <= timedelta(days=1), "REVIEW_EXPIRED")


DOCUMENT_FIELDS = ("version", "decision", "scope", "data_origin", "input_sha256", "institution_sha256",
    "tcle_sha256", "protocol_sha256", "code_sha256", "environment_sha256", "destination_sha256",
    "issued_utc", "expires_utc")
POPULATION_FIELDS = ("version", "decision", "data_origin", "input_sha256", "documentary_review_sha256",
    "protocol_sha256", "code_sha256", "environment_sha256", "destination_sha256", "counts",
    "ordered_population_commitment", "partitions_commitment", "independence", "exclusions",
    "v1_pairing", "issued_utc", "expires_utc")


def _prepare(plan):
    _require(type(plan) is PrivatePlan, "INVALID_PLAN")
    runtime = describe_runtime()
    root, trust = Path(plan.private_root).resolve(), Path(plan.trust_root).resolve()
    _require(root.is_dir() and trust.is_dir() and not root.is_relative_to(trust)
             and not trust.is_relative_to(root), "UNSAFE_PATHS")
    destinations = validate_paths(plan.source, plan.output, repository=REPOSITORY, private_root=root)
    files = {k: _external_file(getattr(plan, k), trust) for k in (
        "institution_document", "tcle_document", "documentary_review", "verification_key")}
    _require(len(set(files.values())) == len(files), "UNSAFE_PATHS")
    _private_permissions([root, trust, destinations.source, destinations.output.parent, *files.values()])
    _require(os.access(destinations.output.parent, os.W_OK), "PRIVATE_PERMISSIONS_REQUIRED")
    key = _read(files["verification_key"], 32)
    _require(len(key) == 32, "INVALID_REVIEW_KEY")
    documentary = _read(files["documentary_review"], 1024 * 1024)
    review = _review(documentary, key, DOCUMENT_FIELDS, "private-v2-document-review/1")
    _require(review["decision"] == "institution_and_tcle_reviewed"
             and review["scope"] == "academic_evaluation_no_publication"
             and review["data_origin"] in ("synthetic", "real_authorized"), "DOCUMENTARY_REVIEW_REQUIRED")
    for field in ("input_sha256", "institution_sha256", "tcle_sha256", "protocol_sha256", "code_sha256",
                  "environment_sha256", "destination_sha256"):
        _require(_hex(review[field]), "INVALID_REVIEW")
    _require(review["data_origin"] == "synthetic" or (
        not runtime["working_tree_dirty"] and runtime["required_files_match_head"]), "CLEAN_CODE_REQUIRED")
    destination = destination_sha256(plan.output)
    for field, value in (("code_sha256", runtime["code_sha256"]), ("environment_sha256", runtime["environment_sha256"]),
                         ("protocol_sha256", runtime["protocol_sha256"]), ("destination_sha256", destination)):
        _require(review[field] == value, "PROVENANCE_MISMATCH")
    _require(_sha(_read(files["institution_document"], MAX_INPUT_BYTES)) == review["institution_sha256"]
             and _sha(_read(files["tcle_document"], MAX_INPUT_BYTES)) == review["tcle_sha256"], "DOCUMENT_CHANGED")
    # First and only CSV read: all operational/documentary gates above precede it.
    source = _external_file(destinations.source, root)
    payload = _read(source, MAX_INPUT_BYTES)
    _require(_sha(payload) == review["input_sha256"], "INPUT_HASH_MISMATCH")
    imported = import_official_forms_csv(io.StringIO(payload.decode("utf-8-sig")))
    counts = dict(rows_read=imported.rows_read, eligible=imported.eligible_count,
                  ineligible=imported.ineligible_count, rejected=imported.rejected_count)
    _require(counts["rows_read"] == sum(counts[k] for k in ("eligible", "ineligible", "rejected")), "INVALID_COUNTS")
    _require(counts["eligible"] >= 10, "INSUFFICIENT_DATA")
    data = prepare_regression_data(imported.records)
    population = hmac.new(key, b"ordered-population/1\n", "sha256")
    for record in imported.records:
        canonical_record = {k: v.value if v is SpecialValue.NOT_APPLICABLE else v for k, v in record.items()}
        population.update(_canonical(canonical_record) + b"\n")
    partitions = hmac.new(key, b"partitions/1\n", "sha256")
    for repeat in range(3):
        for number, (train, test) in enumerate(KFold(5, shuffle=True, random_state=42 + repeat).split(data.X), 1):
            inner = KFold(3, shuffle=True, random_state=42 + 1000 + repeat * 5 + number).split(train)
            partitions.update(_canonical(dict(repeat=repeat + 1, fold=number, train=train.tolist(), test=test.tolist(),
                inner=[dict(train=a.tolist(), test=b.tolist()) for a, b in inner])))
    inspection = PopulationInspection(review["input_sha256"], _sha(documentary), runtime["code_sha256"],
        runtime["environment_sha256"], runtime["protocol_sha256"], destination, counts,
        population.hexdigest(), partitions.hexdigest())
    return destinations, runtime, review, key, inspection, data


def inspect_private_input(plan):
    """Authorized read-only population inspection, no training or persistence."""
    code = "PRIVATE_INSPECTION_FAILED"
    try:
        return _prepare(plan)[4]
    except Exception as error:
        if type(error) is PrivateExecutionError and str(error) in ERROR_CODES:
            code = str(error)
    raise PrivateExecutionError(code)


class _Discard:
    def write(self, value):
        return len(value)

    def flush(self):
        pass


@contextmanager
def _offline_scope():
    """Python-level defense only; dedicated process and OS isolation still required."""
    original_socket, original_connect = socket.socket, socket.create_connection
    def denied(*args, **kwargs):
        raise PrivateExecutionError("NETWORK_DISABLED")
    socket.socket = socket.create_connection = denied
    try:
        with redirect_stdout(_Discard()), redirect_stderr(_Discard()):
            yield
    finally:
        socket.socket, socket.create_connection = original_socket, original_connect


def _write(path, value):
    with path.open("x", encoding="utf-8") as stream:
        stream.write(_canonical(value).decode("utf-8"))
        stream.flush()
        os.fsync(stream.fileno())


@dataclass(frozen=True)
class ArtifactConclusion:
    valid_artifacts: bool
    status: str | None
    technically_complete: bool
    issues: tuple[str, ...]
    requires_human_review: bool = True


ARTIFACT_NAMES = frozenset(("started.json", "report.aggregate.json", "verification.aggregate.json",
                           "comparison.aggregate.json", "manifest.json", "prepared.json", "finished.json"))


def _read_json(path):
    return json.loads(_read(path, MAX_INPUT_BYTES).decode("utf-8"), object_pairs_hook=_unique_pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))


def validate_completed_run(output, expected_result=None):
    """Read-only artifact consumer. Failure marker always overrides completion.

    Hashes are consistency evidence, not authentication of the producer or ethics.
    A valid incomplete set remains technically incomplete. Concurrent changes and
    inability to persist a failure cannot be ruled out by a filesystem reader.
    """
    try:
        root = Path(output).absolute()
        destination_sha256(root)  # Reject aliases/reparse points, without logging paths.
        root = root.resolve()
        _require(root.is_dir() and not root.is_relative_to(REPOSITORY), "INVALID_PLAN")
        failure = root / "failed.json"
        if failure.exists() or failure.is_symlink():
            return ArtifactConclusion(False, None, False, ("failure_marker_present",))
        _require({p.name for p in root.iterdir()} == ARTIFACT_NAMES, "INVALID_PLAN")
        values = {name: _read_json(root / name) for name in ARTIFACT_NAMES}
        started, prepared, finished, manifest = (values[k] for k in (
            "started.json", "prepared.json", "finished.json", "manifest.json"))
        _require(started == dict(version="private-v2-run-state/1", status="evaluation_started"), "INVALID_PLAN")
        status = manifest["status"]
        _require(status in ("technically_complete", "incomplete")
                 and prepared.keys() == {"version", "status", "artifact_sha256"}
                 and prepared["version"] == "private-v2-finalization/1" and prepared["status"] == status,
                 "INVALID_PLAN")
        hashed = ARTIFACT_NAMES - {"prepared.json", "finished.json"}
        _require(type(prepared["artifact_sha256"]) is dict and set(prepared["artifact_sha256"]) == hashed, "INVALID_PLAN")
        for name in hashed:
            _require(_hex(prepared["artifact_sha256"][name])
                     and _sha(_read(root / name, MAX_INPUT_BYTES)) == prepared["artifact_sha256"][name], "INVALID_PLAN")
        _require(finished == dict(version="private-v2-run-state/1", status=status,
                                  prepared_sha256=_sha(_read(root / "prepared.json", MAX_INPUT_BYTES))), "INVALID_PLAN")
        report, verification, comparison = (values[k] for k in (
            "report.aggregate.json", "verification.aggregate.json", "comparison.aggregate.json"))
        complete = validate_aggregate_outputs(AggregateOutputs(report, verification, comparison))
        _require((status == "technically_complete") == complete
                 and manifest["version"] == "private-v2-execution/1"
                 and manifest["scientific_approval"] is False and manifest["requires_human_review"] is True
                 and manifest["protocol_sha256"] == validate_protocol_bytes(
                     (REPOSITORY / "docs/ML_OPTIMIZATION_V2_PROTOCOL.md").read_bytes())
                 and manifest["data_origin"] == report["data_origin"]
                 and manifest["counts"]["eligible"] == report["n_samples"]
                 and manifest["protocol"] == report["protocol"]
                 and _canonical(manifest["predictor_sets"]) == _canonical(report["predictor_sets"])
                 and _canonical(manifest["candidates"]) == _canonical(report["candidates"])
                 and manifest["comparison_version"] == comparison["version"], "INVALID_PLAN")
        _require(manifest["output_sha256"] == {k: _sha(_read(root / (k + ".aggregate.json"), MAX_INPUT_BYTES))
                                              for k in ("report", "verification", "comparison")}, "INVALID_PLAN")
        if expected_result is not None:
            _require(type(expected_result) is PrivateRunResult and expected_result.status == status
                     and expected_result.technically_complete is complete
                     and expected_result.requires_human_review is True, "INVALID_PLAN")
        _require(not failure.exists() and not failure.is_symlink(), "INVALID_PLAN")
        return ArtifactConclusion(True, status, complete, ())
    except Exception:
        pass
    return ArtifactConclusion(False, None, False, ("invalid_or_incomplete_artifact_set",))


def _reserve_output(path):
    path.mkdir(mode=0o700, exist_ok=False)


def _run(plan):
    destinations, runtime, documentary, key, inspection, data = _prepare(plan)
    population_path = _external_file(plan.population_review, Path(plan.trust_root).resolve())
    _private_permissions([population_path])
    population_bytes = _read(population_path, 1024 * 1024)
    population = _review(population_bytes, key, POPULATION_FIELDS, "private-v2-population-review/1")
    expected = asdict(inspection)
    _require(all(population[k] == value for k, value in expected.items()), "POPULATION_REVIEW_MISMATCH")
    _require(type(population["counts"]) is dict and set(population["counts"]) == set(inspection.counts)
             and all(type(v) is int for v in population["counts"].values()), "POPULATION_REVIEW_MISMATCH")
    _require(population["decision"] == "population_reviewed_for_this_evaluation"
             and population["data_origin"] == documentary["data_origin"]
             and population["independence"] == "independent_observations_reviewed"
             and population["exclusions"] == "eligibility_and_exclusions_reviewed"
             and population["v1_pairing"] in ("not_established", "documented_by_responsible"), "POPULATION_REVIEW_REQUIRED")
    _require(describe_runtime() == runtime, "PROVENANCE_CHANGED")
    _review_window(documentary)
    _review_window(population)
    # Recheck destination ancestry/permissions just before exclusive reservation.
    validate_paths(plan.source, plan.output, repository=REPOSITORY, private_root=plan.private_root)
    _private_permissions([destinations.output.parent])
    _reserve_output(destinations.output)
    try:
        _write(destinations.output / "started.json", dict(version="private-v2-run-state/1", status="evaluation_started"))
        with _offline_scope():
            report = run_optimization_v2(data, protocol=ExperimentProtocol(), data_origin=documentary["data_origin"])
            _require(report["n_samples"] == inspection.counts["eligible"]
                     and report["data_origin"] == documentary["data_origin"], "PROVENANCE_MISMATCH")
            verification = verify_optimization_v2(report)
            comparison = compare_predictor_sets(report)
            complete = validate_aggregate_outputs(AggregateOutputs(report, asdict(verification), comparison))
        _require(describe_runtime() == runtime, "PROVENANCE_CHANGED")
        values = dict(report=report, verification=asdict(verification), comparison=comparison)
        manifest = dict(version="private-v2-execution/1", data_origin=documentary["data_origin"],
            status="technically_complete" if complete else "incomplete", scientific_approval=False,
            requires_human_review=True, institutional_validity="requires_external_document_review",
            documentary_review_sha256=inspection.documentary_review_sha256,
            population_review_sha256=_sha(population_bytes), institution_sha256=documentary["institution_sha256"],
            tcle_sha256=documentary["tcle_sha256"], input_sha256=inspection.input_sha256, counts=inspection.counts,
            ordered_population_commitment=inspection.ordered_population_commitment,
            partitions_commitment=inspection.partitions_commitment, v1_pairing=population["v1_pairing"],
            protocol=report["protocol"], predictor_sets=report["predictor_sets"], candidates=report["candidates"],
            comparison_version=comparison["version"], output_sha256={k: _sha(_canonical(v)) for k, v in values.items()},
            **runtime)
        for name, value in values.items():
            _write(destinations.output / (name + ".aggregate.json"), value)
        _write(destinations.output / "manifest.json", manifest)
        hashed = ARTIFACT_NAMES - {"prepared.json", "finished.json"}
        _write(destinations.output / "prepared.json", dict(version="private-v2-finalization/1", status=manifest["status"],
            artifact_sha256={name: _sha(_read(destinations.output / name, MAX_INPUT_BYTES)) for name in sorted(hashed)}))
        _write(destinations.output / "finished.json", dict(version="private-v2-run-state/1", status=manifest["status"],
            prepared_sha256=_sha(_read(destinations.output / "prepared.json", MAX_INPUT_BYTES))))
        result = PrivateRunResult(manifest["status"], complete)
        _require(validate_completed_run(destinations.output, result).valid_artifacts, "EVALUATION_OR_OUTPUT_FAILED")
        return result
    except Exception:
        try:
            _write(destinations.output / "failed.json", dict(version="private-v2-run-state/1", status="failed",
                                                            code="EVALUATION_OR_OUTPUT_FAILED"))
        except Exception:
            pass  # Preserve existing/partial evidence; never overwrite to force a marker.
    raise PrivateExecutionError("EVALUATION_OR_OUTPUT_FAILED")


def run_private_evaluation(plan):
    """No automatic source discovery or approval. Use only after external review.

    This API can process a private input; implementing/testing it is NOT approval
    to call it on participants. No --authorized flag or signing helper exists.
    """
    code = "PRIVATE_EVALUATION_FAILED"
    try:
        return _run(plan)
    except Exception as error:
        if type(error) is PrivateExecutionError and str(error) in ERROR_CODES:
            code = str(error)
    raise PrivateExecutionError(code)
