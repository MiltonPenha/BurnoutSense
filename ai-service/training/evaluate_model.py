from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)


def evaluate_classifier(model, x_test, y_test) -> dict:
    predictions = model.predict(x_test)
    labels = _ordered_labels(y_test)
    precision_weighted, recall_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        average="weighted",
        zero_division=0,
        labels=labels,
    )
    precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        average="macro",
        zero_division=0,
        labels=labels,
    )
    per_class = _per_class_metrics(y_test, predictions, labels)
    high_metrics = per_class.get("high", {})

    return {
        "accuracy": accuracy_score(y_test, predictions),
        "balanced_accuracy": balanced_accuracy_score(y_test, predictions),
        "precision": precision_weighted,
        "recall": recall_weighted,
        "f1_score": f1_weighted,
        "precision_macro": precision_macro,
        "recall_macro": recall_macro,
        "f1_macro": f1_macro,
        "high_precision": high_metrics.get("precision", 0.0),
        "high_recall": high_metrics.get("recall", 0.0),
        "high_f1_score": high_metrics.get("f1_score", 0.0),
        "confusion_matrix": confusion_matrix(y_test, predictions, labels=labels).tolist(),
        "confusion_matrix_labels": labels,
        "per_class_metrics": per_class,
        "classification_report": classification_report(y_test, predictions, labels=labels, zero_division=0),
    }


def _per_class_metrics(y_test, predictions, labels: list[str]) -> dict:
    report = classification_report(
        y_test,
        predictions,
        labels=labels,
        output_dict=True,
        zero_division=0,
    )
    return {
        label: {
            "precision": round(report[label]["precision"], 4),
            "recall": round(report[label]["recall"], 4),
            "f1_score": round(report[label]["f1-score"], 4),
            "support": int(report[label]["support"]),
        }
        for label in labels
    }


def _ordered_labels(y_test) -> list[str]:
    preferred_order = ["high", "low", "medium"]
    present = set(y_test.unique().tolist())
    ordered = [label for label in preferred_order if label in present]
    ordered.extend(sorted(present - set(ordered)))
    return ordered
