"""Independent FastAPI service for the Forms/ESB-eu methodology."""

from dataclasses import asdict
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader

from app.examples import synthetic_case, synthetic_context
from app.predictor import EstimateRejected, InputRejected, ModelUnavailable, RegressionService
from app.schemas import (
    CompareResponse, EvaluationCase, EvaluationRequest, EvaluationResponse, MetricsResponse,
    ModelInfoResponse, ObservedScoreRequest, ObservedScoreResponse, PredictionRequest, PredictionResponse,
)
from app.settings import Settings
from training.form_schema import CONTEXT_FIELDS, ESBEU_FIELDS, FIELDS_BY_ID, SpecialValue
from training.regression_preprocessing import ALLOWED_PREDICTORS


class BodyLimitMiddleware:
    """Enforce the bound even when Content-Length is missing or misleading."""
    def __init__(self, app, maximum=262144):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        messages, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.maximum:
                response = JSONResponse(status_code=413, content={"detail": {"code": "REQUEST_TOO_LARGE"}},
                                        headers={"Cache-Control": "no-store"})
                return await response(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        position = 0

        async def replay():
            nonlocal position
            if position < len(messages):
                value = messages[position]
                position += 1
                return value
            return await receive()

        await self.app(scope, replay, send)


def context_schema(predictors=ALLOWED_PREDICTORS):
    properties = {}
    for key in predictors:
        field = FIELDS_BY_ID[key]
        entry = {"title": field.name, "type": {"category": "string", "integer": "integer", "number": "number"}[field.data_type]}
        if field.choices:
            entry["enum"] = list(field.choices)
        if field.allows_not_applicable:
            entry = {"title": field.name, "anyOf": [entry, {"type": "string", "const": SpecialValue.NOT_APPLICABLE.value}]}
        if field.minimum is not None:
            entry["minimum"] = field.minimum
        if field.maximum is not None:
            entry["maximum"] = field.maximum
        properties[key] = entry
    result = {"type": "object", "additionalProperties": False, "required": list(predictors), "properties": properties}
    if {"employment", "work_hours_week"} <= set(predictors):
        result["allOf"] = [{"if": {"properties": {"employment": {"const": FIELDS_BY_ID["employment"].choices[0]}},
                                     "required": ["employment"]},
                             "then": {"properties": {"work_hours_week": {"const": 0}}}}]
    return result


def create_app(settings=None, service=None):
    config = settings if settings is not None else Settings.from_environment()
    model = service if service is not None else RegressionService(config)
    api = FastAPI(title="BurnoutSense ESB-eu Regression", version="1.0.0",
                  description="Microsserviço independente. Contexto estima ESB-eu 0–4; itens calculam escore observado. Sem diagnóstico.")
    api.add_middleware(BodyLimitMiddleware)
    key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

    def authorized(key=Depends(key_header)):
        if len(config.api_key) < 24:
            raise HTTPException(503, detail={"code": "API_KEY_NOT_CONFIGURED"})
        if key is None or not secrets.compare_digest(key.encode("utf-8"), config.api_key.encode("utf-8")):
            raise HTTPException(401, detail={"code": "INVALID_API_KEY"})

    private = [Depends(authorized)]

    @api.exception_handler(RequestValidationError)
    async def request_invalid(request: Request, error: RequestValidationError):
        # Pydantic's default response includes input values. Never echo them.
        return JSONResponse(status_code=422, content={"detail": {"code": "INVALID_REQUEST", "message": "Confira o contrato da requisição."}})

    @api.exception_handler(InputRejected)
    async def invalid_context(request: Request, error: InputRejected):
        return JSONResponse(status_code=422, content={"detail": {"code": "INVALID_INPUT", "message": str(error)}})

    @api.exception_handler(EstimateRejected)
    async def invalid_estimate(request: Request, error: EstimateRejected):
        return JSONResponse(status_code=422, content={"detail": {"code": "ESTIMATE_OUTSIDE_DOMAIN", "message": "Estimativa não disponível no domínio 0–4."}})

    @api.exception_handler(ModelUnavailable)
    async def unavailable(request: Request, error: ModelUnavailable):
        return JSONResponse(status_code=503, content={"detail": {"code": "MODEL_UNAVAILABLE"}})

    @api.middleware("http")
    async def request_limit(request: Request, call_next):
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": {"code": "INVALID_LENGTH"}})
        if size < 0 or size > 262144:
            return JSONResponse(status_code=413, content={"detail": {"code": "REQUEST_TOO_LARGE"}})
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @api.get("/health")
    def health():
        return {"status": "ok", "service": "burnoutsense-esbeu", "api_version": "1.0.0"}

    @api.get("/ready", dependencies=private)
    def ready():
        model.info()
        return {"status": "ready", "methodology": "esbeu_context_regression"}

    @api.get("/v1/schema", dependencies=private)
    def schema():
        return {"contract_version": "esbeu-context-regression/1", "context": context_schema(),
                "form_version": "forms/1.0",
                "fields": [{"identifier": f.identifier, "name": f.name, "question": f.question,
                            "group": f.group, "data_type": f.data_type, "choices": list(f.choices),
                            "labels": list(f.labels), "minimum": f.minimum, "maximum": f.maximum,
                            "unit": f.unit, "allows_not_applicable": f.allows_not_applicable,
                            "instructions": f.instructions} for f in (*CONTEXT_FIELDS, *ESBEU_FIELDS)],
                "items": {"type": "object", "additionalProperties": False,
                          "required": [f.identifier for f in ESBEU_FIELDS],
                          "properties": {f.identifier: {"type": "integer", "minimum": 0, "maximum": 4} for f in ESBEU_FIELDS}}}

    @api.get("/v1/examples", dependencies=private)
    def examples():
        return {"data_origin": "synthetic_schema_examples", "prediction_request": {"context": synthetic_context()},
                "comparison_request": synthetic_case(), "evaluation_request": {"cases": [synthetic_case()]}}

    @api.get("/v1/model", response_model=ModelInfoResponse, dependencies=private)
    def info():
        return model.info()

    @api.get("/v1/validation/metrics", response_model=MetricsResponse, dependencies=private)
    def metrics():
        return model.metrics()

    @api.post("/v1/context/validate", dependencies=private)
    def validate(payload: PredictionRequest):
        model.context_frame(payload.context)
        return {"valid": True, "predictor_count": len(ALLOWED_PREDICTORS)}

    @api.post("/v1/predict", response_model=PredictionResponse, dependencies=private)
    def predict(payload: PredictionRequest):
        return model.predict(payload.context)

    @api.post("/v1/esbeu/score", response_model=ObservedScoreResponse, dependencies=private)
    def observed(payload: ObservedScoreRequest):
        return asdict(model.observed(payload.items))

    @api.post("/v1/validation/compare", response_model=CompareResponse, dependencies=private)
    def compare(payload: EvaluationCase):
        observed_score = model.observed(payload.items).overall
        prediction = model.predict(payload.context)
        return {**prediction, "observed_overall": observed_score,
                "absolute_error": abs(observed_score - prediction["esbeu_overall"])}

    @api.post("/v1/validation/evaluate", response_model=EvaluationResponse, dependencies=private)
    def evaluate(payload: EvaluationRequest):
        return model.evaluate(payload.cases)

    return api


app = create_app()
