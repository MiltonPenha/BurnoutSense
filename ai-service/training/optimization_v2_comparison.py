"""Read-only, fold-aggregate contrasts; no fitting, file access or selection."""

from dataclasses import asdict
from math import isfinite

from training.optimization_v2 import FAMILIES, PREDICTOR_SETS, aggregate
from training.optimization_v2_validation import verify_optimization_v2


CONTRASTS = (("B", "A"), ("C", "A"), ("C", "B"))


def _number(value):
    return type(value) in (int, float) and isfinite(value)


def _index(folds, expected, n, outer, subset, family):
    indexed = {}
    for fold in folds:
        key = (fold["repeat"], fold["fold"])
        if (any(type(v) is not int for v in key) or key not in expected
                or key in indexed):
            raise ValueError()
        candidate = fold["candidate"]
        if candidate is not None and (candidate["subset"] != subset
                                     or candidate["model"]["name"] != family):
            raise ValueError()
        # Failed searches may have no sizes; successful outer folds always do.
        if "train_size" in fold or "test_size" in fold or fold["failure"] is None:
            test = n // outer + (key[1] <= n % outer)
            if (type(fold["test_size"]) is not int or type(fold["train_size"]) is not int
                    or fold["test_size"] != test or fold["train_size"] != n - test):
                raise ValueError()
        indexed[key] = fold
    return indexed


def _status(fold):
    if fold is None:
        return "missing_fold"
    if fold["failure"] is not None:
        return "failed_fold"
    if fold["candidate"] is None:
        return "missing_candidate"
    metrics = fold.get("metrics")
    if (not isinstance(metrics, dict)
            or any(not _number(metrics.get(k)) or metrics[k] < 0 for k in ("mae", "rmse"))
            or metrics["rmse"] + 1e-12 < metrics["mae"]):
        return "invalid_metrics"
    return "valid"


def _summarize(pairs, metric):
    values = [p[metric] for p in pairs if p["status"] == "valid"]
    return {
        "difference": asdict(aggregate(values, len(pairs), len(pairs) - len(values))),
        "wins": sum(v < 0 for v in values),
        "ties": sum(v == 0 for v in values),
        "losses": sum(v > 0 for v in values),
    }


def compare_predictor_sets(report):
    """Analyze B-A, C-A, C-B separately in each family in ONE v2 report.

    Negative means lower error for the LEFT (minuend) subset: B-A < 0 favors B.
    Missing/failed/invalid pairs remain explicit. Incompatible fold identities,
    partition sizes or group labels raise a sanitized ValueError. Partition
    membership cannot be proven from aggregates; provenance of one unchanged
    run remains the caller's responsibility. Does not authorize real execution.
    """
    try:
        return _compare(report)
    except (KeyError, TypeError, ValueError, IndexError, AttributeError, OverflowError):
        pass
    raise ValueError("Relatório v2 incompatível para comparação pareada.")


def _compare(report):
    protocol = report["protocol"]
    outer, repeats, n = protocol["outer_splits"], protocol["outer_repeats"], report["n_samples"]
    if (report["version"] != "ml-optimization-v2"
            or any(type(v) is not int for v in (outer, repeats, n))
            or outer < 2 or repeats < 1 or n // outer < 2
            or {k: tuple(v) for k, v in report["predictor_sets"].items()} != dict(PREDICTOR_SETS)):
        raise ValueError()
    expected = [(r, f) for r in range(1, repeats + 1) for f in range(1, outer + 1)]
    labels = {f"{s}/{m}" for s in PREDICTOR_SETS for m in FAMILIES}
    if not isinstance(report["comparisons"], dict) or not set(report["comparisons"]) <= labels:
        raise ValueError()
    groups = {
        (s, m): _index(report["comparisons"].get(f"{s}/{m}", {"folds": []})["folds"],
                      expected, n, outer, s, m)
        for s in PREDICTOR_SETS for m in FAMILIES
    }
    verification = verify_optimization_v2(report)
    contrasts = {}
    for family in FAMILIES:
        contrasts[family] = {}
        for left, right in CONTRASTS:
            pairs = []
            for repeat, number in expected:
                a, b = groups[left, family].get((repeat, number)), groups[right, family].get((repeat, number))
                statuses = {"left": _status(a), "right": _status(b)}
                valid = all(s == "valid" for s in statuses.values())
                deltas = {k: a["metrics"][k] - b["metrics"][k] if valid else None
                          for k in ("mae", "rmse")}
                if valid and not all(_number(v) for v in deltas.values()):
                    raise ValueError()
                pairs.append({"repeat": repeat, "fold": number,
                              "status": "valid" if valid else "unavailable",
                              "diagnostics": statuses, **deltas})
            count = sum(p["status"] == "valid" for p in pairs)
            contrasts[family][f"{left}-{right}"] = {
                "left": left, "right": right, "expected_pairs": len(expected),
                "valid_pairs": count, "missing_pairs": len(expected) - count,
                "complete": count == len(expected), "folds": pairs,
                "mae": _summarize(pairs, "mae"), "rmse": _summarize(pairs, "rmse"),
                "by_repeat": [{
                    "repeat": r,
                    **{k: _summarize([p for p in pairs if p["repeat"] == r], k)
                       for k in ("mae", "rmse")},
                } for r in range(1, repeats + 1)],
            }
    return {
        "version": "ml-optimization-v2-contrasts/1",
        "sign": "left_minus_right; negative_favors_left; exact_zero_is_tie",
        "source_verification": asdict(verification),
        "complete": verification.complete and all(c["complete"] for f in contrasts.values() for c in f.values()),
        "requires_human_review": True, "contrasts": contrasts,
    }
