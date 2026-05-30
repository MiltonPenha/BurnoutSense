from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.svm import LinearSVC

from training.eda import exploratory_summary
from training.evaluate_model import evaluate_classifier
from training.load_data import DEFAULT_DATASET_PATH, build_demo_dataset, load_dataset
from training.preprocess import prepare_features


MODEL_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "burnout_model.pkl"
REPORT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "training_report.json"
SUMMARY_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "training_summary.md"

QUALITY_TARGETS = {
    "accuracy": 0.80,
    "f1_macro": 0.70,
    "high_recall": 0.70,
    "high_f1_score": 0.65,
}

FINAL_FEATURE_EXCLUSIONS = ["dropout_risk", "internet_usage"]


def train(
    dataset_path: Path = DEFAULT_DATASET_PATH,
    allow_synthetic: bool = False,
    sample_size: int | None = None,
    balance_train: bool = False,
    max_per_class: int | None = None,
    records_per_class: int | None = None,
    class_sample_sizes: dict[str, int] | None = None,
) -> dict:
    if allow_synthetic and not Path(dataset_path).exists():
        df = build_demo_dataset()
        dataset_source = "synthetic_demo"
    else:
        df = load_dataset(dataset_path)
        dataset_source = str(dataset_path)

    eda = exploratory_summary(df)
    if sample_size and len(df) > sample_size:
        df = df.sample(n=sample_size, random_state=42)

    x_full, y, _ = prepare_features(df, excluded_features=[])
    feature_scenarios = build_feature_scenarios(x_full)
    split_indexes = train_test_split(
        x_full.index,
        test_size=0.25,
        random_state=42,
        stratify=y if y.value_counts().min() >= 2 else None,
    )
    train_indexes, test_indexes = split_indexes
    y_train_original = y.loc[train_indexes]
    y_test = y.loc[test_indexes]
    original_train_distribution = y_train_original.value_counts().to_dict()

    sampling_strategy = resolve_sampling_strategy(
        y_train_original,
        balance_train=balance_train,
        max_per_class=max_per_class,
        records_per_class=records_per_class,
        class_sample_sizes=class_sample_sizes,
    )

    results = {}
    trained_models = {}
    final_training_data = None

    for scenario_name, scenario_features in feature_scenarios.items():
        x = x_full[scenario_features]
        x_train_original = x.loc[train_indexes]
        x_test = x.loc[test_indexes]

        if sampling_strategy is None:
            x_train, y_train = x_train_original, y_train_original
        else:
            x_train, y_train = balance_training_data(
                x_train_original,
                y_train_original,
                class_sample_sizes=sampling_strategy,
            )

        for model_name, model in build_models().items():
            candidate_name = f"{model_name} [{scenario_name}]"
            if model_name == "HistGradientBoosting":
                sample_weight = y_train.map({"high": 4.0, "medium": 1.5, "low": 1.0}).to_numpy()
                model.fit(x_train, y_train, sample_weight=sample_weight)
            else:
                model.fit(x_train, y_train)

            metrics = evaluate_classifier(model, x_test, y_test)
            metrics["feature_scenario"] = scenario_name
            metrics["feature_names"] = scenario_features
            results[candidate_name] = metrics
            trained_models[candidate_name] = model

            if scenario_name == "final_without_dropout_or_internet" and model_name == "Random Forest":
                final_training_data = (x_train, y_train, x_test, y_test)

    selected_name = select_best_model(results)
    selected_model = trained_models[selected_name]
    selected_metrics = results[selected_name]
    feature_names = selected_metrics["feature_names"]
    x_for_fill_values = x_full[feature_names]
    feature_importance = build_feature_importance(selected_model, feature_names)
    permutation = build_permutation_importance(selected_model, final_training_data, feature_names)
    risk_classes = sorted(y.unique().tolist())
    trained_at = datetime.now(timezone.utc).isoformat()

    artifact = {
        "model": selected_model,
        "model_name": selected_name,
        "feature_names": feature_names,
        "fill_values": x_for_fill_values.median(numeric_only=True).to_dict(),
        "dataset_source": dataset_source,
        "training_records": len(df),
        "training_strategy": training_strategy(sampling_strategy, records_per_class, class_sample_sizes),
        "train_distribution_before_balance": original_train_distribution,
        "train_distribution_after_balance": sampling_strategy or original_train_distribution,
        "target_column": "risk_level",
        "risk_classes": risk_classes,
        "metrics": selected_metrics,
        "all_candidate_metrics": results,
        "feature_importance": feature_importance,
        "permutation_importance": permutation,
        "quality_targets": QUALITY_TARGETS,
        "quality_targets_met": quality_targets_met(selected_metrics),
        "trained_at": trained_at,
    }

    MODEL_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_OUTPUT_PATH)

    report = {
        "dataset_source": dataset_source,
        "training_records": len(df),
        "training_strategy": training_strategy(sampling_strategy, records_per_class, class_sample_sizes),
        "train_distribution_before_balance": original_train_distribution,
        "train_distribution_after_balance": sampling_strategy or original_train_distribution,
        "eda": eda,
        "audit": audit_dataset(df),
        "feature_names": feature_names,
        "feature_scenarios": feature_scenarios,
        "excluded_from_final_model": sorted(set(x_full.columns) - set(feature_names)),
        "selected_model": selected_name,
        "target_column": "risk_level",
        "risk_classes": risk_classes,
        "trained_at": trained_at,
        "quality_targets": QUALITY_TARGETS,
        "quality_targets_met": quality_targets_met(selected_metrics),
        "feature_importance": feature_importance,
        "permutation_importance": permutation,
        "metrics": results,
    }
    REPORT_OUTPUT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=True, default=json_default), encoding="utf-8")
    SUMMARY_OUTPUT_PATH.write_text(build_training_summary(report), encoding="utf-8")

    return report


