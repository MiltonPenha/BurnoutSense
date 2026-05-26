from __future__ import annotations

import re

import pandas as pd
from sklearn.preprocessing import LabelEncoder


TARGET_ALIASES = [
    "risk_level",
    "burnout_risk",
    "burnout_level",
    "stress_risk",
    "dropout_risk",
    "nivel_de_risco",
    "risco",
]

FEATURE_ALIASES = {
    "study_hours": [
        "study_hours",
        "studyhours",
        "study_hours_per_day",
        "hours_studied",
        "study_time",
        "academic_workload",
    ],
    "academic_performance": ["academic_performance", "performance", "gpa", "grades"],
    "exam_pressure": ["exam_pressure", "academic_pressure", "pressure_by_exams"],
    "stress_level": ["stress_level", "stress"],
    "anxiety_score": ["anxiety_score", "anxiety", "anxiety_level"],
    "depression_score": ["depression_score", "depression", "depression_level"],
    "sleep_quality": ["sleep_quality", "sleep", "sleep_hours", "quality_of_sleep"],
    "physical_activity": ["physical_activity", "exercise", "activity_level"],
    "screen_time": ["screen_time", "screen_time_hours", "daily_screen_time"],
    "internet_usage": ["internet_usage", "internet_use", "internet_hours"],
    "social_support": ["social_support", "support", "peer_support", "family_support"],
    "family_expectation": ["family_expectation", "family_expectations", "parental_expectation"],
    "financial_stress": ["financial_stress", "financial_pressure", "money_stress"],
    "dropout_risk": ["dropout_risk", "dropout", "evasion_risk", "risco_de_evasao"],
}


def standardize_column_name(column: str) -> str:
    column = column.strip().lower()
    column = re.sub(r"[^a-z0-9]+", "_", column)
    return column.strip("_")


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    normalized = df.copy()
    normalized.columns = [standardize_column_name(column) for column in normalized.columns]
    return normalized


def find_target_column(df: pd.DataFrame) -> str:
    for alias in TARGET_ALIASES:
        if alias in df.columns:
            return alias

    candidates = [column for column in df.columns if "risk" in column or "burnout" in column]
    if candidates:
        return candidates[0]

    raise ValueError(
        "Nao foi possivel identificar a variavel-alvo. Renomeie a coluna de risco para risk_level."
    )


def _find_feature_column(df: pd.DataFrame, canonical_name: str) -> str | None:
    aliases = FEATURE_ALIASES[canonical_name]
    for alias in aliases:
        if alias in df.columns:
            return alias
    return None


def prepare_features(df: pd.DataFrame, target_column: str | None = None) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    data = standardize_columns(df)
    target = target_column or find_target_column(data)

    selected = pd.DataFrame(index=data.index)
    for canonical_name in FEATURE_ALIASES:
        source_column = _find_feature_column(data, canonical_name)
        if source_column is None:
            selected[canonical_name] = 0
        else:
            selected[canonical_name] = data[source_column]

    selected = selected.apply(pd.to_numeric, errors="coerce")
    selected = selected.fillna(selected.median(numeric_only=True)).fillna(0)

    y = data[target].fillna("desconhecido").astype(str).map(normalize_risk_label)
    return selected, y, list(selected.columns)


def normalize_risk_label(value: str) -> str:
    normalized = standardize_column_name(value)
    if normalized in {"low", "baixo", "baixa", "0"}:
        return "low"
    if normalized in {"medium", "moderate", "medio", "media", "1"}:
        return "medium"
    if normalized in {"high", "alto", "alta", "2"}:
        return "high"
    return value.strip().lower()


def encode_categorical_columns(df: pd.DataFrame) -> pd.DataFrame:
    encoded = df.copy()
    for column in encoded.select_dtypes(include=["object", "category", "bool"]).columns:
        encoded[column] = LabelEncoder().fit_transform(encoded[column].astype(str))
    return encoded
