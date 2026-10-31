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

    @classmethod
    def from_environment(cls):
        path = os.environ.get("BURNOUTSENSE_MODEL_DIR", "")
        return cls(Path(path) if path else None,
                   os.environ.get("BURNOUTSENSE_DATASET_VERSION", "unconfigured"),
                   os.environ.get("BURNOUTSENSE_TRUST_LOCAL_MODEL", "").lower() == "true",
                   os.environ.get("BURNOUTSENSE_API_KEY", ""))
