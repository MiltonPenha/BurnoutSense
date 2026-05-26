from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support


def evaluate_classifier(model, x_test, y_test) -> dict:
    predictions = model.predict(x_test)
    labels = sorted(y_test.unique().tolist())
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        average="weighted",
        zero_division=0,
    )

    return {
        "accuracy": accuracy_score(y_test, predictions),
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "confusion_matrix": confusion_matrix(y_test, predictions, labels=labels).tolist(),
        "confusion_matrix_labels": labels,
        "per_class_metrics": _per_class_metrics(y_test, predictions, labels),
        "classification_report": classification_report(y_test, predictions, zero_division=0),
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
