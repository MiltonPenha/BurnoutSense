"""Explicit local configuration: no automatic model/CSV discovery."""

from dataclasses import dataclass, field
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    model_dir: Path | None = None
    dataset_version: str = "unconfigured"
    trust_local_model: bool = False
    api_key: str = field(default="", repr=False)
    experimental_model: bool = False
    shadow_ridge_enabled: bool = False
    shadow_ridge_dir: Path | None = None
    shadow_ridge_sha256: str = ""
    trust_shadow_ridge: bool = False
    environment: str = "production"

    @classmethod
    def from_environment(cls):
        path = os.environ.get("BURNOUTSENSE_MODEL_DIR", "")
        return cls(Path(path) if path else None,
                   os.environ.get("BURNOUTSENSE_DATASET_VERSION", "unconfigured"),
                   os.environ.get("BURNOUTSENSE_TRUST_LOCAL_MODEL", "").lower() == "true",
                   os.environ.get("BURNOUTSENSE_API_KEY", ""),
                   os.environ.get("BURNOUTSENSE_EXPERIMENTAL_MODEL", "").lower() == "true",
                   os.environ.get("BURNOUTSENSE_SHADOW_RIDGE_ENABLED", "").lower() == "true",
                   Path(os.environ["BURNOUTSENSE_SHADOW_RIDGE_DIR"]) if os.environ.get("BURNOUTSENSE_SHADOW_RIDGE_DIR") else None,
                   os.environ.get("BURNOUTSENSE_SHADOW_RIDGE_SHA256", ""),
                   os.environ.get("BURNOUTSENSE_TRUST_SHADOW_RIDGE", "").lower() == "true",
                   os.environ.get("BURNOUTSENSE_ENVIRONMENT", "production"))
