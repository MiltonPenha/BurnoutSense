"""Context-only regression inputs, separate from the prototype classifier."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import (
    CONTEXT_FIELDS,
    FIELDS_BY_ID,
    SpecialValue,
    validate_record,
    validate_value,
)


ALLOWED_PREDICTORS = (
    "age_range", "course_area", "semester", "course_shift", "subject_count",
    "mandatory_hours_week", "independent_hours_week", "employment",
    "work_hours_week", "sleep_hours", "sleep_quality", "physical_activity_days",
    "subject_overload", "assessment_pressure", "extraclass_overload",
    "study_rest_difficulty", "study_work_difficulty", "teacher_difficulties",
    "peer_difficulties", "personal_support", "academic_support", "financial_concern",
)


def validate_predictors(predictors: Sequence[str]) -> tuple[str, ...]:
    """Accept only a nonempty, unique subset of the explicit context allowlist."""
    selected = tuple(predictors)
    if (not selected or any(type(key) is not str for key in selected)
            or any(key not in ALLOWED_PREDICTORS for key in selected)
            or len(set(selected)) != len(selected)):
        raise ValueError("Preditores devem ser contextuais, únicos e não vazios.")
    if not set(ALLOWED_PREDICTORS) <= {field.identifier for field in CONTEXT_FIELDS}:
        raise ValueError("Lista de preditores incompatível com o esquema canônico.")
    return selected


@dataclass(frozen=True)
class RegressionData:
    """Unfitted canonical X and continuous y, with matching positional indexes."""

    X: pd.DataFrame
    y: pd.Series
    predictors: tuple[str, ...]


def prepare_regression_data(
    records: Iterable[Mapping[str, object]],
    predictors: Sequence[str] = ALLOWED_PREDICTORS,
) -> RegressionData:
    """Validate complete eligible records; select X and calculate y without fitting."""
    selected = validate_predictors(predictors)
    rows, outcomes = [], []
    for record in records:
        validated = validate_record(record)
        rows.append({key: validated[key] for key in selected})
        outcomes.append(calculate_esbeu_scores(validated).overall)
    if not rows:
        raise ValueError("É necessário ao menos um registro elegível.")
    # Object dtype preserves strict Python integers for canonical revalidation.
    return RegressionData(pd.DataFrame(rows, columns=selected, dtype=object),
                          pd.Series(outcomes, name="esbeu_overall", dtype=float), selected)


class ContextFrameValidator(TransformerMixin, BaseEstimator):
    """Validate only approved X columns and perform schema-defined conversions."""

    def __init__(self, predictors=ALLOWED_PREDICTORS):
        self.predictors = predictors

    def fit(self, X, y=None):
        self.transform(X)
        self.feature_names_in_ = list(validate_predictors(self.predictors))
        return self

    def transform(self, X):
        selected = validate_predictors(self.predictors)
        if (not isinstance(X, pd.DataFrame) or tuple(X.columns) != selected
                or X.empty):
            raise ValueError("X deve conter apenas os preditores na ordem configurada.")
        converted = {}
        for key in selected:
            field = FIELDS_BY_ID[key]
            values = [validate_value(key, value) for value in X[key].tolist()]
            if field.allows_not_applicable:
                values = [value.value if value is SpecialValue.NOT_APPLICABLE
                          else str(value) for value in values]
            elif field.data_type == "category" and field.nature == "ordinal":
                values = [field.choices.index(value) for value in values]
            converted[key] = values
        return pd.DataFrame(converted, index=X.index)

    def get_feature_names_out(self, input_features=None):
        # Pipeline/ColumnTransformer expects an array-like of column names.
        return list(validate_predictors(self.predictors))


def build_regression_preprocessor(
    predictors: Sequence[str] = ALLOWED_PREDICTORS,
    *, scale_numeric: bool = True,
) -> Pipeline:
    """Return an UNFITTED transformer; fit only on X_train or inside CV folds.

    Nominal and NA-bearing columns use learned one-hot categories, rejecting
    unseen categories. Ordered textual categories use the schema's rank, not
    data-derived order. Other numeric/ordinal values keep their canonical units
    before optional StandardScaler. No imputation or outcome-driven selection.
    """
    selected = validate_predictors(predictors)
    categorical = [key for key in selected if (
        FIELDS_BY_ID[key].allows_not_applicable
        or FIELDS_BY_ID[key].nature == "nominal"
    )]
    numeric = [key for key in selected if key not in categorical]
    columns = ColumnTransformer(
        [
            ("numeric", StandardScaler() if scale_numeric else "passthrough", numeric),
            ("categorical", OneHotEncoder(handle_unknown="error", sparse_output=False),
             categorical),
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )
    return Pipeline([("validate", ContextFrameValidator(selected)), ("columns", columns)])
