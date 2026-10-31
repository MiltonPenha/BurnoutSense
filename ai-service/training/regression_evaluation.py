"""Reproducible contextual ESB-eu evaluation, separate from legacy classification.

The research dataset consists of real questionnaire responses. This stage is
implemented/tested with artificial fixtures only; its test scores are not
research findings. Authorized real-data execution belongs to later stages.
No files, individual predictions, row identifiers or fitted models are returned,
logged or persisted. This module does not tune, rank or select a model.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from statistics import mean, stdev
from typing import Literal
import warnings

import numpy as np
from numpy.typing import ArrayLike
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline

from training.regression_models import (
    DEFAULT_RANDOM_STATE, MODEL_NAMES, ModelParameter, build_regression_pipeline,
)
from training.regression_preprocessing import (
    ALLOWED_PREDICTORS, ContextFrameValidator, validate_predictors,
)


R2UndefinedReason = Literal["test_size_lt_2", "constant_target"]
FoldFailure = Literal["clone_failed", "fit_failed", "predict_failed", "metrics_failed"]


class RegressionEvaluationError(ValueError):
    """Sanitized input/configuration error, without response or exception payloads."""


@dataclass(frozen=True)
class RegressionMetrics:
    mae: float
    rmse: float
    r2: float | None
    r2_undefined_reason: R2UndefinedReason | None = None


@dataclass(frozen=True)
class MetricAggregate:
    """Unweighted fold mean and SAMPLE std (ddof=1), not a confidence interval.

    None mean means no valid folds; None std means fewer than two valid folds.
    Undefined successful folds and failed model folds are counted separately.
    """

    mean: float | None
    std: float | None
    valid_folds: int
    undefined_folds: int
    failed_folds: int


@dataclass(frozen=True)
class FoldEvaluation:
    fold: int
    train_size: int
    test_size: int
    metrics: RegressionMetrics | None
    failure: FoldFailure | None
    warning_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModelEvaluation:
    name: str
    folds: tuple[FoldEvaluation, ...]
    mae: MetricAggregate
    rmse: MetricAggregate
    r2: MetricAggregate
    parameters: tuple[tuple[str, ModelParameter], ...]

    @property
    def successful_folds(self) -> int:
        return sum(fold.failure is None for fold in self.folds)

    @property
    def failed_folds(self) -> int:
        return len(self.folds) - self.successful_folds


@dataclass(frozen=True)
class EvaluationProtocol:
    n_samples: int
    n_splits: int
    shuffle: bool
    split_random_state: int | None


@dataclass(frozen=True)
class RegressionEvaluation:
    protocol: EvaluationProtocol
    predictors: tuple[str, ...]
    models: tuple[ModelEvaluation, ...]


def _numeric_vector(values: ArrayLike) -> np.ndarray:
    try:
        array = np.asarray(values)
        if (array.ndim == 1 and array.size > 0 and array.dtype.kind in "iuf"
                and np.isfinite(array).all()):
            return array.astype(float, copy=True)
    except (TypeError, ValueError, OverflowError):
        pass
    raise RegressionEvaluationError("Esperado vetor numérico finito, unidimensional e não vazio.")


def calculate_regression_metrics(y_true: ArrayLike, y_pred: ArrayLike) -> RegressionMetrics:
    """MAE/RMSE in ESB-eu units and R² on raw, unclipped predictions.

    Observed targets must lie in 0-4. Negative R² is valid and is retained.
    R² is None for fewer than two test observations or a constant test target,
    including perfect predictions on a constant target. No force_finite repair
    to 0/1 is used. Nonfinite/overflowing metrics are explicit errors.
    """
    observed, predicted = _numeric_vector(y_true), _numeric_vector(y_pred)
    if observed.shape != predicted.shape or np.any((observed < 0) | (observed > 4)):
        raise RegressionEvaluationError("Alvo/predição incompatíveis com a avaliação ESB-eu.")
    reason: R2UndefinedReason | None = None
    if len(observed) < 2:
        reason = "test_size_lt_2"
    elif np.all(observed == observed[0]):
        reason = "constant_target"
    try:
        with np.errstate(over="raise", invalid="raise", divide="raise"):
            mae = float(mean_absolute_error(observed, predicted))
            rmse = float(root_mean_squared_error(observed, predicted))
            r2 = None if reason else float(r2_score(observed, predicted, force_finite=False))
        if np.isfinite(mae) and np.isfinite(rmse) and (r2 is None or np.isfinite(r2)):
            return RegressionMetrics(mae, rmse, r2, reason)
    except (TypeError, ValueError, FloatingPointError, OverflowError):
        pass
    raise RegressionEvaluationError("Não foi possível calcular métricas finitas.")


def _validate_data(X: pd.DataFrame, y: pd.Series, predictors: tuple[str, ...]) -> np.ndarray:
    if (not isinstance(X, pd.DataFrame) or not isinstance(y, pd.Series)
            or not X.index.equals(y.index) or len(X) != len(y)):
        raise RegressionEvaluationError("X/y devem ter linhas e índices alinhados.")
    target = _numeric_vector(y.to_numpy())
    if len(target) < 2 or np.any((target < 0) | (target > 4)):
        raise RegressionEvaluationError("Exigidos ao menos dois alvos ESB-eu válidos.")
    try:
        # Schema-only validation/conversion, without fit or learned statistics.
        ContextFrameValidator(predictors).transform(X)
    except (TypeError, ValueError, KeyError):
        pass
    else:
        return target
    raise RegressionEvaluationError("Entradas contextuais inválidas.")


def _validated_templates(
    models: Mapping[str, Pipeline] | None, predictors: tuple[str, ...], random_state: int,
) -> tuple[tuple[str, Pipeline], ...]:
    if models is None:
        return tuple((name, build_regression_pipeline(name, predictors, random_state=random_state))
                     for name in MODEL_NAMES)
    if (not isinstance(models, Mapping) or not models or "dummy" not in models
            or any(type(name) is not str or name not in MODEL_NAMES for name in models)):
        raise RegressionEvaluationError("Catálogo deve incluir o baseline dummy e nomes oficiais.")
    templates = []
    for name in MODEL_NAMES:
        if name not in models:
            continue
        model = models[name]
        try:
            if (not isinstance(model, Pipeline)
                    or list(model.named_steps) != ["preprocess", "regressor"]
                    or model.memory is not None or model.verbose):
                raise ValueError()
            pre = model.named_steps["preprocess"]
            if (not isinstance(pre, Pipeline) or pre.memory is not None or pre.verbose
                    or list(pre.named_steps) != ["validate", "columns"]
                    or not isinstance(pre.named_steps["validate"], ContextFrameValidator)
                    or tuple(pre.named_steps["validate"].predictors) != predictors
                    or not isinstance(pre.named_steps["columns"], ColumnTransformer)
                    or pre.named_steps["columns"].verbose):
                raise ValueError()
            estimator = model.named_steps["regressor"]
            reference = build_regression_pipeline(name, predictors)
            expected_type = type(reference.named_steps["regressor"])
            if type(estimator) is not expected_type:
                raise ValueError()
            # Keep the preprocessing contract identical to Etapa 5; supplied
            # pipelines may configure regressors, not silently change encoding.
            columns = pre.named_steps["columns"]
            expected_columns = reference.named_steps["preprocess"].named_steps["columns"]
            settings = columns.get_params(deep=False)
            expected_settings = expected_columns.get_params(deep=False)
            transformers = settings.pop("transformers")
            expected_transformers = expected_settings.pop("transformers")
            if settings != expected_settings or len(transformers) != len(expected_transformers):
                raise ValueError()
            for (label, transformer, keys), (expected_label, expected_transformer, expected_keys) in zip(
                transformers, expected_transformers,
            ):
                if (label != expected_label or tuple(keys) != tuple(expected_keys)
                        or type(transformer) is not type(expected_transformer)
                        or transformer.get_params(deep=False)
                        != expected_transformer.get_params(deep=False)):
                    raise ValueError()
            if name == "dummy" and (not isinstance(estimator, DummyRegressor)
                                     or estimator.strategy != "mean"):
                raise ValueError()
            params = estimator.get_params(deep=False)
            seed = params.get("random_state", random_state)
            if (type(seed) is not int or not 0 <= seed < 2**32 or params.get("verbose", 0)
                    or params.get("n_jobs") == 0
                    or any(type(value) not in (str, int, float, bool, type(None))
                           or (type(value) is float and not np.isfinite(value))
                           for value in params.values())):
                raise ValueError()
            if name == "svr" and params["kernel"] not in ("linear", "poly", "rbf", "sigmoid"):
                raise ValueError()
            estimator._validate_params()
            # A fitted caller pipeline is accepted, but its state is discarded.
            templates.append((name, clone(model)))
        except Exception:
            pass
        else:
            continue
        raise RegressionEvaluationError("Pipeline de avaliação inválido; use o contrato da Etapa 5.")
    return tuple(templates)


def _evaluate_fold(
    template: Pipeline, X: pd.DataFrame, y: np.ndarray,
    train: np.ndarray, test: np.ndarray, fold_number: int,
) -> FoldEvaluation:
    metrics = None
    failure: FoldFailure | None = "clone_failed"
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            pipeline = clone(template)
            failure = "fit_failed"
            pipeline.fit(X.iloc[train].copy(deep=True), y[train].copy())
            failure = "predict_failed"
            prediction = pipeline.predict(X.iloc[test].copy(deep=True))
            failure = "metrics_failed"
            metrics = calculate_regression_metrics(y[test], prediction)
            failure = None
        except Exception:
            # No raw warning/error message, traceback, payload or exception object
            # crosses the result boundary. Interrupts (BaseException) propagate.
            pass
    warning_codes = tuple(sorted({
        "convergence_warning" if issubclass(item.category, ConvergenceWarning)
        else "model_warning" for item in caught
    }))
    return FoldEvaluation(fold_number, len(train), len(test), metrics, failure, warning_codes)


def _aggregate(folds: tuple[FoldEvaluation, ...], metric: str) -> MetricAggregate:
    values = [getattr(fold.metrics, metric) for fold in folds if fold.metrics is not None
              and getattr(fold.metrics, metric) is not None]
    failed = sum(fold.failure is not None for fold in folds)
    return MetricAggregate(
        float(mean(values)) if values else None,
        float(stdev(values)) if len(values) >= 2 else None,
        len(values), len(folds) - failed - len(values), failed,
    )


def evaluate_regression_models(
    X: pd.DataFrame,
    y: pd.Series,
    *,
    predictors: Sequence[str] = ALLOWED_PREDICTORS,
    models: Mapping[str, Pipeline] | None = None,
    n_splits: int = 5,
    shuffle: bool = True,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> RegressionEvaluation:
    """Evaluate full pipelines on one shared, materialized KFold partition set.

    Pass aligned X/y from prepare_regression_data. Defaults construct all five
    Etapa 5 pipelines; an optional trusted developer mapping may supply tuned
    clones/subsets with official names and MUST include the mean Dummy baseline.
    Supplied pipelines must retain the canonical Etapa 5 preprocessing; only
    scalar regressor configuration is accepted and reported.
    This function performs no parameter search or final-model refit. Compare a
    fixed configuration; later tuning needs nested CV or an explicit limitation.

    Each model/fold receives a fresh clone and private train/test copies. Caller
    pipelines, X and y are preserved. No preprocessing is fitted on total X.
    n_splits must be 2..n_samples; it is never silently reduced. A singleton test
    fold still has MAE/RMSE, but no R². shuffle=False uses input order and records
    split_random_state=None; configured estimator seeds remain independent.

    Fold means are unweighted, not pooled out-of-fold metrics; std is sample
    dispersion, not a standard error or confidence interval. Failed/undefined
    folds are counted explicitly, never converted to zero or hidden with nanmean.
    Partial means must not be treated as a fair comparison against a complete
    model. No model ranking/selection or claims of clinical/future prediction
    are produced. No metric is evidence of generalization on these test fixtures.
    Each model result records its scalar estimator parameters (including seed)
    to reproduce the configuration without retaining fitted model state.

    Default KFold assumes independent observations. Grouped/repeated/temporal
    research observations require a separately approved splitting protocol
    before real-data experiments; no participant identifier belongs in X.
    """
    selected = None
    try:
        selected = validate_predictors(predictors)
    except (TypeError, ValueError):
        pass
    if (selected is None or type(n_splits) is not int or type(shuffle) is not bool
            or type(random_state) is not int or not 0 <= random_state < 2**32):
        raise RegressionEvaluationError("Configuração de avaliação inválida.")
    target = _validate_data(X, y, selected)
    if not 2 <= n_splits <= len(target):
        raise RegressionEvaluationError("Número de folds incompatível com a amostra.")
    templates = _validated_templates(models, selected, random_state)
    seed = random_state if shuffle else None
    # Materialize once; no splitter is reconstructed per model.
    partitions = tuple(KFold(n_splits=n_splits, shuffle=shuffle,
                             random_state=seed).split(X))
    frame = X.copy(deep=True)
    results = []
    for name, template in templates:
        folds = tuple(_evaluate_fold(template, frame, target, train, test, number)
                      for number, (train, test) in enumerate(partitions, 1))
        parameters = tuple(sorted(template.named_steps["regressor"].get_params(deep=False).items()))
        results.append(ModelEvaluation(name, folds, _aggregate(folds, "mae"),
                                       _aggregate(folds, "rmse"), _aggregate(folds, "r2"),
                                       parameters))
    return RegressionEvaluation(EvaluationProtocol(len(target), n_splits, shuffle, seed),
                                selected, tuple(results))