def json_default(value):
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def balance_training_data(
    x_train,
    y_train,
    max_per_class: int | None = None,
    records_per_class: int | None = None,
    class_sample_sizes: dict[str, int] | None = None,
):
    counts = y_train.value_counts()
    if class_sample_sizes is not None:
        target_counts = class_sample_sizes
    elif records_per_class is not None:
        target_count = records_per_class
        target_counts = {risk_class: target_count for risk_class in counts.index}
    else:
        target_count = counts.min()
        if max_per_class is not None:
            target_count = min(target_count, max_per_class)
        target_counts = {risk_class: target_count for risk_class in counts.index}

    sampled_x = []
    sampled_y = []
    for risk_class in sorted(counts.index):
        class_indexes = y_train[y_train == risk_class].index
        target_count = target_counts.get(risk_class, len(class_indexes))
        sampled = class_indexes.to_series().sample(
            n=target_count,
            replace=len(class_indexes) < target_count,
            random_state=42,
        )
        sampled_x.append(x_train.loc[sampled.tolist()].reset_index(drop=True))
        sampled_y.append(pd.Series([risk_class] * target_count))

    x_balanced = pd.concat(sampled_x, ignore_index=True)
    y_balanced = pd.concat(sampled_y, ignore_index=True)
    shuffled_indexes = x_balanced.sample(frac=1, random_state=42).index
    return (
        x_balanced.loc[shuffled_indexes].reset_index(drop=True),
        y_balanced.loc[shuffled_indexes].reset_index(drop=True),
    )


def build_feature_scenarios(x_full) -> dict[str, list[str]]:
    all_features = list(x_full.columns)
    return {
        "all_features_audit_only": all_features,
        "without_dropout": [feature for feature in all_features if feature != "dropout_risk"],
        "final_without_dropout_or_internet": [
            feature for feature in all_features if feature not in FINAL_FEATURE_EXCLUSIONS
        ],
    }


def build_models() -> dict:
    return {
        "Dummy": DummyClassifier(strategy="most_frequent"),
        "Logistic Regression": LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            solver="saga",
            n_jobs=-1,
            random_state=42,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=180,
            max_depth=18,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=42,
        ),
        "Extra Trees": ExtraTreesClassifier(
            n_estimators=220,
            max_depth=22,
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=42,
        ),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=160,
            learning_rate=0.08,
            l2_regularization=0.05,
            random_state=42,
        ),
        "Linear SVC": LinearSVC(class_weight="balanced", random_state=42, max_iter=5000),
    }


def resolve_sampling_strategy(
    y_train,
    balance_train: bool,
    max_per_class: int | None = None,
    records_per_class: int | None = None,
    class_sample_sizes: dict[str, int] | None = None,
) -> dict[str, int] | None:
    counts = y_train.value_counts().to_dict()
    if class_sample_sizes is not None:
        return class_sample_sizes
    if records_per_class is not None:
        return {risk_class: records_per_class for risk_class in counts}
    if balance_train:
        target_count = min(counts.values())
        if max_per_class is not None:
            target_count = min(target_count, max_per_class)
        return {risk_class: target_count for risk_class in counts}

    return {
        "high": min(40000, max(counts.get("high", 0), 1) * 4),
        "medium": min(70000, counts.get("medium", 0)),
        "low": min(100000, counts.get("low", 0)),
    }


def select_best_model(results: dict) -> str:
    eligible = {
        name: metrics
        for name, metrics in results.items()
        if metrics["feature_scenario"] == "final_without_dropout_or_internet"
        and not name.startswith("Dummy")
        and name.startswith(("Random Forest", "Extra Trees", "Logistic Regression", "HistGradientBoosting"))
    }
    candidates = eligible or results

    def score(item: tuple[str, dict]) -> tuple[float, float, float, float]:
        _, metrics = item
        return (
            metrics.get("high_f1_score", 0),
            metrics.get("high_recall", 0),
            metrics.get("f1_macro", 0),
            metrics.get("balanced_accuracy", 0),
        )

    return max(candidates.items(), key=score)[0]


