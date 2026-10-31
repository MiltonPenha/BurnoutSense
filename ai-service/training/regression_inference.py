"""Private persistence and contextual inference; never loads untrusted pickle."""

from dataclasses import asdict, dataclass
import hashlib
import importlib.metadata
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.utils.validation import check_is_fitted

from training.regression_models import MODEL_NAMES, build_regression_pipeline
from training.regression_preprocessing import validate_predictors


class InferenceError(ValueError):
    """Sanitized contract, artifact or out-of-range prediction error."""


@dataclass(frozen=True)
class InferenceContract:
    version: str
    model_name: str
    predictors: tuple[str, ...]
    output_name: str = "esbeu_overall"
    output_minimum: float = 0.0
    output_maximum: float = 4.0
    out_of_range_policy: str = "reject"


def runtime_versions() -> dict[str, str]:
    return {name: importlib.metadata.version(name)
            for name in ("numpy", "pandas", "scikit-learn", "joblib")}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_private_pipeline(model: Pipeline, contract: InferenceContract, path: Path) -> str:
    """Caller controls a private directory; exclusive create prevents overwrite."""
    try:
        if Path(path).resolve().is_relative_to(Path(__file__).resolve().parents[2]):
            raise ValueError()
        selected = validate_predictors(contract.predictors)
        if (contract.version != "esbeu-context-regression/1" or contract.out_of_range_policy != "reject"
                or contract.output_name != "esbeu_overall" or contract.output_minimum != 0
                or contract.output_maximum != 4 or contract.model_name not in MODEL_NAMES
                or tuple(model.named_steps["preprocess"].named_steps["validate"].predictors) != selected
                or type(model.named_steps["regressor"]) is not type(
                    build_regression_pipeline(contract.model_name, selected).named_steps["regressor"])):
            raise ValueError()
        check_is_fitted(model.named_steps["regressor"])
        artifact = {"contract": asdict(contract), "versions": runtime_versions(), "pipeline": model}
        with Path(path).open("xb") as stream:
            joblib.dump(artifact, stream)
        return file_sha256(Path(path))
    except Exception:
        pass
    raise InferenceError("Contrato inválido ou persistência privada não concluída.")


def load_private_pipeline(path: Path, *, trusted: bool = False, expected_sha256: str) -> dict:
    """Hash verifies integrity, not trust. trusted=True requires known provenance.

    Never set trusted=True for an artifact received from an unknown source.
    A pickle can execute code while loading, before its metadata is inspected.
    """
    if trusted is not True:
        raise InferenceError("Carregamento exige origem confiável explicitamente confirmada.")
    try:
        if file_sha256(Path(path)) != expected_sha256:
            raise ValueError()
        artifact = joblib.load(path)
        contract = artifact["contract"]
        if (artifact["versions"] != runtime_versions()
                or contract["version"] != "esbeu-context-regression/1"
                or contract["out_of_range_policy"] != "reject"
                or not isinstance(artifact["pipeline"], Pipeline)):
            raise ValueError()
        validate_predictors(contract["predictors"])
        return artifact
    except Exception:
        pass
    raise InferenceError("Artefato incompatível ou sem integridade confirmada.")


def predict_context_scores(artifact: dict, X: pd.DataFrame) -> np.ndarray:
    """Return finite scores in 0-4 or reject explicitly; no silent clipping."""
    try:
        contract = artifact["contract"]
        if (not isinstance(X, pd.DataFrame) or tuple(X.columns) != tuple(contract["predictors"])
                or contract["out_of_range_policy"] != "reject"):
            raise ValueError()
        result = np.asarray(artifact["pipeline"].predict(X))
        if (result.ndim != 1 or len(result) != len(X) or result.dtype.kind not in "iuf"
                or not np.isfinite(result).all() or ((result < 0) | (result > 4)).any()):
            raise ValueError()
        return result.astype(float, copy=True)
    except Exception:
        pass
    raise InferenceError("Entrada inválida ou estimativa fora do domínio autorizado 0–4.")
