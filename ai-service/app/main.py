from fastapi import FastAPI, HTTPException

from app.predictor import BurnoutPredictor
from app.schemas import (
    HealthResponse,
    ModelInfoResponse,
    ModelMetricsResponse,
    PredictionRequest,
    PredictionResponse,
)

app = FastAPI(
    title="BurnoutSense AI Service",
    description="Prototype AI microservice for academic burnout risk classification.",
    version="0.1.0",
)

predictor = BurnoutPredictor()


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="BurnoutSense AI Service")


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: PredictionRequest) -> PredictionResponse:
    try:
        result = predictor.predict(payload)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Modelo nao encontrado. Execute: python -m training.train_model",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PredictionResponse(**result)


@app.get("/model-info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    try:
        result = predictor.model_info()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Modelo nao encontrado. Execute: python -m training.train_model",
        ) from exc

    return ModelInfoResponse(**result)


@app.get("/model-metrics", response_model=ModelMetricsResponse)
def model_metrics() -> ModelMetricsResponse:
    try:
        result = predictor.model_metrics()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Modelo nao encontrado. Execute: python -m training.train_model",
        ) from exc

    return ModelMetricsResponse(**result)