def build_feature_importance(model, feature_names: list[str]) -> list[dict]:
    if not hasattr(model, "feature_importances_"):
        return []

    ranking = sorted(
        zip(feature_names, model.feature_importances_),
        key=lambda item: float(item[1]),
        reverse=True,
    )
    return [{"feature": feature, "importance": round(float(value), 6)} for feature, value in ranking]


def build_permutation_importance(model, final_training_data, feature_names: list[str]) -> list[dict]:
    if final_training_data is None:
        return []

    _, _, x_test, y_test = final_training_data
    sample_size = min(20000, len(x_test))
    x_sample = x_test.sample(n=sample_size, random_state=42)
    y_sample = y_test.loc[x_sample.index]
    result = permutation_importance(
        model,
        x_sample,
        y_sample,
        n_repeats=5,
        random_state=42,
        scoring="f1_macro",
        n_jobs=-1,
    )
    ranking = sorted(
        zip(feature_names, result.importances_mean),
        key=lambda item: float(item[1]),
        reverse=True,
    )
    return [{"feature": feature, "importance": round(float(value), 6)} for feature, value in ranking]


def quality_targets_met(metrics: dict) -> dict[str, bool]:
    return {
        key: metrics.get(key, 0) >= target
        for key, target in QUALITY_TARGETS.items()
    }


def audit_dataset(df: pd.DataFrame) -> dict:
    numeric = df.select_dtypes(include="number")
    audit = {
        "duplicates": int(df.duplicated().sum()),
        "missing_values": df.isna().sum().to_dict(),
        "numeric_describe": numeric.describe(percentiles=[0.01, 0.05, 0.5, 0.95, 0.99]).round(4).to_dict(),
        "iqr_outliers": {},
        "correlation_with_encoded_risk": {},
        "high_correlation_pairs_abs_ge_0_75": [],
        "leakage_notes": [
            "`burnout_score` and `mental_health_index` are excluded because they are likely aggregate/derived indicators.",
            "`dropout_risk` is excluded from the final model because it is a risk-like derived variable and is not collected by the current product flow.",
            "`internet_usage` is excluded from the final model because it is highly redundant with `screen_time`.",
        ],
    }

    for column in numeric.columns:
        q1 = df[column].quantile(0.25)
        q3 = df[column].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        audit["iqr_outliers"][column] = int(((df[column] < lower) | (df[column] > upper)).sum())

    if "risk_level" in df.columns:
        encoded_risk = df["risk_level"].map({"Low": 0, "Medium": 1, "High": 2, "low": 0, "medium": 1, "high": 2})
        audit["correlation_with_encoded_risk"] = (
            numeric.corrwith(encoded_risk).sort_values(key=lambda value: value.abs(), ascending=False).round(4).to_dict()
        )

    correlations = numeric.corr().abs()
    pairs = []
    columns = list(correlations.columns)
    for index, left in enumerate(columns):
        for right in columns[index + 1 :]:
            value = correlations.loc[left, right]
            if value >= 0.75:
                pairs.append({"left": left, "right": right, "correlation": round(float(value), 4)})
    audit["high_correlation_pairs_abs_ge_0_75"] = pairs
    return audit


def training_strategy(
    sampling_strategy: dict[str, int] | None,
    records_per_class: int | None = None,
    class_sample_sizes: dict[str, int] | None = None,
) -> str:
    if sampling_strategy is None:
        return "baseline"
    if class_sample_sizes is not None:
        return "custom_class_sampling"
    if records_per_class is not None:
        return "balanced_hybrid_sampling"
    return "focused_high_recall_sampling"


