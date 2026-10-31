"""Nested CV, bounded tuning and final refit for authorized contextual research.

No CSV loading, participant logging, file persistence or diagnostic categories.
Outer test outcomes never select hyperparameters or a family. The outer score
of the selection PROCEDURE estimates that procedure; per-family comparisons
are descriptive and must not be presented as an unbiased score of a winner
chosen retrospectively from their outer means. Final tuning/refit uses the
whole authorized dataset only after that nested evaluation.
"""

from dataclasses import dataclass
from statistics import mean, stdev
import warnings

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline

from training.regression_evaluation import (
    MetricAggregate, RegressionMetrics, calculate_regression_metrics,
)
from training.regression_models import MODEL_NAMES, ModelParameter, build_regression_pipeline
from training.regression_preprocessing import (
    ContextFrameValidator, RegressionData, validate_predictors,
)


class ExperimentError(ValueError):
    """Sanitized experimental failure, never a participant payload."""


@dataclass(frozen=True)
class Candidate:
    name: str
    parameters: tuple[tuple[str, ModelParameter], ...] = ()


@dataclass(frozen=True)
class ExperimentProtocol:
    outer_splits: int = 5
    inner_splits: int = 3
    outer_repeats: int = 3
    random_state: int = 42


@dataclass(frozen=True)
class TuningScore:
    candidate: Candidate
    mae: float | None
    rmse: float | None
    mae_std: float | None
    failed_folds: int = 0
    failure_codes: tuple[str, ...] = ()
    warning_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class OuterModelFold:
    repeat: int
    fold: int
    name: str
    train_size: int
    test_size: int
    candidate: Candidate | None
    inner_mae: float | None
    metrics: RegressionMetrics | None
    failure: str | None
    warning_codes: tuple[str, ...]
    inner_failed_candidates: int = 0


@dataclass(frozen=True)
class ModelSummary:
    name: str
    mae: MetricAggregate
    rmse: MetricAggregate
    r2: MetricAggregate


@dataclass(frozen=True)
class ExperimentReport:
    protocol: ExperimentProtocol
    predictors: tuple[str, ...]
    n_samples: int
    candidates: tuple[Candidate, ...]
    family_folds: tuple[OuterModelFold, ...]
    family_summaries: tuple[ModelSummary, ...]
    selection_folds: tuple[OuterModelFold, ...]
    selection_summary: ModelSummary
    final_inner_scores: tuple[TuningScore, ...]
    final_candidate: Candidate | None
    final_refit_failure: str | None
    final_warning_codes: tuple[str, ...]


@dataclass
class ExperimentOutcome:
    """Private local result; fitted_model must never be logged or published."""

    report: ExperimentReport
    fitted_model: Pipeline | None


def default_candidates() -> tuple[Candidate, ...]:
    """24 predeclared configurations; no data-dependent grid expansion."""
    candidates = [Candidate("dummy"), Candidate("linear")]
    candidates += [Candidate("ridge", (("alpha", alpha),)) for alpha in (0.1, 1.0, 10.0, 100.0)]
    candidates += [Candidate("random_forest", (("max_depth", depth), ("min_samples_leaf", leaf)))
                   for depth in (2, 3) for leaf in (2, 3, 5)]
    candidates += [Candidate("svr", (("C", c), ("epsilon", epsilon), ("kernel", kernel)))
                   for kernel in ("linear", "rbf") for c in (0.1, 1.0, 10.0)
                   for epsilon in (0.1, 0.2)]
    return tuple(candidates)


def _rank(score: TuningScore):
    # Only inner validation influences selection. Exact ties prefer simpler
    # families, then stable predeclared catalog order (Python min is stable).
    complexity = {"dummy": 0, "linear": 1, "ridge": 2, "svr": 3, "random_forest": 4}
    return score.mae, score.rmse, score.mae_std, complexity[score.candidate.name]


