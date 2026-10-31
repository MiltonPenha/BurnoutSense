"""Unfitted context-only ESB-eu regressors, independent of the legacy API.

This module performs no data loading, evaluation, model selection or persistence.
Predictions are raw continuous estimates; they are neither diagnoses nor clipped
to 0-4. A deployment policy for out-of-range estimates belongs to Etapa 9.
"""

from collections.abc import Mapping, Sequence
from types import MappingProxyType
from typing import TypeAlias

from sklearn.base import BaseEstimator
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.svm import SVR

from training.regression_preprocessing import (
    ALLOWED_PREDICTORS,
    build_regression_preprocessor,
    validate_predictors,
)


MODEL_NAMES = ("dummy", "linear", "ridge", "random_forest", "svr")
DEFAULT_RANDOM_STATE = 42
DEFAULT_RIDGE_ALPHA = 1.0
DEFAULT_FOREST_TREES = 100
DEFAULT_FOREST_MAX_DEPTH = 3
DEFAULT_FOREST_MIN_SAMPLES_LEAF = 3

ModelParameter: TypeAlias = str | int | float | bool | None

# Only scalar configuration is accepted: no callbacks, estimators or shared RNGs.
# Dummy remains the mean baseline; preprocessing cannot be replaced via this API.
_MODEL_PARAMETERS = MappingProxyType({
    "dummy": frozenset(),
    "linear": frozenset({"fit_intercept", "positive"}),
    "ridge": frozenset({"alpha", "fit_intercept", "tol", "max_iter"}),
    "random_forest": frozenset({
        "n_estimators", "max_depth", "min_samples_split", "min_samples_leaf",
        "max_features", "max_leaf_nodes", "n_jobs",
    }),
    "svr": frozenset({
        "C", "epsilon", "kernel", "gamma", "degree", "coef0", "tol",
        "max_iter", "shrinking", "cache_size",
    }),
})


def build_regression_pipeline(
    model_name: str,
    predictors: Sequence[str] = ALLOWED_PREDICTORS,
    *,
    random_state: int = DEFAULT_RANDOM_STATE,
    model_params: Mapping[str, ModelParameter] | None = None,
) -> Pipeline:
    """Build a fresh, unfitted ``preprocess`` -> ``regressor`` Pipeline.

    Stable names are MODEL_NAMES. Predictors must be a nonempty unique subset
    of the existing context allowlist, in input-column order. Scaling always
    stays inside preprocessing; Dummy/forest do not require it but share the
    same contract as Linear/Ridge/SVR. No training statistics exist at creation.

    Defaults are engineering starting points, not tuned recommendations:
    Dummy mean; ordinary LinearRegression; Ridge alpha=1; forest 100 trees,
    depth=3, min_samples_leaf=3, n_jobs=1; SVR RBF, C=1, epsilon=0.1, gamma=scale.
    random_state is an integer in [0, 2**32), assigned to Ridge and the forest.

    model_params supports the scalar keys declared in _MODEL_PARAMETERS above;
    scikit-learn validates their types/ranges before returning. SVR accepts only
    feature-based string kernels (linear/poly/rbf/sigmoid), never precomputed
    matrices or callables. Invalid configuration errors do not echo inputs.

    Native get_params/set_params/clone remain available, e.g.
    set_params(regressor__alpha=2). Such later changes use sklearn's validation
    at fit and are trusted developer configuration, not participant input.
    In Etapa 6, pass the unfitted pipeline and aligned RegressionData.X/y to CV;
    fit preprocessing only within each training partition.
    """
    if type(model_name) is not str or model_name not in MODEL_NAMES:
        raise ValueError("Modelo de regressão desconhecido.")
    selected = validate_predictors(predictors)
    if type(random_state) is not int or not 0 <= random_state < 2**32:
        raise ValueError("random_state deve ser um inteiro no intervalo permitido.")
    if model_params is not None and not isinstance(model_params, Mapping):
        raise ValueError("Parâmetros devem ser um mapeamento de configuração.")
    params = dict(model_params) if model_params is not None else {}
    if any(type(key) is not str or key not in _MODEL_PARAMETERS[model_name]
           or type(value) not in (str, int, float, bool, type(None))
           for key, value in params.items()):
        raise ValueError("Parâmetro de regressão não permitido.")
    if model_name == "svr" and "kernel" in params:
        if type(params["kernel"]) is not str or params["kernel"] not in (
            "linear", "poly", "rbf", "sigmoid",
        ):
            raise ValueError("Kernel de regressão não permitido.")
    if model_name == "random_forest" and params.get("n_jobs") == 0:
        raise ValueError("Paralelismo de regressão inválido.")

    estimator: BaseEstimator
    if model_name == "dummy":
        estimator = DummyRegressor(strategy="mean")
    elif model_name == "linear":
        estimator = LinearRegression()
    elif model_name == "ridge":
        estimator = Ridge(alpha=DEFAULT_RIDGE_ALPHA, random_state=random_state)
    elif model_name == "random_forest":
        estimator = RandomForestRegressor(
            n_estimators=DEFAULT_FOREST_TREES,
            max_depth=DEFAULT_FOREST_MAX_DEPTH,
            min_samples_leaf=DEFAULT_FOREST_MIN_SAMPLES_LEAF,
            random_state=random_state,
            n_jobs=1,
        )
    else:
        estimator = SVR(kernel="rbf", C=1.0, epsilon=0.1, gamma="scale")

    try:
        estimator.set_params(**params)
        # sklearn 1.5.1 constructor validation is normally deferred until fit.
        # Use its common validation hook here without fitting or copying data.
        estimator._validate_params()
    except (TypeError, ValueError):
        pass
    else:
        return Pipeline([
            ("preprocess", build_regression_preprocessor(selected)),
            ("regressor", estimator),
        ])
    # Outside the handler: no chained sklearn exception retains parameter values.
    raise ValueError("Configuração de hiperparâmetros inválida.")
