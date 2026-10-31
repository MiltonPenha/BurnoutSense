"""Synthetic-only CLI. Real-data execution is deliberately unavailable."""

import argparse
import csv
from dataclasses import asdict
import hashlib
from importlib.metadata import version
import io
import json
from pathlib import Path
import platform
import random
import subprocess
import sys

from training.form_schema import ANALYTICAL_FIELDS, ELIGIBILITY_FIELDS
from training.import_forms import (
    OFFICIAL_ADMINISTRATIVE_HEADERS, import_official_forms_csv, official_header_mapping,
)
from training.optimization_v2 import run_optimization_v2
from training.optimization_v2_validation import verify_optimization_v2
from training.regression_preprocessing import prepare_regression_data


REPOSITORY = Path(__file__).resolve().parents[2]
SYNTHETIC_GENERATOR_SEED = 42
SYNTHETIC_GENERATOR_VERSION = "independent-esbeu-items/2"
CODE_FILES = (
    "training/run_optimization_v2.py", "training/optimization_v2.py",
    "training/optimization_v2_validation.py", "training/import_forms.py",
    "training/form_schema.py", "training/esbeu_scoring.py",
    "training/regression_preprocessing.py", "training/regression_models.py",
    "training/regression_experiments.py", "training/regression_evaluation.py",
)


class RunnerError(ValueError):
    """Fixed technical error code; never include paths or cell contents."""


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise RunnerError("INVALID_ARGUMENTS")


def synthetic_csv_bytes(count=30):
    """Generate only fictitious, eligible responses in the official 41-column format."""
    if type(count) is not int or not 30 <= count <= 100:
        raise RunnerError("INVALID_SYNTHETIC_COUNT")
    mapping = official_header_mapping()
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow([*OFFICIAL_ADMINISTRATIVE_HEADERS, *mapping])
    # Isolated stream: targets do not use context, row modulo or global RNG state.
    item_rng = random.Random(SYNTHETIC_GENERATOR_SEED)
    for i in range(count):
        record = {}
        for field in ANALYTICAL_FIELDS:
            if field.choices:
                value = field.choices[i % len(field.choices)]
            else:
                value = field.minimum
            if field.group == "esbeu":
                value = item_rng.randint(0, 4)
                value = f"{value} — {field.labels[value]}"
            record[field.identifier] = value
        for field in ELIGIBILITY_FIELDS:
            record[field.identifier] = field.choices[0]
        record["sleep_hours"] = str(4 + (i % 6) / 2).replace(".", ",")
        record["work_hours_week"] = (0 if record["employment"] == "Não, apenas estudo"
                                      else 10 + i % 20)
        if record["employment"] == "Não, apenas estudo":
            record["study_work_difficulty"] = "Não se aplica"
        writer.writerow(["SYNTHETIC_ONLY", "SYNTHETIC_ONLY",
                         *(record[key] for key in mapping.values())])
    return stream.getvalue().encode("utf-8-sig")


def _provenance():
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=REPOSITORY, stderr=subprocess.DEVNULL,
        text=True).strip()
    if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise RunnerError("GIT_PROVENANCE_UNAVAILABLE")
    dirty = bool(subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=REPOSITORY, stderr=subprocess.DEVNULL))
    return {
        "git_commit": commit, "working_tree_dirty": dirty,
        "source_sha256": {name: hashlib.sha256((REPOSITORY / "ai-service" / name).read_bytes()).hexdigest()
                          for name in CODE_FILES},
        "python": platform.python_version(),
        "libraries": {name: version(name) for name in (
            "numpy", "pandas", "scikit-learn", "joblib", "fastapi", "uvicorn", "httpx")},
    }


def _destinations(input_path, output_dir):
    raw_input, raw_output = Path(input_path), Path(output_dir)
    if raw_input.is_symlink() or raw_output.is_symlink():
        raise RunnerError("SYMLINK_DESTINATION_REJECTED")
    source, output = raw_input.resolve(), raw_output.resolve()
    if any(path == REPOSITORY or path.is_relative_to(REPOSITORY) for path in (source, output)):
        raise RunnerError("DESTINATIONS_MUST_BE_OUTSIDE_REPOSITORY")
    if source.exists() or output.exists():
        raise RunnerError("DESTINATION_ALREADY_EXISTS")
    if source == output or source.is_relative_to(output) or output.is_relative_to(source):
        raise RunnerError("DESTINATIONS_MUST_BE_SEPARATE")
    if not source.parent.is_dir() or not output.parent.is_dir():
        raise RunnerError("DESTINATION_PARENT_MISSING")
    return source, output


def _write_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)


def run_synthetic_demo(input_path, output_dir, *, synthetic_demo=False, records=30):
    """Only generates a NEW synthetic input; never opens caller-supplied input.

    The pipeline imports an in-memory copy of generated bytes. Even replacement
    of the newly written file cannot make this executor read an existing CSV.
    Both destination parents must already exist, outside the checkout.
    """
    if synthetic_demo is not True:
        raise RunnerError("REAL_DATA_EXECUTION_DISABLED")
    source, output = _destinations(input_path, output_dir)
    payload = synthetic_csv_bytes(records)
    provenance = _provenance()
    output.mkdir(exist_ok=False)
    # Exclusive creation is the final race-safe overwrite check.
    with source.open("xb") as stream:
        stream.write(payload)
    imported = import_official_forms_csv(io.StringIO(payload.decode("utf-8-sig")))
    counts = {"rows_read": imported.rows_read, "eligible": imported.eligible_count,
              "ineligible": imported.ineligible_count, "rejected": imported.rejected_count}
    if counts != {"rows_read": records, "eligible": records, "ineligible": 0, "rejected": 0}:
        raise RunnerError("SYNTHETIC_IMPORT_FAILED")
    data = prepare_regression_data(imported.records)
    report = run_optimization_v2(data, data_origin="synthetic")
    verification = verify_optimization_v2(report)
    manifest = {
        "executor": "optimization-v2-synthetic-only/1", "data_origin": "synthetic",
        "real_data_enabled": False, "scientific_result": False,
        "synthetic_generator": {"version": SYNTHETIC_GENERATOR_VERSION,
                                "seed": SYNTHETIC_GENERATOR_SEED,
                                "strategy": "uniform_integer_0_4_independent_of_context"},
        "input_sha256": hashlib.sha256(payload).hexdigest(), "counts": counts,
        "protocol": report["protocol"], "candidates": report["candidates"],
        "status": "technically_complete" if verification.complete else "incomplete",
        **provenance,
    }
    _write_json(output / "report.aggregate.json", report)
    _write_json(output / "verification.json", asdict(verification))
    _write_json(output / "manifest.json", manifest)
    return verification


def main(argv=None):
    parser = SafeArgumentParser(description="BurnoutSense v2: synthetic demo ONLY; real data disabled.")
    parser.add_argument("--synthetic-demo", action="store_true")
    parser.add_argument("--input", required=True, help="New synthetic CSV destination outside repository")
    parser.add_argument("--output", required=True, help="New report directory outside repository")
    parser.add_argument("--records", type=int, default=30)
    try:
        args = parser.parse_args(argv)
        result = run_synthetic_demo(args.input, args.output,
                                    synthetic_demo=args.synthetic_demo, records=args.records)
    except RunnerError as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception:
        print("SYNTHETIC_EXECUTION_FAILED", file=sys.stderr)
        return 2
    print("SYNTHETIC_DEMO_COMPLETE" if result.complete else "SYNTHETIC_DEMO_INCOMPLETE")
    return 0 if result.complete else 2


if __name__ == "__main__":
    raise SystemExit(main())
