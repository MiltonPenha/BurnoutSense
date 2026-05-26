from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.schemas import PredictionRequest


MODEL_PATH = Path(__file__).resolve().parents[1] / "saved_models" / "burnout_model.pkl"


class BurnoutPredictor:
    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.model_path = model_path
        self._artifact: dict[str, Any] | None = None

    def _load_artifact(self) -> dict[str, Any]:
        if self._artifact is None:
            if not self.model_path.exists():
                raise FileNotFoundError(self.model_path)
            self._artifact = joblib.load(self.model_path)
        return self._artifact

    def predict(self, payload: PredictionRequest) -> dict[str, str]:
        artifact = self._load_artifact()
        model = artifact["model"]
        feature_names = artifact["feature_names"]
        model_name = artifact.get("model_name", "Random Forest")
        fill_values = artifact.get("fill_values", {})

        input_data = pd.DataFrame([payload.model_dump()])
        input_data = input_data.reindex(columns=feature_names)
        input_data = input_data.apply(pd.to_numeric, errors="coerce")
        input_data = input_data.fillna(fill_values).fillna(0)

        risk_level = model.predict(input_data)[0]

        return {
            "risk_level": str(risk_level),
            "model_used": model_name,
        }

    def model_info(self) -> dict[str, Any]:
        artifact = self._load_artifact()
        feature_names = artifact.get("feature_names", [])
        return {
            "model_name": artifact.get("model_name", "Random Forest"),
            "training_strategy": artifact.get("training_strategy", "baseline"),
            "target_column": artifact.get("target_column", "risk_level"),
            "risk_classes": artifact.get("risk_classes", []),
            "feature_count": len(feature_names),
            "feature_names": feature_names,
            "dataset_source": artifact.get("dataset_source", ""),
            "training_records": artifact.get("training_records"),
            "metrics_summary": self._metrics_summary(artifact.get("metrics", {})),
            "purpose": "Academic prototype for early burnout risk screening.",
            "clinical_disclaimer": "This service is not a clinical or diagnostic tool.",
        }

    def model_metrics(self) -> dict[str, Any]:
        artifact = self._load_artifact()
        metrics = artifact.get("metrics", {})
        return {
            "model_name": artifact.get("model_name", "Random Forest"),
            "training_strategy": artifact.get("training_strategy", "baseline"),
            "metrics_summary": self._metrics_summary(metrics),
            "per_class_metrics": metrics.get("per_class_metrics", {}),
            "confusion_matrix": metrics.get("confusion_matrix", []),
            "confusion_matrix_labels": metrics.get(
                "confusion_matrix_labels",
                artifact.get("risk_classes", []),
            ),
        }

    @staticmethod
    def _metrics_summary(metrics: dict[str, Any]) -> dict[str, float | None]:
        return {
            "accuracy": _round_metric(metrics.get("accuracy")),
            "precision": _round_metric(metrics.get("precision")),
            "recall": _round_metric(metrics.get("recall")),
            "f1_score": _round_metric(metrics.get("f1_score")),
        }


def _round_metric(value: Any) -> float | None:
    if value is None:
        return None
    return round(float(value), 4)
