from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.svm import LinearSVC

from training.eda import exploratory_summary
from training.evaluate_model import evaluate_classifier
from training.load_data import DEFAULT_DATASET_PATH, build_demo_dataset, load_dataset
from training.preprocess import prepare_features


MODEL_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "burnout_model.pkl"
REPORT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "training_report.json"
SUMMARY_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "training_summary.md"


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

    x, y, feature_names = prepare_features(df)

    stratify = y if y.value_counts().min() >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.25,
        random_state=42,
        stratify=stratify,
    )
    original_train_distribution = y_train.value_counts().to_dict()

    if balance_train:
        x_train, y_train = balance_training_data(
            x_train,
            y_train,
            max_per_class=max_per_class,
            records_per_class=records_per_class,
            class_sample_sizes=class_sample_sizes,
        )

    balanced_train_distribution = y_train.value_counts().to_dict()

    models = {
        "Random Forest": RandomForestClassifier(n_estimators=120, random_state=42, class_weight="balanced"),
        "SVM": LinearSVC(class_weight="balanced", random_state=42, max_iter=5000),
    }

    results = {}
    for model_name, model in models.items():
        model.fit(x_train, y_train)
        results[model_name] = evaluate_classifier(model, x_test, y_test)

    selected_name = "Random Forest"
    selected_model = models[selected_name]
    risk_classes = sorted(y.unique().tolist())
    trained_at = datetime.now(timezone.utc).isoformat()

    artifact = {
        "model": selected_model,
        "model_name": selected_name,
        "feature_names": feature_names,
        "fill_values": x.median(numeric_only=True).to_dict(),
        "dataset_source": dataset_source,
        "training_records": len(df),
        "training_strategy": training_strategy(balance_train, records_per_class, class_sample_sizes),
        "train_distribution_before_balance": original_train_distribution,
        "train_distribution_after_balance": balanced_train_distribution,
        "target_column": "risk_level",
        "risk_classes": risk_classes,
        "metrics": results[selected_name],
        "trained_at": trained_at,
    }

    MODEL_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_OUTPUT_PATH)

    report = {
        "dataset_source": dataset_source,
        "training_records": len(df),
        "training_strategy": training_strategy(balance_train, records_per_class, class_sample_sizes),
        "train_distribution_before_balance": original_train_distribution,
        "train_distribution_after_balance": balanced_train_distribution,
        "eda": eda,
        "feature_names": feature_names,
        "selected_model": selected_name,
        "target_column": "risk_level",
        "risk_classes": risk_classes,
        "trained_at": trained_at,
        "metrics": results,
    }
    REPORT_OUTPUT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=True), encoding="utf-8")
    SUMMARY_OUTPUT_PATH.write_text(build_training_summary(report), encoding="utf-8")

    return report


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

    balanced_indexes = []
    for risk_class in sorted(counts.index):
        class_indexes = y_train[y_train == risk_class].index
        target_count = target_counts.get(risk_class, len(class_indexes))
        sampled = class_indexes.to_series().sample(
            n=target_count,
            replace=len(class_indexes) < target_count,
            random_state=42,
        )
        balanced_indexes.extend(sampled.tolist())

    x_balanced = x_train.loc[balanced_indexes].sample(frac=1, random_state=42)
    y_balanced = y_train.loc[x_balanced.index]
    return x_balanced, y_balanced


def training_strategy(
    balance_train: bool,
    records_per_class: int | None = None,
    class_sample_sizes: dict[str, int] | None = None,
) -> str:
    if not balance_train:
        return "baseline"
    if class_sample_sizes is not None:
        return "custom_class_sampling"
    if records_per_class is not None:
        return "balanced_hybrid_sampling"
    return "balanced_undersampling"


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

- Random Forest
- SVM Linear

The API currently uses `{selected_model}` as the saved production prototype model.

## Selected Model Metrics

- Accuracy: {selected_metrics["accuracy"]:.4f}
- Precision: {selected_metrics["precision"]:.4f}
- Recall: {selected_metrics["recall"]:.4f}
- F1-score: {selected_metrics["f1_score"]:.4f}
- Confusion Matrix: `{selected_metrics["confusion_matrix"]}`

## Per-Class Metrics

{format_per_class_metrics(selected_metrics.get("per_class_metrics", {}))}

## Notes

- The train/test split evaluates the model on data not used during fitting.
- The test set keeps the original class distribution to make evaluation closer to real data.
- The training set may use balanced sampling to reduce bias toward the majority class.
- The `high` class has fewer examples than `low`, so recall for high-risk cases should still be monitored in TCC 2.
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
    print(json.dumps(report, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
