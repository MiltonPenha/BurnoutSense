"""Serve a known private contextual regressor; never read the research CSV."""

from dataclasses import asdict
import json
from pathlib import Path
import re
from threading import Lock

import pandas as pd

from app.schemas import FamilyMetrics
from app.settings import Settings
from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ESBEU_FIELDS, FIELDS_BY_ID
from training.regression_evaluation import calculate_regression_metrics
from training.regression_inference import load_private_pipeline, predict_context_scores, runtime_versions
from training.regression_models import MODEL_NAMES
from training.regression_preprocessing import ALLOWED_PREDICTORS, ContextFrameValidator, validate_predictors


class ModelUnavailable(RuntimeError):
    pass


class InputRejected(ValueError):
    pass


class EstimateRejected(ValueError):
    pass


METRIC_CONTRACT = {
    "mae": {"direction": "minimize", "mathematical_ideal": 0.0, "unit": "ESB-eu points (0-4)"},
    "rmse": {"direction": "minimize", "mathematical_ideal": 0.0, "unit": "ESB-eu points (0-4)"},
    "r2": {"direction": "maximize", "mathematical_ideal": 1.0, "unit": "dimensionless; negative permitted"},
}


class RegressionService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._artifact = None
        self._manifest = None
        self._comparison = None
        self._protocol = None
        self._lock = Lock()

    def _load(self):
        if self._artifact is not None:
            return self._artifact
        with self._lock:
            if self._artifact is not None:
                return self._artifact
            try:
                directory = self.settings.model_dir
                if (directory is None or not self.settings.trust_local_model
                        or not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", self.settings.dataset_version)):
                    raise ValueError()
                directory = directory.resolve()
                if directory.is_relative_to(Path(__file__).resolve().parents[2]):
                    raise ValueError()
                manifest = json.loads((directory / "run-manifest.private.json").read_text(encoding="utf-8"))
                if (manifest["status"] != "completed" or manifest["data_origin"] != "real_questionnaire"
                        or manifest["model_name"] not in MODEL_NAMES
                        or type(manifest["eligible_records"]) is not int or manifest["eligible_records"] < 2
                        or not re.fullmatch(r"[0-9a-f]{64}", manifest["model_sha256"])):
                    raise ValueError()
                artifact = load_private_pipeline(directory / "context_regressor.private.joblib",
                                                 trusted=True, expected_sha256=manifest["model_sha256"])
                contract = artifact["contract"]
                if (contract["model_name"] != manifest["model_name"]
                        or contract["output_name"] != "esbeu_overall"
                        or contract["output_minimum"] != 0 or contract["output_maximum"] != 4):
                    raise ValueError()
                selected = validate_predictors(contract["predictors"])
                if selected != tuple(ALLOWED_PREDICTORS):
                    raise ValueError()
                if tuple(artifact["pipeline"].named_steps["preprocess"].named_steps["validate"].predictors) != selected:
                    raise ValueError()
                raw = json.loads((directory / "comparison.aggregate.json").read_text(encoding="utf-8"))
                protocol = json.loads((directory / "protocol.private.json").read_text(encoding="utf-8"))["protocol"]
                if raw["failure"] is not None or raw["final_candidate"]["name"] != manifest["model_name"]:
                    raise ValueError()
                # Select only typed numeric summaries; never expose arbitrary JSON.
                comparisons = [FamilyMetrics.model_validate(row).model_dump() for row in raw["family_comparisons"]]
                procedure = FamilyMetrics.model_validate(raw["selection_procedure"]).model_dump()
                if ({row["name"] for row in comparisons} != set(MODEL_NAMES)
                        or len(comparisons) != 5 or procedure["name"] != "inner_selection_procedure"):
                    raise ValueError()
                keys = ("outer_splits", "inner_splits", "outer_repeats", "random_state")
                if any(type(protocol[key]) is not int for key in keys):
                    raise ValueError()
                self._protocol = {key: protocol[key] for key in keys}
                self._comparison = {"family_comparisons": comparisons, "selection_procedure": procedure}
                self._manifest = manifest
                self._artifact = artifact
                return artifact
            except Exception:
                pass
        raise ModelUnavailable("Modelo privado indisponível ou incompatível.")

    def predictors(self):
        return tuple(self._load()["contract"]["predictors"])

    @staticmethod
    def context_frame(context: dict, predictors=ALLOWED_PREDICTORS):
        selected = validate_predictors(predictors)
        try:
            if type(context) is not dict or set(context) != set(selected):
                raise ValueError()
            frame = pd.DataFrame([{key: context[key] for key in selected}], columns=selected, dtype=object)
            ContextFrameValidator(selected).transform(frame)
            if ("employment" in selected and "work_hours_week" in selected
                    and context["employment"] == FIELDS_BY_ID["employment"].choices[0]
                    and context["work_hours_week"] != 0):
                raise ValueError()
            return frame
        except (TypeError, ValueError, KeyError):
            pass
        raise InputRejected("Contexto inválido; confira o esquema e os campos obrigatórios.")

    @staticmethod
    def observed(items: dict):
        try:
            if type(items) is not dict or set(items) != {f.identifier for f in ESBEU_FIELDS}:
                raise ValueError()
            return calculate_esbeu_scores(items)
        except (TypeError, ValueError, KeyError):
            pass
        raise InputRejected("Itens inválidos; exigidos os 14 itens inteiros de 0 a 4.")

    def predict(self, context: dict):
        artifact = self._load()
        frame = self.context_frame(context, artifact["contract"]["predictors"])
        try:
            value = float(predict_context_scores(artifact, frame)[0])
        except Exception:
            raise EstimateRejected("Estimativa indisponível no domínio 0–4.") from None
        return {"esbeu_overall": value, "model_name": artifact["contract"]["model_name"],
                "dataset_version": self.settings.dataset_version}

    def evaluate(self, cases):
        observed, predicted = [], []
        for case in cases:
            observed.append(self.observed(case.items).overall)
            predicted.append(self.predict(case.context)["esbeu_overall"])
        metrics = calculate_regression_metrics(observed, predicted)
        return {"samples": len(cases), "metrics": asdict(metrics),
                "model_name": self._load()["contract"]["model_name"],
                "dataset_version": self.settings.dataset_version}

    def info(self):
        artifact = self._load()
        return {"contract_version": artifact["contract"]["version"],
                "dataset_version": self.settings.dataset_version, "model_name": artifact["contract"]["model_name"],
                "predictors": list(artifact["contract"]["predictors"]),
                "training_records": self._manifest["eligible_records"], "runtime_versions": runtime_versions()}

    def metrics(self):
        self._load()
        return {"dataset_version": self.settings.dataset_version,
                "training_records": self._manifest["eligible_records"], "protocol": self._protocol,
                "selected_model": self._manifest["model_name"], **self._comparison,
                "metric_contract": METRIC_CONTRACT}
