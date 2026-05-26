import pandas as pd

from training.preprocess import find_target_column, standardize_columns


def exploratory_summary(df: pd.DataFrame) -> dict:
    data = standardize_columns(df)
    summary = {
        "records": len(data),
        "columns": list(data.columns),
        "dtypes": {column: str(dtype) for column, dtype in data.dtypes.items()},
        "missing_values": data.isna().sum().to_dict(),
    }

    try:
        target = find_target_column(data)
        summary["target_column"] = target
        summary["target_distribution"] = data[target].value_counts(dropna=False).to_dict()
        summary["risk_classes"] = sorted(data[target].dropna().astype(str).unique().tolist())
    except ValueError:
        summary["target_column"] = None
        summary["target_distribution"] = {}
        summary["risk_classes"] = []

    return summary
