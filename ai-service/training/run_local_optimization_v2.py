"""Local, aggregate-only v2 workflow; no HMAC gate or OS network isolation.

The Python socket guard is defense in depth, not a sandbox. No HTTP/API clients,
final model fitting, participant predictions or model serialization are used.
"""
import argparse
from collections import Counter
import csv
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys

import numpy as np

from training.form_schema import ANALYTICAL_FIELDS, ELIGIBILITY_FIELDS, SpecialValue
from training.import_forms import import_official_forms_csv, official_header_mapping, _convert
from training.optimization_v2 import run_optimization_v2
from training.optimization_v2_comparison import compare_predictor_sets
from training.optimization_v2_validation import verify_optimization_v2
from training.private_v2_contracts import AggregateOutputs, validate_aggregate_outputs, validate_paths
from training.regression_experiments import ExperimentProtocol
from training.regression_preprocessing import prepare_regression_data, ALLOWED_PREDICTORS
from training.run_private_optimization_v2 import (
    REPOSITORY, MAX_INPUT_BYTES, _external_file, _private_permissions, _read,
    _offline_scope, _write, describe_runtime,
)

PRIVATE_ROOT = Path.home() / "BurnoutSense-v2-private-data"
CONTROLLED_INPUT = PRIVATE_ROOT / "input/BurnoutSense_Form_v1.0.csv"
EXPECTED_INPUT_SHA256 = "60ba5fda9cf8c5be8934eecd1bb78c96abb9422eab13c92e272798db2afea541"


def inspect_bytes(payload):
    """Official eligibility/scoring; return aggregates and transient modeling data.

    The second scan audits blanks and exclusion reasons, never changes the
    official population, never retains administrative values or row identifiers.
    """
    imported = import_official_forms_csv(io.StringIO(payload.decode("utf-8-sig")))
    counts = dict(rows_read=imported.rows_read, eligible=imported.eligible_count,
                  ineligible=imported.ineligible_count, rejected=imported.rejected_count)
    reader = csv.reader(io.StringIO(payload.decode("utf-8-sig")))
    headers = next(reader)
    columns = {identifier: headers.index(header) for header, identifier in official_header_mapping().items()}
    missing = Counter()
    exclusions = Counter()
    for row in reader:
        if len(row) != len(headers):
            continue
        for field in ANALYTICAL_FIELDS:
            if not row[columns[field.identifier]].strip():
                missing[field.group] += 1
        for field in ELIGIBILITY_FIELDS:
            try:
                value = _convert(field.identifier, row[columns[field.identifier]])
            except ValueError:
                break
            if value != field.choices[0]:
                exclusions[field.identifier] += 1
                break
    if sum(exclusions.values()) != counts["ineligible"]:
        raise ValueError("INCONSISTENT_ELIGIBILITY_AUDIT")
    issues = Counter("missing_required" if "ausente" in issue.reason else "invalid_or_inconsistent"
                     for issue in imported.issues if issue.kind == "invalid")
    data = prepare_regression_data(imported.records) if imported.records else None
    duplicates = 0
    if imported.records:
        canonical = [json.dumps({k: v.value if v is SpecialValue.NOT_APPLICABLE else v
                                 for k, v in record.items()}, sort_keys=True, ensure_ascii=False)
                     for record in imported.records]
        duplicates = len(canonical) - len(set(canonical))
    target = None
    if data is not None:
        y = data.y.to_numpy()
        if tuple(data.X.columns) != ALLOWED_PREDICTORS or not np.isfinite(y).all() or ((y < 0) | (y > 4)).any():
            raise ValueError("INVALID_MODELING_DATA")
        hist, _ = np.histogram(y, bins=[0, 1, 2, 3, 4])
        target = dict(mean=float(np.mean(y)), std=float(np.std(y, ddof=1)) if len(y) > 1 else None,
                      median=float(np.median(y)), q25=float(np.quantile(y, .25)),
                      q75=float(np.quantile(y, .75)), unique_values=int(len(np.unique(y))),
                      histogram=dict(zip(("[0,1)", "[1,2)", "[2,3)", "[3,4]"), map(int, hist))))
    reasons = []
    if counts["eligible"] < 10:
        reasons.append("insufficient_records_for_frozen_splits")
    if duplicates:
        reasons.append("identical_analytical_profiles_require_review_not_automatic_deduplication")
    if target is None or target["unique_values"] < 2:
        reasons.append("constant_or_absent_target")
    summary = dict(version="local-v2-inspection/1", counts=counts,
        excluded_first_negative_criterion={f.identifier: exclusions[f.identifier] for f in ELIGIBILITY_FIELDS},
        rejected_first_issue=dict(issues), missing_analytical_cells_all_rows=sum(missing.values()),
        missing_esbeu_cells_all_rows=missing["esbeu"],
        missing_cells_in_usable_records=0, predictors=22, outcome_items=14,
        official_header_count=len(headers), administrative_columns_excluded=len(imported.excluded_columns),
        usable_records=counts["eligible"], esbeu_validated_scale=[0, 4], target=target,
        identical_analytical_profiles_excess=duplicates,
        computationally_adequate=not reasons, review_reasons=reasons,
        independence="not_proven_by_csv_validation", input_sha256=hashlib.sha256(payload).hexdigest())
    return summary, data