def _fit_trial(candidate, X, y, train, test, seed):
    metrics, failure = None, "fit_failed"
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            model = build_regression_pipeline(candidate.name, tuple(X.columns),
                                               random_state=seed, model_params=dict(candidate.parameters))
            model.fit(X.iloc[train].copy(deep=True), y.iloc[train].copy(deep=True))
            failure = "predict_or_metrics_failed"
            metrics = calculate_regression_metrics(y.iloc[test].to_numpy(),
                                                   model.predict(X.iloc[test].copy(deep=True)))
            failure = None
        except Exception:
            pass
    codes = tuple(sorted({"convergence_warning" if issubclass(w.category, ConvergenceWarning)
                          else "model_warning" for w in caught}))
    if "convergence_warning" in codes:
        return None, "not_converged", codes
    return metrics, failure, codes


def _tune(candidates, X, y, partitions, seed):
    scores = []
    for candidate in candidates:
        trials = [_fit_trial(candidate, X, y, train, test, seed) for train, test in partitions]
        failed = sum(failure is not None for _, failure, _ in trials)
        codes = tuple(sorted({code for _, _, codes in trials for code in codes}))
        if failed:
            scores.append(TuningScore(candidate, None, None, None, failed,
                                       tuple(sorted({f for _, f, _ in trials if f is not None})), codes))
            continue  # Never average a candidate over only its successful folds.
        mae = [metrics.mae for metrics, _, _ in trials]
        rmse = [metrics.rmse for metrics, _, _ in trials]
        scores.append(TuningScore(candidate, float(mean(mae)), float(mean(rmse)),
                                   float(stdev(mae)), warning_codes=codes))
    return tuple(scores)


def _summary(name, folds):
    aggregates = []
    for attribute in ("mae", "rmse", "r2"):
        values = [getattr(f.metrics, attribute) for f in folds if f.metrics is not None
                  and getattr(f.metrics, attribute) is not None]
        failed = sum(f.failure is not None for f in folds)
        aggregates.append(MetricAggregate(float(mean(values)) if values else None,
                                          float(stdev(values)) if len(values) >= 2 else None,
                                          len(values), len(folds) - failed - len(values), failed))
    return ModelSummary(name, *aggregates)


def run_nested_experiments(
    data: RegressionData,
    *,
    protocol: ExperimentProtocol = ExperimentProtocol(),
    candidates: tuple[Candidate, ...] | None = None,
) -> ExperimentOutcome:
    """Compare all five families and evaluate an inner-only selection procedure.

    Call only after local ethical/privacy authorization and independent-row
    confirmation. Raw research data remain in this process. Candidate grids,
    predictors, splits and objective must be fixed BEFORE inspecting scores.
    Primary objective: minimum inner mean MAE; secondary RMSE, MAE dispersion,
    then simplicity for exact ties. No claim of a global/clinical optimum.

    All families share outer partitions; all candidates share each inner set.
    Tuning never sees that outer test fold. Final candidate is chosen on an
    inner CV over the full dataset, using exactly the same selection rule.
    Outer comparative results do not steer final tuning. Any outer failure
    blocks final fitting instead of silently dropping a difficult fold.
    """
    try:
        selected = validate_predictors(data.predictors)
        if (not data.X.index.equals(data.y.index) or tuple(data.X.columns) != selected
                or data.X.empty or data.y.dtype.kind not in "iuf"
                or not np.isfinite(data.y.to_numpy()).all()
                or ((data.y < 0) | (data.y > 4)).any()):
            raise ValueError()
        ContextFrameValidator(selected).transform(data.X)  # No learned fit.
        values = (protocol.outer_splits, protocol.inner_splits, protocol.outer_repeats,
                  protocol.random_state)
        if (any(type(value) is not int for value in values)
                or protocol.outer_splits < 2 or protocol.inner_splits < 2
                or protocol.outer_repeats < 1 or not 0 <= protocol.random_state < 2**32):
            raise ValueError()
        minimum_train = len(data.y) - int(np.ceil(len(data.y) / protocol.outer_splits))
        if len(data.y) // protocol.outer_splits < 2 or minimum_train // protocol.inner_splits < 2:
            raise ValueError()
        grid = default_candidates() if candidates is None else tuple(candidates)
        if (not grid or len(set(grid)) != len(grid)
                or {candidate.name for candidate in grid} != set(MODEL_NAMES)
                or any(len(dict(candidate.parameters)) != len(candidate.parameters) for candidate in grid)):
            raise ValueError()
        for candidate in grid:
            build_regression_pipeline(candidate.name, selected, model_params=dict(candidate.parameters))
    except Exception:
        pass
    else:
        return _run_validated(data, protocol, grid)
    raise ExperimentError("Dados ou protocolo experimental inválidos.")


