"""Final internal-validation audit; aggregate-only, with no change to training.

Dataset versioning does not turn internal CV into external validation. New
responses require a new recorded dataset version and a separately recorded run.
No individual rows, labels, predictions or model parameters learned from people
are exposed by these summaries. Source fingerprints belong in private metadata.
"""

from collections import Counter
import csv
from dataclasses import dataclass
import math
from pathlib import Path

import numpy as np

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ANALYTICAL_FIELDS, CONTEXT_FIELDS, ELIGIBILITY_FIELDS
from training.import_forms import import_official_forms_csv, official_header_mapping
from training.regression_inference import file_sha256
from training.regression_models import MODEL_NAMES
from training.regression_preprocessing import ALLOWED_PREDICTORS
from training.research_audit import ResearchAudit, audit_import


class FinalizationError(ValueError):
    """Sanitized final-audit or result-consistency failure."""


@dataclass(frozen=True)
class MissingnessSummary:
    positive_eligibility_rows_audited: int
    rows_skipped_for_eligibility: int
    structurally_invalid_rows: int
    rows_with_missing_analytical_cells: int
    missing_analytical_cells: int
    missing_by_field: tuple[tuple[str, int], ...]


@dataclass(frozen=True)
class FiniteCategoryCoverage:
    field: str
    schema_levels: int
    observed_levels: int
    absent_schema_levels: int
    observed_levels_below_five: int


@dataclass(frozen=True)
class OutcomeDistribution:
    outcome: str
    count: int
    mean: float | None
    std: float | None
    q25: float | None
    median: float | None
    q75: float | None


@dataclass(frozen=True)
class FinalDatasetAudit:
    source_sha256: str
    base: ResearchAudit
    missingness: MissingnessSummary
    finite_category_coverage: tuple[FiniteCategoryCoverage, ...]
    outcome_distributions: tuple[OutcomeDistribution, ...]


def audit_final_dataset(source: Path, predictors=ALLOWED_PREDICTORS) -> FinalDatasetAudit:
    """Read locally, retaining only aggregates and a private source fingerprint.

    The approved importer alone determines admission. Raw missing-cell counts
    cover structurally valid rows with all THREE positive eligibility criteria,
    including subsequently rejected rows. Later answers of ineligible/unknown-
    consent rows are not examined. Empty/whitespace cells count as missing; zero
    and 'Não se aplica' do not. Administrative cells are never inspected.
    """
    try:
        path = Path(source)
        before = file_sha256(path)
        imported = import_official_forms_csv(path)
        base = audit_import(imported, predictors)
        missing = dict.fromkeys((field.identifier for field in ANALYTICAL_FIELDS), 0)
        audited = skipped = structural = missing_rows = 0
        mapping = official_header_mapping()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, strict=True)
            headers = next(reader)
            positions = {identifier: headers.index(header) for header, identifier in mapping.items()}
            for row in reader:
                if len(row) != len(headers):
                    structural += 1
                    continue
                if not all(row[positions[f.identifier]] == f.choices[0] for f in ELIGIBILITY_FIELDS):
                    skipped += 1
                    continue
                audited += 1
                missing_fields = [key for key, index in positions.items() if not row[index].strip()]
                missing_rows += bool(missing_fields)
                for key in missing_fields:
                    missing[key] += 1
        if audited + skipped + structural != imported.rows_read:
            raise ValueError()
        coverage = []
        for field in CONTEXT_FIELDS:
            if not field.choices:
                continue
            counts = Counter(record[field.identifier] for record in imported.records)
            levels = len(field.choices) + int(field.allows_not_applicable)
            coverage.append(FiniteCategoryCoverage(field.identifier, levels, len(counts),
                                                    levels - len(counts),
                                                    sum(count < 5 for count in counts.values())))
        scores = [calculate_esbeu_scores(record) for record in imported.records]
        distributions = []
        for attribute in ("overall", "emotional_physical_exhaustion", "distancing", "training_inefficacy"):
            values = np.asarray([getattr(score, attribute) for score in scores], dtype=float)
            quantiles = np.quantile(values, [0.25, 0.5, 0.75], method="linear") if len(values) else [None] * 3
            distributions.append(OutcomeDistribution(
                attribute, len(values), float(values.mean()) if len(values) else None,
                float(values.std(ddof=1)) if len(values) > 1 else None,
                *(float(value) if value is not None else None for value in quantiles),
            ))
        if file_sha256(path) != before:
            raise ValueError()
        return FinalDatasetAudit(before, base, MissingnessSummary(
            audited, skipped, structural, missing_rows, sum(missing.values()), tuple(missing.items())),
            tuple(coverage), tuple(distributions))
    except Exception:
        pass
    raise FinalizationError("Auditoria final não concluída; confira integridade e formato da origem.")


def _mean_std(values):
    if not values:
        return None, None
    average = math.fsum(values) / len(values)
    deviation = math.sqrt(math.fsum((value - average) ** 2 for value in values)
                          / (len(values) - 1)) if len(values) > 1 else None
    return average, deviation


def _same_number(left, right):
    if left is None or right is None:
        return left is right
    return (type(left) in (int, float) and type(right) in (int, float)
            and math.isfinite(left) and math.isfinite(right)
            and math.isclose(left, right, rel_tol=1e-12, abs_tol=1e-12))


