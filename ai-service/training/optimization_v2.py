"""Exploratory post-v1 nested selection; never loads data or persists a model."""

from collections import Counter
from dataclasses import asdict, dataclass
from statistics import mean, stdev
from types import MappingProxyType
from importlib.metadata import version
import json
import warnings

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.exceptions import ConvergenceWarning
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline

from training.regression_evaluation import MetricAggregate, calculate_regression_metrics
from training.regression_experiments import Candidate, ExperimentProtocol
from training.regression_models import build_regression_pipeline
from training.regression_preprocessing import (
    ALLOWED_PREDICTORS, ContextFrameValidator, validate_predictors,
)


_B = ("sleep_hours", "sleep_quality", "mandatory_hours_week", "independent_hours_week",
      "subject_overload", "assessment_pressure", "extraclass_overload",
      "study_rest_difficulty", "study_work_difficulty", "personal_support",
      "academic_support", "financial_concern")
_C = ("sleep_hours", "sleep_quality", "subject_overload", "assessment_pressure",
      "study_rest_difficulty", "personal_support", "financial_concern")
PREDICTOR_SETS = MappingProxyType({
    name: tuple(key for key in ALLOWED_PREDICTORS if key in requested)
    for name, requested in (("A", ALLOWED_PREDICTORS), ("B", _B), ("C", _C))
})
FAMILIES = ("dummy", "ridge", "random_forest", "svr")


@dataclass(frozen=True)
class V2Candidate:
    subset: str
    model: Candidate


def default_candidates():
    """Seven identical configurations per subset (21 total), fixed before data."""
    models = (Candidate("dummy"),
              Candidate("ridge", (("alpha", 1.0),)),
              Candidate("ridge", (("alpha", 10.0),)),
              Candidate("random_forest", (("max_depth", 2), ("min_samples_leaf", 3))),
              Candidate("random_forest", (("max_depth", 3), ("min_samples_leaf", 3))),
              Candidate("svr", (("C", 0.1), ("kernel", "rbf"))),
              Candidate("svr", (("C", 1.0), ("kernel", "rbf"))))
    return tuple(V2Candidate(subset, model) for subset in PREDICTOR_SETS for model in models)


class SelectContext(TransformerMixin, BaseEstimator):
    """Deterministic allowlisted selection, inside every fitted pipeline."""

    def __init__(self, predictors):
        self.predictors = predictors

    def fit(self, X, y=None):
        self.transform(X)
        return self

    def transform(self, X):
        selected = validate_predictors(self.predictors)
        return X.loc[:, list(selected)].copy(deep=True)


def build_candidate(candidate, seed=42):
    predictors = PREDICTOR_SETS[candidate.subset]
    return Pipeline([
        ("select", SelectContext(predictors)),
        ("model", build_regression_pipeline(candidate.model.name, predictors,
                                           random_state=seed,
                                           model_params=dict(candidate.model.parameters))),
    ])


def _trial(candidate, X, y, train, test, seed):
    """Fresh pipeline each time; sanitize failures/warnings without payloads."""
    metrics, failure = None, "fit_failed"
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            model = build_candidate(candidate, seed)
            model.fit(X.iloc[train].copy(deep=True), y.iloc[train].copy(deep=True))
            failure = "predict_or_metrics_failed"
            prediction = model.predict(X.iloc[test].copy(deep=True))
            metrics = calculate_regression_metrics(y.iloc[test].to_numpy(), prediction)
            failure = None
        except Exception:
            pass  # Report a fixed code, never an estimator exception or prediction.
    codes = tuple(sorted({"convergence_warning" if issubclass(w.category, ConvergenceWarning)
                          else "model_warning" for w in caught}))
    if "convergence_warning" in codes:
        metrics, failure = None, "not_converged"
    return metrics, failure, codes


def aggregate(values, total, failed=0):
    valid = [float(value) for value in values if value is not None]
    return MetricAggregate(mean(valid) if valid else None,
                           stdev(valid) if len(valid) > 1 else None,
                           len(valid), total - failed - len(valid), failed)


