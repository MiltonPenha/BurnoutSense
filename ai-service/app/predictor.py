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

    def predict(self, payload: PredictionRequest) -> dict[str, Any]:
        artifact = self._load_artifact()
        model = artifact["model"]
        feature_names = artifact["feature_names"]
        model_name = artifact.get("model_name", "Random Forest")
        fill_values = artifact.get("fill_values", {})

        input_data = pd.DataFrame([payload.model_dump()])
        input_data = input_data.reindex(columns=feature_names)
        input_data = input_data.apply(pd.to_numeric, errors="coerce")
        input_data = input_data.fillna(fill_values).fillna(0)

        if not feature_names:
            raise ValueError("Modelo sem lista de features esperadas.")

        risk_level = str(model.predict(input_data)[0])
        probabilities = self._prediction_probabilities(model, input_data)
        confidence = self._prediction_confidence(probabilities, risk_level)

        return {
            "risk_level": risk_level,
            "confidence": confidence,
            "risk_score": self._risk_score(probabilities, input_data.iloc[0].to_dict()),
            "model_used": model_name,
            "main_factors": self._main_factors(input_data.iloc[0].to_dict()),
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
            "trained_at": artifact.get("trained_at"),
            "metrics_summary": self._metrics_summary(artifact.get("metrics", {})),
            "quality_targets": artifact.get("quality_targets", {}),
            "quality_targets_met": artifact.get("quality_targets_met", {}),
            "feature_importance": artifact.get("feature_importance", []),
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
            "quality_targets": artifact.get("quality_targets", {}),
            "quality_targets_met": artifact.get("quality_targets_met", {}),
        }

    @staticmethod
    def _metrics_summary(metrics: dict[str, Any]) -> dict[str, float | None]:
        return {
            "accuracy": _round_metric(metrics.get("accuracy")),
            "balanced_accuracy": _round_metric(metrics.get("balanced_accuracy")),
            "precision": _round_metric(metrics.get("precision")),
            "recall": _round_metric(metrics.get("recall")),
            "f1_score": _round_metric(metrics.get("f1_score")),
            "precision_macro": _round_metric(metrics.get("precision_macro")),
            "recall_macro": _round_metric(metrics.get("recall_macro")),
            "f1_macro": _round_metric(metrics.get("f1_macro")),
            "high_precision": _round_metric(metrics.get("high_precision")),
            "high_recall": _round_metric(metrics.get("high_recall")),
            "high_f1_score": _round_metric(metrics.get("high_f1_score")),
        }

    @staticmethod
    def _prediction_probabilities(model: Any, input_data: pd.DataFrame) -> dict[str, float]:
        if not hasattr(model, "predict_proba"):
            return {}

        probabilities = model.predict_proba(input_data)[0]
        classes = [str(label) for label in model.classes_]

        return {risk_class: float(probabilities[index]) for index, risk_class in enumerate(classes)}

    @staticmethod
    def _prediction_confidence(probabilities: dict[str, float], risk_level: str) -> float:
        return round(float(probabilities.get(risk_level, 0.0)), 4)

    @staticmethod
    def _risk_score(probabilities: dict[str, float], features: dict[str, float]) -> float:
        if not probabilities:
            return 5.0

        risk_index = probabilities.get("medium", 0.0) * 0.5 + probabilities.get("high", 0.0)
        score = 1 + (9 * risk_index)

        if features.get("stress_level", 0) >= 8:
            score += 0.3
        if features.get("sleep_quality", 24) <= 4:
            score += 0.3
        if features.get("social_support", 10) <= 3:
            score += 0.2
        if features.get("study_hours", 0) >= 12 and features.get("exam_pressure", 0) >= 8:
            score += 0.2
        if features.get("physical_activity", 0) >= 5:
            score -= 0.2
        if features.get("social_support", 0) >= 8:
            score -= 0.2

        return round(min(10, max(1, score)), 1)

    @staticmethod
    def _main_factors(features: dict[str, float]) -> list[str]:
        factors = []

        if features.get("stress_level", 0) >= 8:
            factors.append("Nivel de estresse elevado")
        if features.get("sleep_quality", 24) < 6:
            factors.append("Poucas horas de sono ou baixa qualidade do sono")
        if features.get("exam_pressure", 0) >= 7 or features.get("study_hours", 0) >= 8:
            factors.append("Alta carga academica")
        if features.get("screen_time", 0) >= 8:
            factors.append("Tempo de tela elevado")
        if features.get("social_support", 10) <= 4:
            factors.append("Baixo suporte social")
        if features.get("financial_stress", 0) >= 7:
            factors.append("Estresse financeiro elevado")
        if features.get("physical_activity", 7) <= 1:
            factors.append("Baixa atividade fisica")

        return factors or ["Indicadores dentro de uma faixa menos critica"]


def _round_metric(value: Any) -> float | None:
    if value is None:
        return None
    return round(float(value), 4)