def _load():
    runtime = describe_runtime()
    if not runtime["required_files_match_head"]:
        raise ValueError("SCIENTIFIC_SOURCE_DRIFT")
    _external_file(CONTROLLED_INPUT, PRIVATE_ROOT)
    _private_permissions([PRIVATE_ROOT, CONTROLLED_INPUT.parent, CONTROLLED_INPUT])
    payload = _read(CONTROLLED_INPUT, MAX_INPUT_BYTES)
    if hashlib.sha256(payload).hexdigest() != EXPECTED_INPUT_SHA256:
        raise ValueError("CONTROLLED_INPUT_CHANGED")
    return runtime, payload


def run_local(output, *, evaluate=False, expected_input_sha256=None):
    """Inspect by default. Evaluation requires the prior inspection's input hash.

    All destinations are new and external. No HMAC documents are read. Individual
    values exist only in memory, inside the existing scientific pipeline.
    """
    output = Path(output)
    destinations = validate_paths(CONTROLLED_INPUT, output, repository=REPOSITORY, private_root=PRIVATE_ROOT)
    _private_permissions([destinations.output.parent])
    runtime, payload = _load()
    with _offline_scope():
        inspection, data = inspect_bytes(payload)
    if evaluate and (not inspection["computationally_adequate"] or expected_input_sha256 != inspection["input_sha256"]):
        raise ValueError("INSPECTION_NOT_CONFIRMED_OR_INADEQUATE")
    source_hashes = {"training/run_local_optimization_v2.py": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    manifest = dict(version="local-optimization-v2/1", created_utc=datetime.now(timezone.utc).isoformat(),
        input_sha256=inspection["input_sha256"], runtime=runtime, local_source_sha256=source_hashes,
        protocol=asdict(ExperimentProtocol()), os_network_isolated=False, python_socket_guard=True,
        hmac_reviews_required=False, mode="evaluate" if evaluate else "inspect",
        scientific_approval=False, independence_requires_responsible_review=True)
    destinations.output.mkdir(exist_ok=False)
    try:
        _write(destinations.output / "inspection.aggregate.json", inspection)
        if evaluate:
            with _offline_scope():
                report = run_optimization_v2(data, protocol=ExperimentProtocol(), data_origin="real_authorized")
                verification = asdict(verify_optimization_v2(report))
                comparison = compare_predictor_sets(report)
                complete = validate_aggregate_outputs(AggregateOutputs(report, verification, comparison))
            if describe_runtime() != runtime or hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != source_hashes["training/run_local_optimization_v2.py"]:
                raise ValueError("PROVENANCE_CHANGED")
            if hashlib.sha256(_read(CONTROLLED_INPUT, MAX_INPUT_BYTES)).hexdigest() != inspection["input_sha256"]:
                raise ValueError("INPUT_CHANGED")
            for name, value in (("report", report), ("verification", verification), ("comparison", comparison)):
                _write(destinations.output / (name + ".aggregate.json"), value)
            manifest["status"] = "technically_complete" if complete else "incomplete"
        else:
            manifest["status"] = "inspected_no_training"
        manifest["artifact_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                        for p in destinations.output.iterdir() if p.is_file()}
        _write(destinations.output / "manifest.json", manifest)
        _private_permissions([destinations.output, *destinations.output.iterdir()])
        return inspection, manifest["status"]
    except Exception:
        try:
            _write(destinations.output / "failed.json", dict(code="LOCAL_V2_OPERATION_FAILED"))
        except Exception:
            pass
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description="Local v2; aggregate output, no complete OS network isolation")
    parser.add_argument("--output", required=True)
    parser.add_argument("--evaluate", action="store_true")
    parser.add_argument("--expected-input-sha256")
    args = parser.parse_args(argv)
    try:
        inspection, status = run_local(args.output, evaluate=args.evaluate,
            expected_input_sha256=args.expected_input_sha256)
    except Exception:
        print("LOCAL_V2_OPERATION_FAILED", file=sys.stderr)
        return 2
    print(json.dumps(dict(status=status, inspection=inspection), ensure_ascii=False, allow_nan=False))
    return 0 if status != "incomplete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
