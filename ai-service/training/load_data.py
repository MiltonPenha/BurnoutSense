from pathlib import Path

import numpy as np
import pandas as pd


DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[1] / "dataset" / "student_mental_health_burnout_1M.csv"


def load_dataset(dataset_path: str | Path = DEFAULT_DATASET_PATH) -> pd.DataFrame:
    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(
            "Dataset nao encontrado em "
            f"{path}. Baixe o CSV do Kaggle e salve como "
            "dataset/student_mental_health_burnout_1M.csv."
        )

    return pd.read_csv(path)


def build_demo_dataset() -> pd.DataFrame:
    """Small synthetic sample used only to keep the TCC 1 prototype runnable without Kaggle credentials."""
    feature_names = [
        "study_hours",
        "sleep_quality",
        "stress_level",
        "screen_time",
        "social_support",
        "financial_stress",
    ]
    features = np.array(
        [
            [2, 9, 1, 2, 9, 1],
            [3, 8, 2, 3, 8, 2],
            [4, 7, 3, 4, 7, 2],
            [5, 6, 4, 5, 6, 3],
            [6, 5, 5, 6, 5, 4],
            [7, 4, 6, 7, 4, 5],
            [8, 3, 7, 8, 3, 6],
            [9, 2, 8, 9, 2, 7],
            [10, 2, 9, 10, 1, 8],
            [6, 3, 8, 6, 2, 9],
            [4, 5, 5, 8, 4, 6],
            [3, 8, 2, 6, 8, 1],
            [7, 4, 7, 5, 3, 7],
            [5, 7, 4, 4, 6, 5],
            [2, 6, 3, 5, 7, 3],
        ],
        dtype=float,
    )
    labels = [
        "low",
        "low",
        "low",
        "medium",
        "medium",
        "medium",
        "high",
        "high",
        "high",
        "high",
        "medium",
        "low",
        "high",
        "medium",
        "low",
    ]

    df = pd.DataFrame(features, columns=feature_names)
    df["risk_level"] = labels
    return df