def _summary(folds):
    failed = sum(fold["failure"] is not None for fold in folds)
    return {key: asdict(aggregate(
        [fold["metrics"][key] for fold in folds if fold["metrics"] is not None],
        len(folds), failed)) for key in ("mae", "rmse", "r2")}


def _tune(grid, X, y, partitions, seed):
    scores = []
    for candidate in grid:
        trials = [_trial(candidate, X, y, train, test, seed) for train, test in partitions]
        failed = sum(failure is not None for _, failure, _ in trials)
        scores.append({
            "candidate": asdict(candidate), "failed_folds": failed,
            "mae": None if failed else mean(m.mae for m, _, _ in trials),
            "rmse": None if failed else mean(m.rmse for m, _, _ in trials),
            "failure_codes": sorted({f for _, f, _ in trials if f}),
            "warning_codes": sorted({code for _, _, codes in trials for code in codes}),
        })
    return scores


def _rank(index, scores, grid):
    candidate = grid[index]
    return (scores[index]["mae"], scores[index]["rmse"],
            len(PREDICTOR_SETS[candidate.subset]), FAMILIES.index(candidate.model.name), index)


def paired_comparison(folds, baselines):
    """MAE(candidate) minus MAE(Dummy) on identical outer partitions."""
    if (len(folds) != len(baselines) or any(
        (f["repeat"], f["fold"]) != (b["repeat"], b["fold"])
        for f, b in zip(folds, baselines)
    )):
        raise ValueError("Comparação exige os mesmos folds externos.")
    deltas = [fold["metrics"]["mae"] - base["metrics"]["mae"]
              for fold, base in zip(folds, baselines, strict=True)
              if fold["metrics"] is not None and base["metrics"] is not None]
    return {"mae_difference": asdict(aggregate(deltas, len(folds), len(folds) - len(deltas))),
            "wins": sum(value < 0 for value in deltas), "ties": sum(value == 0 for value in deltas),
            "losses": sum(value > 0 for value in deltas)}