def _run_validated(data, protocol, grid):
    X, y = data.X.copy(deep=True), data.y.copy(deep=True)
    family_folds, selection_folds = [], []
    for repeat in range(protocol.outer_repeats):
        outer_seed = (protocol.random_state + repeat) % 2**32
        outer = tuple(KFold(protocol.outer_splits, shuffle=True, random_state=outer_seed).split(X))
        for number, (train, test) in enumerate(outer, 1):
            inner_seed = (protocol.random_state + 1000 + repeat * protocol.outer_splits + number) % 2**32
            train_X, train_y = X.iloc[train], y.iloc[train]
            inner = tuple(KFold(protocol.inner_splits, shuffle=True, random_state=inner_seed).split(train_X))
            scores = _tune(grid, train_X, train_y, inner, protocol.random_state)
            successful_scores = [score for score in scores if score.failed_folds == 0]
            results = []
            for name in MODEL_NAMES:
                available = [score for score in successful_scores if score.candidate.name == name]
                best = min(available, key=_rank) if available else None
                if best is None:
                    metrics, failure, codes = None, "inner_search_failed", ()
                else:
                    metrics, failure, codes = _fit_trial(best.candidate, X, y, train, test,
                                                        protocol.random_state)
                result = OuterModelFold(repeat + 1, number, name, len(train), len(test),
                                        best.candidate if best else None, best.mae if best else None,
                                        metrics, failure, codes,
                                        sum(s.failed_folds > 0 for s in scores if s.candidate.name == name))
                family_folds.append(result)
                results.append(result)
            if successful_scores:
                selected = min(successful_scores, key=_rank).candidate.name
                selection_folds.append(next(result for result in results if result.name == selected))
            else:
                selection_folds.append(OuterModelFold(repeat + 1, number, "unavailable", len(train),
                                                      len(test), None, None, None,
                                                      "inner_search_failed", ()))
    summaries = tuple(_summary(name, [f for f in family_folds if f.name == name]) for name in MODEL_NAMES)
    procedure = _summary("inner_selection_procedure", selection_folds)
    model, candidate, final_scores, final_codes = None, None, (), ()
    failure = "outer_evaluation_incomplete" if any(f.failure for f in family_folds) else None
    if failure is None:
        full_inner = tuple(KFold(protocol.inner_splits, shuffle=True,
                                  random_state=protocol.random_state).split(X))
        final_scores = _tune(grid, X, y, full_inner, protocol.random_state)
        available = [score for score in final_scores if score.failed_folds == 0]
        if not available:
            failure = "final_search_failed"
        else:
            candidate = min(available, key=_rank).candidate
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                try:
                    model = build_regression_pipeline(candidate.name, data.predictors,
                                                       random_state=protocol.random_state,
                                                       model_params=dict(candidate.parameters))
                    model.fit(X, y)
                except Exception:
                    failure = "final_fit_failed"
            final_codes = tuple(sorted({"convergence_warning" if issubclass(w.category, ConvergenceWarning)
                                       else "model_warning" for w in caught}))
            if "convergence_warning" in final_codes:
                failure = "final_fit_not_converged"
    if failure:
        model = None
    report = ExperimentReport(protocol, data.predictors, len(y), grid, tuple(family_folds), summaries,
                               tuple(selection_folds), procedure, final_scores, candidate, failure,
                               final_codes)
    return ExperimentOutcome(report, model)
