"""Aggregate-only audit of admitted research records; no file or row output."""

from collections import Counter
from dataclasses import dataclass
from statistics import mean, stdev

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ANALYTICAL_FIELDS, FIELDS_BY_ID
from training.import_forms import ImportResult
from training.regression_preprocessing import ALLOWED_PREDICTORS, validate_predictors


@dataclass(frozen=True)
class DistributionSummary:
    count: int
    mean: float | None
    std: float | None
    distinct_values: int


@dataclass(frozen=True)
class CategorySummary:
    field: str
    schema_levels: int
    observed_levels: int
    levels_with_fewer_than_five_records: int


@dataclass(frozen=True)
class ResearchAudit:
    rows_read: int
    eligible: int
    ineligible: int
    rejected: int
    identical_analytical_rows_beyond_first: int
    predictors: tuple[str, ...]
    transformed_columns: int
    rejected_first_issue_counts: tuple[tuple[str, int], ...]
    outcome_distributions: tuple[tuple[str, DistributionSummary], ...]
    category_coverage: tuple[CategorySummary, ...]


def audit_import(result: ImportResult, predictors=ALLOWED_PREDICTORS) -> ResearchAudit:
    """Summarize canonical imported records without exposing individual answers.

    Identical analytical rows are NOT assumed to identify the same person and
    are never deleted. Category frequencies below five are counted as levels,
    without disclosing their labels/counts. Admitted records have no missing
    required fields by contract; issue counts describe ONLY the first rejected
    field, not total missingness across raw cells. No statistical fit occurs.
    """
    selected = validate_predictors(predictors)
    records = result.records
    signatures = Counter(tuple(record[field.identifier] for field in ANALYTICAL_FIELDS)
                         for record in records)
    duplicate_count = sum(count - 1 for count in signatures.values())
    scores = [calculate_esbeu_scores(record) for record in records]
    distributions = []
    for attribute in ("overall", "emotional_physical_exhaustion", "distancing", "training_inefficacy"):
        values = [getattr(score, attribute) for score in scores]
        distributions.append((attribute, DistributionSummary(
            len(values), float(mean(values)) if values else None,
            float(stdev(values)) if len(values) > 1 else None, len(set(values)),
        )))
    coverage, width = [], 0
    for key in selected:
        field = FIELDS_BY_ID[key]
        if field.nature == "nominal" or field.allows_not_applicable:
            levels = len(field.choices) + int(field.allows_not_applicable)
            width += levels
            counts = Counter(record[key] for record in records)
            coverage.append(CategorySummary(key, levels, len(counts),
                                            sum(count < 5 for count in counts.values())))
        else:
            width += 1
    issues = Counter(issue.field_id if issue.field_id in FIELDS_BY_ID else "record"
                     for issue in result.issues if issue.kind == "invalid")
    return ResearchAudit(result.rows_read, result.eligible_count, result.ineligible_count,
                         result.rejected_count, duplicate_count, selected, width,
                         tuple(sorted(issues.items())), tuple(distributions), tuple(coverage))
