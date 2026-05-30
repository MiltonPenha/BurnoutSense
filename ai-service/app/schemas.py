from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class PredictionRequest(BaseModel):
    study_hours: float = Field(..., ge=0, description="Daily study hours")
    sleep_quality: float = Field(..., ge=0, le=24, description="Sleep hours from the dataset column mapped to the saved feature name")
    stress_level: float = Field(..., ge=0, le=10, description="Stress level score")
    screen_time: float = Field(..., ge=0, description="Daily screen time in hours")
    social_support: float = Field(..., ge=0, le=10, description="Social support score")
    financial_stress: float = Field(..., ge=0, le=10, description="Financial stress score")
    academic_performance: float | None = Field(None, ge=0, description="Academic performance score")
    exam_pressure: float | None = Field(None, ge=0, le=10, description="Exam pressure score")
    anxiety_score: float | None = Field(None, ge=0, le=10, description="Anxiety score")
    depression_score: float | None = Field(None, ge=0, le=10, description="Depression score")
    physical_activity: float | None = Field(None, ge=0, description="Physical activity score")
    family_expectation: float | None = Field(None, ge=0, le=10, description="Family expectation score")


class PredictionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    risk_level: str
    confidence: float
    model_used: str
    main_factors: list[str]


class ModelMetricsSummary(BaseModel):
    accuracy: float | None = None
    balanced_accuracy: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    precision_macro: float | None = None
    recall_macro: float | None = None
    f1_macro: float | None = None
    high_precision: float | None = None
    high_recall: float | None = None
    high_f1_score: float | None = None


class ClassMetrics(BaseModel):
    precision: float
    recall: float
    f1_score: float
    support: int


class ModelInfoResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_name: str
    training_strategy: str
    target_column: str
    risk_classes: list[str]
    feature_count: int
    feature_names: list[str]
    dataset_source: str
    training_records: int | None = None
    trained_at: str | None = None
    metrics_summary: ModelMetricsSummary
    quality_targets: dict[str, float] = Field(default_factory=dict)
    quality_targets_met: dict[str, bool] = Field(default_factory=dict)
    feature_importance: list[dict] = Field(default_factory=list)
    purpose: str
    clinical_disclaimer: str


class ModelMetricsResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_name: str
    training_strategy: str
    metrics_summary: ModelMetricsSummary
    per_class_metrics: dict[str, ClassMetrics]
    confusion_matrix: list[list[int]]
    confusion_matrix_labels: list[str]
    quality_targets: dict[str, float] = Field(default_factory=dict)
    quality_targets_met: dict[str, bool] = Field(default_factory=dict)
