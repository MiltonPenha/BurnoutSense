"""Continuous ESB-eu means; no diagnosis, thresholds or risk classification."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

from training.form_schema import (
    ESBEU_BY_DIMENSION,
    ESBEU_FIELDS,
    Dimension,
    validate_value,
)


@dataclass(frozen=True)
class EsbeuScores:
    """Unrounded arithmetic means in the original 0–4 scale."""

    overall: float
    emotional_physical_exhaustion: float
    distancing: float
    training_inefficacy: float


def calculate_esbeu_scores(record: Mapping[str, object]) -> EsbeuScores:
    """Require all 14 canonical items, even when given an already valid record.

    Additional fields are ignored, never copied to the result. This function
    validates only scale items; consent/eligibility belongs to validate_record
    in form_schema. Missing or invalid items raise ResponseValidationError
    without echoing the submitted value. The input is never modified.
    """
    values = {
        field.identifier: cast(
            int, validate_value(field.identifier, record.get(field.identifier))
        )
        for field in ESBEU_FIELDS
    }
    means = {
        dimension: sum(values[item] for item in items) / len(items)
        for dimension, items in ESBEU_BY_DIMENSION.items()
    }
    return EsbeuScores(
        overall=sum(values.values()) / len(values),
        emotional_physical_exhaustion=means[Dimension.DEF],
        distancing=means[Dimension.DIST],
        training_inefficacy=means[Dimension.INEF],
    )
