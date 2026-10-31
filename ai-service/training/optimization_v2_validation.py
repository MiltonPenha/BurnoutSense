"""Read-only integrity checks; technical completeness is not scientific approval."""

from collections import Counter
from dataclasses import asdict, dataclass
import json
from math import isfinite

from training.optimization_v2 import (
    FAMILIES, PREDICTOR_SETS, V2Candidate, _rank, _summary,
    build_candidate, paired_comparison,
)
from training.regression_experiments import Candidate


@dataclass(frozen=True)
class V2Verification:
    complete: bool
    issues: tuple[str, ...]
    requires_human_review: bool = True


def _key(value):
    return json.dumps(value, sort_keys=True, allow_nan=False)


def _number(value):
    return type(value) in (int, float) and isfinite(value)


def verify_optimization_v2(report) -> V2Verification:
    """Verify catalog, folds, inner-only choices, summaries and frequencies.

    Does not mutate/remove diagnostics or authorize real data. A complete report
    still requires human scientific/privacy review. Invalid shapes fail closed.
    Reports contain fold aggregates only; no raw research data are required here.
    """
    issues = set()
    try:
        _verify(report, issues)
    except (KeyError, TypeError, ValueError, IndexError, AttributeError, OverflowError):
        issues.add("malformed_or_nonfinite_report")
    return V2Verification(not issues, tuple(sorted(issues)))


def _verify(report, issues):
    if (report["version"] != "ml-optimization-v2" or report["exploratory_post_v1"] is not True
            or report["data_origin"] not in ("synthetic", "real_authorized")
            or _key(report["predictor_sets"]) != _key(dict(PREDICTOR_SETS))):
        issues.add("invalid_report_identity")
    protocol = report["protocol"]
    outer, inner, repeats, seed = (protocol[k] for k in (
        "outer_splits", "inner_splits", "outer_repeats", "random_state"))
    n = report["n_samples"]
    if (any(type(v) is not int for v in (outer, inner, repeats, seed, n))
            or min(outer, inner) < 2 or repeats < 1 or not 0 <= seed < 2**32
            or n // outer < 2 or (n - (n + outer - 1) // outer) // inner < 2):
        raise ValueError()
    expected = {(r, f) for r in range(1, repeats + 1) for f in range(1, outer + 1)}
    grid = tuple(V2Candidate(c["subset"], Candidate(c["model"]["name"],
                 tuple(tuple(pair) for pair in c["model"]["parameters"])))
                 for c in report["candidates"])
    catalog = [_key(asdict(c)) for c in grid]
    if not grid or len(grid) > 60 or len(set(catalog)) != len(grid):
        raise ValueError()
    for candidate in grid:
        if (candidate.subset not in PREDICTOR_SETS or candidate.model.name not in FAMILIES
                or len(dict(candidate.model.parameters)) != len(candidate.model.parameters)):
            raise ValueError()
        build_candidate(candidate, seed)  # Construction only, never fit.
    catalogs = [tuple(c.model for c in grid if c.subset == subset) for subset in PREDICTOR_SETS]
    if (any(c != catalogs[0] for c in catalogs)
            or {c.name for c in catalogs[0]} != set(FAMILIES)):
        issues.add("inconsistent_candidate_grids")

    def indexed(folds):
        result = {(f["repeat"], f["fold"]): f for f in folds}
        if len(result) != len(folds) or set(result) != expected:
            issues.add("missing_or_duplicate_folds")
        return result

    audits = indexed(report["inner_audit"])
    for audit in audits.values():
        scores = audit["scores"]
        if [_key(s["candidate"]) for s in scores] != catalog:
            issues.add("invalid_inner_candidates")
        for score in scores:
            failed = score["failed_folds"]
            if type(failed) is not int or not 0 <= failed <= inner:
                issues.add("invalid_inner_failure_count")
            if failed:
                issues.add("inner_training_failure")
                if score["mae"] is not None or score["rmse"] is not None or not score["failure_codes"]:
                    issues.add("inconsistent_inner_failure")
            elif (score["failure_codes"] or any(not _number(score[k]) or score[k] < 0
                                               for k in ("mae", "rmse"))):
                issues.add("invalid_inner_metrics")

    labels = {f"{s}/{m}" for s in PREDICTOR_SETS for m in FAMILIES}
    if set(report["comparisons"]) != labels:
        issues.add("incomplete_comparisons")
    baseline = report["comparisons"]["A/dummy"]["folds"]
    baseline_map = indexed(baseline)
    groups = {}
    for label, comparison in report["comparisons"].items():
        groups[label] = indexed(comparison["folds"])
    selection = indexed(report["selection"]["folds"])
    for label, comparison in [*report["comparisons"].items(), ("selection", report["selection"])]:
        folds = comparison["folds"]
        for fold in folds:
            identity = (fold["repeat"], fold["fold"])
            scores = audits[identity]["scores"]
            available = [i for i, s in enumerate(scores) if s["failed_folds"] == 0
                         and (label == "selection"
                              or f"{grid[i].subset}/{grid[i].model.name}" == label)]
            best = min(available, key=lambda i: _rank(i, scores, grid)) if available else None
            if _key(fold["candidate"]) != _key(asdict(grid[best]) if best is not None else None):
                issues.add("candidate_not_selected_by_inner_cv")
            if fold["failure"] is not None:
                issues.add("outer_training_or_evaluation_failure")
                if fold["metrics"] is not None:
                    issues.add("metrics_present_on_failed_fold")
                continue
            expected_test = n // outer + (fold["fold"] <= n % outer)
            if (fold["test_size"] != expected_test or fold["train_size"] != n - expected_test):
                issues.add("invalid_partition_sizes")
            metrics = fold["metrics"]
            if any(not _number(metrics[k]) or metrics[k] < 0 for k in ("mae", "rmse")):
                issues.add("invalid_outer_metrics")
            if metrics["rmse"] + 1e-12 < metrics["mae"]:
                issues.add("inconsistent_outer_metrics")
            r2, reason = metrics["r2"], metrics["r2_undefined_reason"]
            if ((r2 is None and reason not in ("constant_target", "test_size_lt_2"))
                    or (r2 is not None and (not _number(r2) or r2 > 1 or reason is not None))):
                issues.add("invalid_r2_or_reason")
            if label == "selection" and best is not None:
                selected_label = f"{grid[best].subset}/{grid[best].model.name}"
                if _key(fold) != _key(groups[selected_label][identity]):
                    issues.add("selection_comparison_mismatch")
        if _key(comparison["summary"]) != _key(_summary(folds)):
            issues.add("inconsistent_metric_summary")
        bases = [baseline_map[(f["repeat"], f["fold"])] for f in folds]
        if _key(comparison["paired_dummy"]) != _key(paired_comparison(folds, bases)):
            issues.add("inconsistent_paired_baseline")
    folds = list(selection.values())
    subsets = Counter(f["candidate"]["subset"] for f in folds if f["candidate"] is not None)
    models = Counter(f["candidate"]["model"]["name"] for f in folds if f["candidate"] is not None)
    counts = Counter(_key(f["candidate"]) for f in folds if f["candidate"] is not None)
    if (report["subset_frequency"] != {key: subsets[key] for key in PREDICTOR_SETS}
            or report["model_frequency"] != {key: models[key] for key in FAMILIES}
            or report["candidate_frequency"] != [
                {"candidate": c, "count": counts[_key(c)]} for c in report["candidates"]]
            or report["failed_selection_folds"] != sum(f["failure"] is not None for f in folds)):
        issues.add("inconsistent_selection_frequencies")