def run_optimization_v2(data, *, protocol=ExperimentProtocol(), candidates=None,
                        data_origin="synthetic"):
    """Return ONLY aggregate/fold-level diagnostics, no individual predictions.

    Real-data callers require prior local authorization, independent-row checks,
    and private input/output paths. No final fit, model export or v1 mutation.
    """
    grid = tuple(default_candidates() if candidates is None else candidates)
    try:
        if data_origin not in ("synthetic", "real_authorized"):
            raise ValueError()
        if (tuple(data.X.columns) != ALLOWED_PREDICTORS or data.predictors != ALLOWED_PREDICTORS
                or not data.X.index.equals(data.y.index) or data.y.dtype.kind not in "iuf"
                or not np.isfinite(data.y.to_numpy()).all()
                or ((data.y < 0) | (data.y > 4)).any()):
            raise ValueError()
        ContextFrameValidator(ALLOWED_PREDICTORS).transform(data.X)
        for predictors in PREDICTOR_SETS.values():
            validate_predictors(predictors)
        if any(type(v) is not int for v in (protocol.outer_splits, protocol.inner_splits,
                                           protocol.outer_repeats, protocol.random_state)):
            raise ValueError()
        if (min(protocol.outer_splits, protocol.inner_splits) < 2 or protocol.outer_repeats < 1
                or not 0 <= protocol.random_state < 2**32):
            raise ValueError()
        n = len(data.y)
        if (n // protocol.outer_splits < 2
                or (n - int(np.ceil(n / protocol.outer_splits))) // protocol.inner_splits < 2):
            raise ValueError()
        if not grid or len(grid) > 60 or len(set(grid)) != len(grid):
            raise ValueError()
        catalogs = []
        for subset in PREDICTOR_SETS:
            catalog = tuple(c.model for c in grid if c.subset == subset)
            if {c.name for c in catalog} != set(FAMILIES):
                raise ValueError()
            catalogs.append(catalog)
        if any(catalog != catalogs[0] for catalog in catalogs):
            raise ValueError()  # Controlled subset comparison requires identical grids.
        if any(c.subset not in PREDICTOR_SETS for c in grid):
            raise ValueError()
        for candidate in grid:
            if len(dict(candidate.model.parameters)) != len(candidate.model.parameters):
                raise ValueError()
            build_candidate(candidate, protocol.random_state)
    except Exception:
        pass
    else:
        return _run(data, protocol, grid, data_origin)
    raise ValueError("Dados ou protocolo v2 inválidos.")


def _run(data, protocol, grid, origin):
    X, y = data.X.copy(deep=True), data.y.copy(deep=True)
    groups = {f"{subset}/{family}": [] for subset in PREDICTOR_SETS for family in FAMILIES}
    selection, audits = [], []
    for repeat in range(protocol.outer_repeats):
        outer = KFold(protocol.outer_splits, shuffle=True,
                      random_state=(protocol.random_state + repeat) % 2**32)
        for number, (train, test) in enumerate(outer.split(X), 1):
            inner = tuple(KFold(protocol.inner_splits, shuffle=True,
                                random_state=(protocol.random_state + 1000
                                              + repeat * protocol.outer_splits + number) % 2**32
                                ).split(X.iloc[train]))
            scores = _tune(grid, X.iloc[train], y.iloc[train], inner, protocol.random_state)
            audits.append({"repeat": repeat + 1, "fold": number, "scores": scores})
            successful = [i for i, score in enumerate(scores) if not score["failed_folds"]]
            # Freeze all choices BEFORE evaluating any outer outcome.
            chosen = min(successful, key=lambda i: _rank(i, scores, grid)) if successful else None
            results = {}
            for label in groups:
                subset, family = label.split("/")
                available = [i for i in successful if grid[i].subset == subset
                             and grid[i].model.name == family]
                best = min(available, key=lambda i: _rank(i, scores, grid)) if available else None
                metrics, failure, codes = (_trial(grid[best], X, y, train, test, protocol.random_state)
                                           if best is not None else (None, "inner_search_failed", ()))
                fold = {"repeat": repeat + 1, "fold": number, "train_size": len(train),
                        "test_size": len(test), "candidate": asdict(grid[best]) if best is not None else None,
                        "metrics": asdict(metrics) if metrics is not None else None,
                        "failure": failure, "warning_codes": codes}
                groups[label].append(fold)
                if best is not None:
                    results[best] = fold
            selection.append(results[chosen] if chosen is not None else {
                "repeat": repeat + 1, "fold": number, "candidate": None,
                "metrics": None, "failure": "inner_search_failed", "warning_codes": ()})
    baselines = groups["A/dummy"]
    frequencies = Counter(json.dumps(f["candidate"], sort_keys=True)
                          for f in selection if f["candidate"] is not None)
    return {
        "version": "ml-optimization-v2", "data_origin": origin,
        "exploratory_post_v1": True, "n_samples": len(y), "protocol": asdict(protocol),
        "runtime": {name: version(name) for name in ("numpy", "pandas", "scikit-learn")},
        "predictor_sets": dict(PREDICTOR_SETS), "candidates": [asdict(c) for c in grid],
        "inner_audit": audits,
        "comparisons": {label: {"folds": folds, "summary": _summary(folds),
                                 "paired_dummy": paired_comparison(folds, baselines)}
                        for label, folds in groups.items()},
        "selection": {"folds": selection, "summary": _summary(selection),
                      "paired_dummy": paired_comparison(selection, baselines)},
        "subset_frequency": {key: sum(f["candidate"] is not None
                                      and f["candidate"]["subset"] == key for f in selection)
                             for key in PREDICTOR_SETS},
        "model_frequency": {key: sum(f["candidate"] is not None
                                     and f["candidate"]["model"]["name"] == key for f in selection)
                            for key in FAMILIES},
        "candidate_frequency": [{"candidate": asdict(c),
                                 "count": frequencies[json.dumps(asdict(c), sort_keys=True)]}
                                for c in grid],
        "failed_selection_folds": sum(f["failure"] is not None for f in selection),
    }