def build_training_summary(report: dict) -> str:
    selected_model = report["selected_model"]
    selected_metrics = report["metrics"][selected_model]
    distribution = report["eda"].get("target_distribution", {})
    features = "\n".join(f"- `{feature}`" for feature in report["feature_names"])
    classes = ", ".join(f"`{risk_class}`" for risk_class in report["risk_classes"])
    distribution_lines = "\n".join(f"- `{label}`: {count}" for label, count in distribution.items())

    return f"""# BurnoutSense Training Summary

## Objective

Initial TCC 1 training pipeline for academic burnout risk classification.

The model predicts the target column `{report["target_column"]}` using academic, emotional and behavioral indicators from the dataset. This prototype is preventive and academic only; it is not a clinical or diagnostic tool.

## Dataset

- Source file: `{report["dataset_source"]}`
- Total records identified during EDA: {report["eda"]["records"]}
- Records used in this training run: {report["training_records"]}
- Training strategy: `{report["training_strategy"]}`
- Training timestamp: `{report["trained_at"]}`

## Target

- Target column: `{report["target_column"]}`
- Normalized classes: {classes}

Original dataset labels are normalized as:

- `Low` -> `low`
- `Medium` -> `medium`
- `High` -> `high`

## Target Distribution

{distribution_lines}

## Training Class Distribution

Before balancing:

{format_distribution(report["train_distribution_before_balance"])}

After balancing:

{format_distribution(report["train_distribution_after_balance"])}

## Input Features

{features}

## Models Evaluated

- DummyClassifier baseline
- Logistic Regression with class balancing
- Random Forest with class balancing
- Extra Trees with class balancing
- HistGradientBoosting with sample weights
- Linear SVC with class balancing

The API currently uses `{selected_model}` as the saved production prototype model.

## Selected Model Metrics

- Accuracy: {selected_metrics["accuracy"]:.4f}
- Balanced Accuracy: {selected_metrics["balanced_accuracy"]:.4f}
- Precision macro: {selected_metrics["precision_macro"]:.4f}
- Recall macro: {selected_metrics["recall_macro"]:.4f}
- F1 macro: {selected_metrics["f1_macro"]:.4f}
- High recall: {selected_metrics["high_recall"]:.4f}
- High F1-score: {selected_metrics["high_f1_score"]:.4f}
- Confusion Matrix: `{selected_metrics["confusion_matrix"]}`

Quality targets:

{format_quality_targets(report["quality_targets"], report["quality_targets_met"])}

## Feature Importance

{format_feature_importance(report.get("feature_importance", []))}

## Per-Class Metrics

{format_per_class_metrics(selected_metrics.get("per_class_metrics", {}))}

## Notes

- The train/test split evaluates the model on data not used during fitting.
- The test set keeps the original class distribution to make evaluation closer to real data.
- The training set may use balanced sampling to reduce bias toward the majority class.
- The final model excludes `dropout_risk` because it behaves like a risk-derived variable and can cause leakage or weak product compatibility.
- The final model excludes `internet_usage` because it is highly redundant with `screen_time`.
- The `high` class has far fewer examples than `low`, so recall and F1 for high-risk cases should still be monitored in TCC 2.
- Future improvements may include cross-validation, hyperparameter tuning, model versioning and database logging of predictions.
"""


def format_distribution(distribution: dict) -> str:
    return "\n".join(f"- `{label}`: {count}" for label, count in distribution.items())


def format_per_class_metrics(metrics: dict) -> str:
    lines = []
    for label, values in metrics.items():
        lines.append(
            f"- `{label}`: precision={values['precision']}, recall={values['recall']}, "
            f"f1-score={values['f1_score']}, support={values['support']}"
        )
    return "\n".join(lines)


def format_quality_targets(targets: dict, status: dict) -> str:
    return "\n".join(
        f"- `{metric}` >= {target}: {'met' if status.get(metric) else 'not met'}"
        for metric, target in targets.items()
    )


def format_feature_importance(importances: list[dict]) -> str:
    if not importances:
        return "Feature importance is not available for this selected model."

    return "\n".join(
        f"- `{item['feature']}`: {item['importance']}"
        for item in importances[:12]
    )


def parse_class_sample_sizes(value: str | None) -> dict[str, int] | None:
    if not value:
        return None

    result = {}
    for item in value.split(","):
        label, count = item.split("=")
        result[label.strip()] = int(count.strip())
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Train initial BurnoutSense ML models.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument(
        "--allow-synthetic",
        action="store_true",
        help="Use a tiny synthetic dataset when the Kaggle CSV is not available.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Optional number of records to sample for faster prototype training.",
    )
    parser.add_argument(
        "--balance-train",
        action="store_true",
        help="Balance only the training split with undersampling before model fitting.",
    )
    parser.add_argument(
        "--max-per-class",
        type=int,
        default=None,
        help="Optional maximum records per class after training balance.",
    )
    parser.add_argument(
        "--records-per-class",
        type=int,
        default=None,
        help="Exact records per class after balance; oversamples minority classes when needed.",
    )
    parser.add_argument(
        "--class-sample-sizes",
        type=str,
        default=None,
        help="Custom class sizes after balance, for example: high=11000,medium=50000,low=100000.",
    )
    args = parser.parse_args()

    report = train(
        dataset_path=args.dataset,
        allow_synthetic=args.allow_synthetic,
        sample_size=args.sample_size,
        balance_train=args.balance_train,
        max_per_class=args.max_per_class,
        records_per_class=args.records_per_class,
        class_sample_sizes=parse_class_sample_sizes(args.class_sample_sizes),
    )
    print(json.dumps(report, indent=2, ensure_ascii=True, default=json_default))


if __name__ == "__main__":
    main()
