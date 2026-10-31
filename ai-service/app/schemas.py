"""HTTP contracts for contextual ESB-eu regression only."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ModelName = Literal["dummy", "linear", "ridge", "random_forest", "svr"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class PredictionRequest(ApiModel):
    context: dict[str, object]


class ObservedScoreRequest(ApiModel):
    items: dict[str, object]


class EvaluationCase(PredictionRequest):
    items: dict[str, object]


class EvaluationRequest(ApiModel):
    cases: list[EvaluationCase] = Field(min_length=1, max_length=100)


class PredictionResponse(ApiModel):
    kind: Literal["estimated_score"] = "estimated_score"
    esbeu_overall: float = Field(ge=0, le=4)
    model_name: ModelName
    dataset_version: str
    model_version: str
    contract_version: str = "esbeu-context-regression/1"


class ObservedScoreResponse(ApiModel):
    kind: Literal["observed_score"] = "observed_score"
    overall: float = Field(ge=0, le=4)
    emotional_physical_exhaustion: float = Field(ge=0, le=4)
    distancing: float = Field(ge=0, le=4)
    training_inefficacy: float = Field(ge=0, le=4)


class MetricStats(ApiModel):
    mean: float | None
    std: float | None = Field(ge=0)
    valid_folds: int = Field(ge=0)
    undefined_folds: int = Field(ge=0)
    failed_folds: int = Field(ge=0)


class FamilyMetrics(ApiModel):
    name: ModelName | Literal["inner_selection_procedure"]
    mae: MetricStats
    rmse: MetricStats
    r2: MetricStats


class SampleMetrics(ApiModel):
    mae: float = Field(ge=0)
    rmse: float = Field(ge=0)
    r2: float | None
    r2_undefined_reason: Literal["test_size_lt_2", "constant_target"] | None


class EvaluationResponse(ApiModel):
    scope: Literal["caller_examples_not_cross_validation"] = "caller_examples_not_cross_validation"
    samples: int
    metrics: SampleMetrics
    model_name: ModelName
    dataset_version: str


class CompareResponse(PredictionResponse):
    observed_overall: float = Field(ge=0, le=4)
    absolute_error: float = Field(ge=0)


class MetricsResponse(ApiModel):
    scope: Literal["final_internal_nested_cross_validation"] = "final_internal_nested_cross_validation"
    dataset_version: str
    training_records: int
    protocol: dict[str, int]
    selected_model: ModelName
    family_comparisons: list[FamilyMetrics]
    selection_procedure: FamilyMetrics
    metric_contract: dict[str, dict[str, str | float]]


class ModelInfoResponse(ApiModel):
    contract_version: str
    dataset_version: str
    model_name: ModelName
    model_version: str
    target: Literal["esbeu_overall"] = "esbeu_overall"
    predictors: list[str]
    training_records: int
    output_minimum: float = 0.0
    output_maximum: float = 4.0
    out_of_range_policy: Literal["reject"] = "reject"
    validation_scope: Literal["internal_nested_cross_validation"] = "internal_nested_cross_validation"
    runtime_versions: dict[str, str]