def verify_final_experiment(report: dict) -> dict:
    """Independently recompute saved aggregates and paired Dummy comparisons.

    This verifies saved fold summaries, not independent people or new test data.
    Per-fold metric formulas and train/test partition identities are separately
    tested by Etapas 5/6/8. No significance test/CI is manufactured from the
    overlapping repeated-CV folds. A complete result from all five families is
    required. The final candidate must obey the original INNER-only rule.
    """
    try:
        return _verify_report(report)
    except Exception:
        pass
    raise FinalizationError("Resultados finais incompletos ou inconsistentes com o protocolo.")


def _verify_report(report):
    protocol = report["protocol"]
    expected = {(repeat, fold) for repeat in range(1, protocol["outer_repeats"] + 1)
                for fold in range(1, protocol["outer_splits"] + 1)}
    if not expected or report["final_refit_failure"] is not None:
        raise ValueError()
    candidate_key = lambda c: (c["name"], tuple(tuple(pair) for pair in c["parameters"]))
    grid = [candidate_key(candidate) for candidate in report["candidates"]]
    if (not grid or len(set(grid)) != len(grid)
            or {name for name, _ in grid} != set(MODEL_NAMES)
            or {candidate_key(s["candidate"]) for s in report["final_inner_scores"]} != set(grid)
            or len(report["final_inner_scores"]) != len(grid)):
        raise ValueError()
    by_name = {}
    summaries = {summary["name"]: summary for summary in report["family_summaries"]}
    if set(summaries) != set(MODEL_NAMES):
        raise ValueError()
    for name in MODEL_NAMES:
        folds = [f for f in report["family_folds"] if f["name"] == name]
        indexed = {(f["repeat"], f["fold"]): f for f in folds}
        if len(folds) != len(expected) or set(indexed) != expected:
            raise ValueError()
        if any(f["failure"] is not None or f["metrics"] is None for f in folds):
            raise ValueError()
        if any(candidate_key(f["candidate"]) not in grid for f in folds):
            raise ValueError()
        by_name[name] = indexed
        _check_summary(summaries[name], folds)
    if len(report["family_folds"]) != len(expected) * len(MODEL_NAMES):
        raise ValueError()
    for key in expected:
        shapes = {(by_name[name][key]["train_size"], by_name[name][key]["test_size"])
                  for name in MODEL_NAMES}
        if (len(shapes) != 1
                or any(type(train) is not int or type(test) is not int or train < 1 or test < 1
                       or train + test != report["n_samples"] for train, test in shapes)):
            raise ValueError()
    selection = report["selection_folds"]
    if (len(selection) != len(expected)
            or {(f["repeat"], f["fold"]) for f in selection} != expected):
        raise ValueError()
    for fold in selection:
        if fold != by_name[fold["name"]][(fold["repeat"], fold["fold"])]:
            raise ValueError()
        inner_values = [by_name[name][(fold["repeat"], fold["fold"])]["inner_mae"] for name in MODEL_NAMES]
        if fold["inner_mae"] > min(inner_values) + 1e-12:
            raise ValueError()
    _check_summary(report["selection_summary"], selection)
    complexity = {"dummy": 0, "linear": 1, "ridge": 2, "svr": 3, "random_forest": 4}
    valid = [s for s in report["final_inner_scores"] if s["failed_folds"] == 0]
    best = min(valid, key=lambda s: (s["mae"], s["rmse"], s["mae_std"],
                                     complexity[s["candidate"]["name"]]))
    if report["final_candidate"] != best["candidate"]:
        raise ValueError()
    paired = []
    for name in MODEL_NAMES[1:]:
        differences = [by_name["dummy"][key]["metrics"]["mae"]
                       - by_name[name][key]["metrics"]["mae"] for key in sorted(expected)]
        average, deviation = _mean_std(differences)
        paired.append({"name": name, "folds": len(differences),
                       "mae_improvement_over_dummy_mean": average,
                       "mae_improvement_over_dummy_std": deviation,
                       "folds_better_than_dummy": sum(value > 1e-12 for value in differences),
                       "folds_equal_to_dummy": sum(abs(value) <= 1e-12 for value in differences),
                       "folds_worse_than_dummy": sum(value < -1e-12 for value in differences)})
    return {"all_aggregates_verified": True, "complete_family_comparison": True,
            "folds_per_family": len(expected), "n_samples": report["n_samples"],
            "inner_selection_rule_verified": True, "final_candidate": report["final_candidate"],
            "paired_dummy_comparisons": paired,
            "scope": "final_internal_validation_for_this_dataset_version",
            "independent_external_validation": False}


def _check_summary(summary, folds):
    for metric in ("mae", "rmse", "r2"):
        values = [fold["metrics"][metric] for fold in folds if fold["metrics"][metric] is not None]
        average, deviation = _mean_std(values)
        aggregate = summary[metric]
        if (not _same_number(aggregate["mean"], average)
                or not _same_number(aggregate["std"], deviation)
                or aggregate["valid_folds"] != len(values)
                or aggregate["undefined_folds"] != len(folds) - len(values)
                or aggregate["failed_folds"] != 0):
            raise ValueError()
