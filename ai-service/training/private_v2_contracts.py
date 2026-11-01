"""Operational contracts only. No CSV reader, executor, CLI, fit or authorization."""

from dataclasses import asdict, dataclass, field
from enum import Enum
import hashlib
import json
from math import isfinite
from pathlib import Path
import re
from typing import Any, Mapping

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVR

from training.optimization_v2 import (
    FAMILIES, PREDICTOR_SETS, SelectContext, V2Candidate, build_candidate, default_candidates,
)
from training.optimization_v2_comparison import compare_predictor_sets
from training.optimization_v2_validation import verify_optimization_v2
from training.regression_experiments import Candidate
from training.regression_preprocessing import ContextFrameValidator


PROTOCOL_SHA256 = "cd35d67156e4a1a07ff25df4862f565c477d53ddef44143db0d5ee49b8c2260f"
SETS = (
    ("A", ("age_range", "course_area", "semester", "course_shift", "subject_count",
           "mandatory_hours_week", "independent_hours_week", "employment", "work_hours_week",
           "sleep_hours", "sleep_quality", "physical_activity_days", "subject_overload",
           "assessment_pressure", "extraclass_overload", "study_rest_difficulty",
           "study_work_difficulty", "teacher_difficulties", "peer_difficulties",
           "personal_support", "academic_support", "financial_concern")),
    ("B", ("mandatory_hours_week", "independent_hours_week", "sleep_hours", "sleep_quality",
           "subject_overload", "assessment_pressure", "extraclass_overload",
           "study_rest_difficulty", "study_work_difficulty", "personal_support",
           "academic_support", "financial_concern")),
    ("C", ("sleep_hours", "sleep_quality", "subject_overload", "assessment_pressure",
           "study_rest_difficulty", "personal_support", "financial_concern")),
)
MODELS = (
    Candidate("dummy"), Candidate("ridge", (("alpha", 1.0),)),
    Candidate("ridge", (("alpha", 10.0),)),
    Candidate("random_forest", (("max_depth", 2), ("min_samples_leaf", 3))),
    Candidate("random_forest", (("max_depth", 3), ("min_samples_leaf", 3))),
    Candidate("svr", (("C", 0.1), ("kernel", "rbf"))),
    Candidate("svr", (("C", 1.0), ("kernel", "rbf"))),
)
CATALOG = tuple(V2Candidate(s, m) for s, _ in SETS for m in MODELS)
REQUIRED_MODULES = frozenset(
    f"training/{name}.py" for name in (
        "form_schema", "import_forms", "esbeu_scoring", "regression_preprocessing",
        "regression_models", "regression_evaluation", "regression_experiments",
        "optimization_v2", "optimization_v2_validation", "optimization_v2_comparison",
        "private_v2_contracts"))
PINNED = {"numpy": "1.26.4", "pandas": "2.2.2", "scikit-learn": "1.5.1",
          "joblib": "1.4.2", "fastapi": "0.111.0", "uvicorn": "0.30.1", "httpx": "0.28.1"}

# Literal reference from the frozen protocol/sklearn 1.5.1, NOT from a second
# invocation of the scientific builders. No fitting is needed to inspect it.
ESTIMATOR_REFERENCE = {
    "dummy": (DummyRegressor, dict(constant=None, quantile=None, strategy="mean")),
    "ridge": (Ridge, dict(alpha=1.0, copy_X=True, fit_intercept=True, max_iter=None,
                         positive=False, random_state=42, solver="auto", tol=1e-4)),
    "random_forest": (RandomForestRegressor, dict(
        bootstrap=True, ccp_alpha=0.0, criterion="squared_error", max_depth=2,
        max_features=1.0, max_leaf_nodes=None, max_samples=None, min_impurity_decrease=0.0,
        min_samples_leaf=3, min_samples_split=2, min_weight_fraction_leaf=0.0,
        monotonic_cst=None, n_estimators=100, n_jobs=1, oob_score=False,
        random_state=42, verbose=0, warm_start=False)),
    "svr": (SVR, dict(C=0.1, cache_size=200, coef0=0.0, degree=3, epsilon=0.1,
                     gamma="scale", kernel="rbf", max_iter=-1, shrinking=True,
                     tol=0.001, verbose=False)),
}
CATEGORY_REFERENCE = {
    "course_area": ("Engenharias e Tecnologia", "Ciências Exatas", "Ciências da Saúde",
                    "Ciências Humanas e Sociais", "Administração, Gestão e Negócios",
                    "Comunicação e Artes", "Outra"),
    "course_shift": ("Matutino", "Vespertino", "Noturno", "Integral", "Outro"),
    "employment": ("Não, apenas estudo", "Sim, trabalho remunerado", "Sim, estágio",
                   "Sim, exerço mais de uma atividade profissional"),
    "study_work_difficulty": ("0", "1", "2", "3", "4", "Não se aplica"),
}


class ContractError(ValueError):
    """Fixed code, without values, paths, exception payloads or personal data."""


def _require(condition, code):
    if not condition:
        raise ContractError(code)


def _json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)


def _hash(value, length=64):
    return type(value) is str and re.fullmatch(f"[0-9a-f]{{{length}}}", value) is not None


def _literal_match(value, reference):
    """Traverse the bounded REFERENCE shape, never an arbitrary input graph.

    Exact types reject mutable replacements, bool/int equality and subclasses.
    A cyclic/deep input mismatches a leaf before any recursive conversion.
    """
    if type(value) is not type(reference):
        return False
    if type(reference) in (tuple, list):
        return len(value) == len(reference) and all(
            _literal_match(v, r) for v, r in zip(value, reference))
    if type(reference) is dict:
        return (all(type(k) is str for k in value) and value.keys() == reference.keys()
                and all(_literal_match(value[k], reference[k]) for k in reference))
    if type(reference) in (Candidate, V2Candidate):
        return _literal_match(vars(value), vars(reference))
    if type(reference) is type:
        return value is reference
    return type(reference) in (str, int, float, bool, type(None)) and value == reference


def _string_pairs(value):
    """Reject mutable/deep/cyclic mappings before dict construction."""
    _require(type(value) is tuple and len(value) <= 1000, "INVALID_MANIFEST")
    for pair in value:
        _require(type(pair) is tuple and len(pair) == 2
                 and all(type(v) is str for v in pair), "INVALID_MANIFEST")
    result = dict(value)
    _require(len(result) == len(value), "INVALID_MANIFEST")
    return result


def _json_tree(value):
    """Iterative JSON-shape check BEFORE dumps/asdict/verification; aliases allowed."""
    stack = [(value, 0, False)]
    active = set()
    nodes = 0
    while stack:
        item, depth, leaving = stack.pop()
        if leaving:
            active.remove(id(item))
            continue
        nodes += 1
        _require(depth <= 32 and nodes <= 200000, "INVALID_OUTPUT_SCHEMA")
        kind = type(item)
        if kind in (dict, list, tuple):
            _require(id(item) not in active, "INVALID_OUTPUT_SCHEMA")
            active.add(id(item))
            stack.append((item, depth, True))
            if kind is dict:
                _require(all(type(k) is str for k in item), "INVALID_OUTPUT_SCHEMA")
                children = item.values()
            else:
                children = item
            _require(len(item) <= 200000, "INVALID_OUTPUT_SCHEMA")
            stack.extend((child, depth + 1, False) for child in children)
        else:
            _require(kind in (str, int, float, bool, type(None)), "INVALID_OUTPUT_SCHEMA")
            if kind in (int, float):
                _require(isfinite(item), "INVALID_OUTPUT_SCHEMA")


@dataclass(frozen=True)
class FrozenEvaluationConfig:
    outer_splits: int = 5
    inner_splits: int = 3
    outer_repeats: int = 3
    random_state: int = 42
    predictor_sets: tuple[tuple[str, tuple[str, ...]], ...] = SETS
    candidates: tuple[V2Candidate, ...] = CATALOG


def validate_config(config: FrozenEvaluationConfig) -> None:
    try:
        _validate_config(config)
    except (TypeError, ValueError, AttributeError, OverflowError):
        pass
    else:
        return
    raise ContractError("INVALID_CONFIG")


def _validate_config(config: FrozenEvaluationConfig) -> None:
    _require(type(config) is FrozenEvaluationConfig, "INVALID_CONFIG")
    values = (config.outer_splits, config.inner_splits, config.outer_repeats, config.random_state)
    _require(all(type(v) is int for v in values) and values == (5, 3, 3, 42), "INVALID_CONFIG")
    _require(_literal_match(config.predictor_sets, SETS)
             and _literal_match(config.candidates, CATALOG), "INVALID_CONFIG")
    _require(_literal_match(tuple(PREDICTOR_SETS.items()), SETS)
             and _literal_match(default_candidates(), CATALOG),
             "IMPLEMENTATION_DRIFT")
    for candidate in config.candidates:
        _validate_effective_pipeline(candidate)


def _pipeline_steps(pipeline, names):
    _require(type(pipeline) is Pipeline, "IMPLEMENTATION_DRIFT")
    settings = pipeline.get_params(deep=False).copy()
    steps = settings.pop("steps")
    _require(_literal_match(settings, dict(memory=None, verbose=False))
             and type(steps) is list and len(steps) == len(names), "IMPLEMENTATION_DRIFT")
    _require(all(type(step) is tuple and len(step) == 2 and type(step[0]) is str
                 and step[0] == name for step, name in zip(steps, names)), "IMPLEMENTATION_DRIFT")
    return tuple(step[1] for step in steps)


def _validate_effective_pipeline(candidate):
    selected = dict(SETS)[candidate.subset]
    selector, model = _pipeline_steps(build_candidate(candidate, 42), ("select", "model"))
    _require(type(selector) is SelectContext
             and _literal_match(selector.get_params(deep=False), dict(predictors=selected)), "IMPLEMENTATION_DRIFT")
    preprocess, regressor = _pipeline_steps(model, ("preprocess", "regressor"))
    cls, base = ESTIMATOR_REFERENCE[candidate.model.name]
    expected = {**base, **dict(candidate.model.parameters)}
    _require(type(regressor) is cls
             and _literal_match(regressor.get_params(deep=False), expected), "IMPLEMENTATION_DRIFT")
    validator, columns = _pipeline_steps(preprocess, ("validate", "columns"))
    _require(type(validator) is ContextFrameValidator
             and _literal_match(validator.get_params(deep=False), dict(predictors=selected)), "IMPLEMENTATION_DRIFT")
    _require(type(columns) is ColumnTransformer, "IMPLEMENTATION_DRIFT")
    settings = columns.get_params(deep=False).copy()
    transformers = settings.pop("transformers")
    _require(_literal_match(settings, dict(force_int_remainder_cols=True, n_jobs=None,
        remainder="drop", sparse_threshold=0.3, transformer_weights=None,
        verbose=False, verbose_feature_names_out=True)), "IMPLEMENTATION_DRIFT")
    categorical = [key for key in selected if key in CATEGORY_REFERENCE]
    numeric = [key for key in selected if key not in CATEGORY_REFERENCE]
    _require(type(transformers) is list and len(transformers) == 2, "IMPLEMENTATION_DRIFT")
    for entry, label, keys, transformer_type in zip(transformers, ("numeric", "categorical"),
                                                   (numeric, categorical), (StandardScaler, OneHotEncoder)):
        _require(type(entry) is tuple and len(entry) == 3 and entry[0] == label
                 and _literal_match(entry[2], keys) and type(entry[1]) is transformer_type, "IMPLEMENTATION_DRIFT")
        params = entry[1].get_params(deep=False)
        expected = (dict(copy=True, with_mean=True, with_std=True) if label == "numeric" else
                    dict(categories=[list(CATEGORY_REFERENCE[k]) for k in categorical], drop=None,
                         dtype=np.float64, feature_name_combiner="concat", handle_unknown="error",
                         max_categories=None, min_frequency=None, sparse_output=False))
        _require(_literal_match(params, expected), "IMPLEMENTATION_DRIFT")


def validate_protocol_bytes(payload: bytes) -> str:
    """Caller supplies DOCUMENT bytes, never a participant file. No file I/O."""
    _require(type(payload) is bytes, "INVALID_PROTOCOL")
    # Git may check Markdown out as CRLF. Compare its normalized text bytes.
    digest = hashlib.sha256(payload.replace(b"\r\n", b"\n")).hexdigest()
    _require(digest == PROTOCOL_SHA256, "PROTOCOL_CHANGED")
    return digest


class InstitutionalReview(str, Enum):
    NOT_VERIFIED = "not_verified"
    RECORDED_BY_HUMAN = "recorded_by_human"


class PopulationReview(str, Enum):
    NOT_REVIEWED = "not_reviewed"
    RECORDED_BY_HUMAN = "recorded_by_human"


class ExecutionState(str, Enum):
    PLANNED = "planned"
    PREFLIGHT_FAILED = "preflight_failed"
    AWAITING_INSTITUTION = "awaiting_institution"
    AWAITING_POPULATION = "awaiting_population"
    EXPERIMENT_NOT_IMPLEMENTED = "experiment_not_implemented"


@dataclass(frozen=True)
class HumanReviewRecord:
    institutional: InstitutionalReview = InstitutionalReview.NOT_VERIFIED
    population: PopulationReview = PopulationReview.NOT_REVIEWED
    institutional_evidence_sha256: str | None = None
    population_evidence_sha256: str | None = None


def validate_human_review(review: HumanReviewRecord) -> None:
    _require(type(review) is HumanReviewRecord
             and type(review.institutional) is InstitutionalReview
             and type(review.population) is PopulationReview, "INVALID_REVIEW_RECORD")
    for recorded, digest in (
        (review.institutional is InstitutionalReview.RECORDED_BY_HUMAN, review.institutional_evidence_sha256),
        (review.population is PopulationReview.RECORDED_BY_HUMAN, review.population_evidence_sha256),
    ):
        _require(_hash(digest) if recorded else digest is None, "INVALID_REVIEW_RECORD")
    _require(review.population is PopulationReview.NOT_REVIEWED
             or review.institutional is InstitutionalReview.RECORDED_BY_HUMAN, "INVALID_REVIEW_ORDER")


@dataclass(frozen=True)
class OperationalPreflight:
    checks_passed: bool
    issues: tuple[str, ...] = ()
    real_execution_enabled: bool = field(default=False, init=False)


ISSUES = frozenset({"config_invalid", "protocol_changed", "unsafe_paths", "environment_mismatch"})


def validate_preflight(result: OperationalPreflight) -> None:
    _require(type(result) is OperationalPreflight and type(result.checks_passed) is bool
             and type(result.issues) is tuple and all(type(v) is str and v in ISSUES for v in result.issues)
             and len(set(result.issues)) == len(result.issues)
             and result.checks_passed == (not result.issues)
             and result.real_execution_enabled is False, "INVALID_PREFLIGHT")


def preparation_state(result: OperationalPreflight, review: HumanReviewRecord) -> ExecutionState:
    """Classifies preparation only. Even all checks never return an executable state."""
    validate_preflight(result)
    validate_human_review(review)
    if not result.checks_passed:
        return ExecutionState.PREFLIGHT_FAILED
    if review.institutional is InstitutionalReview.NOT_VERIFIED:
        return ExecutionState.AWAITING_INSTITUTION
    if review.population is PopulationReview.NOT_REVIEWED:
        return ExecutionState.AWAITING_POPULATION
    return ExecutionState.EXPERIMENT_NOT_IMPLEMENTED


@dataclass(frozen=True)
class SafeDestinations:
    source: Path
    output: Path


def validate_paths(source: Path, output: Path, *, repository: Path, private_root: Path) -> SafeDestinations:
    """Metadata-only check. Opens no input and reserves/writes nothing; not race-safe."""
    try:
        raw = tuple(Path(p).absolute() for p in (source, output, repository, private_root))
        for path in (raw[0], raw[1], raw[3]):
            for ancestor in (path, *path.parents):
                if ancestor.exists() or ancestor.is_symlink():
                    _require(not ancestor.is_symlink()
                             and not (getattr(ancestor.lstat(), "st_file_attributes", 0) & 0x400), "UNSAFE_PATHS")
        src, out, repo, root = (p.resolve() for p in raw)
        _require(root.is_dir() and not root.is_relative_to(repo), "UNSAFE_PATHS")
        _require(all(p.is_relative_to(root) and not p.is_relative_to(repo) for p in (src, out)), "UNSAFE_PATHS")
        _require(src.is_file() and not out.exists() and out.parent.is_dir()
                 and src != out and not src.is_relative_to(out) and not out.is_relative_to(src), "UNSAFE_PATHS")
        for path in (src, out):
            _require(not any((p / ".git").exists() for p in path.parents), "UNSAFE_PATHS")
        return SafeDestinations(src, out)
    except (OSError, RuntimeError, ValueError, TypeError):
        pass
    raise ContractError("UNSAFE_PATHS")


@dataclass(frozen=True)
class ProvenanceManifest:
    git_commit: str
    working_tree_dirty: bool
    protocol_sha256: str
    config: FrozenEvaluationConfig
    source_sha256: tuple[tuple[str, str], ...]
    libraries: tuple[tuple[str, str], ...]
    python_version: str
    environment_sha256: str
    input_sha256: str
    ordered_population_commitment: str
    partitions_commitment: str
    comparison_version: str
    preflight: OperationalPreflight
    human_review: HumanReviewRecord
    state: ExecutionState
    output_sha256: tuple[tuple[str, str], ...] = ()
    real_execution_enabled: bool = field(default=False, init=False)


def validate_manifest(manifest: ProvenanceManifest) -> None:
    """Validates supplied metadata; does not authenticate it or read its claimed sources."""
    try:
        _require(type(manifest) is ProvenanceManifest, "INVALID_MANIFEST")
        validate_config(manifest.config)
        validate_preflight(manifest.preflight)
        validate_human_review(manifest.human_review)
        _require(type(manifest.state) is ExecutionState
                 and manifest.state is preparation_state(manifest.preflight, manifest.human_review), "INVALID_STATE")
        _require(_hash(manifest.git_commit, 40) and manifest.working_tree_dirty is False
                 and manifest.real_execution_enabled is False
                 and type(manifest.protocol_sha256) is str
                 and manifest.protocol_sha256 == PROTOCOL_SHA256, "INVALID_MANIFEST")
        for value in (manifest.environment_sha256, manifest.input_sha256,
                      manifest.ordered_population_commitment, manifest.partitions_commitment):
            _require(_hash(value), "INVALID_MANIFEST")
        modules, libraries = _string_pairs(manifest.source_sha256), _string_pairs(manifest.libraries)
        output_hashes = _string_pairs(manifest.output_sha256)
        _require(len(output_hashes) == len(manifest.output_sha256)
                 and (not output_hashes or set(output_hashes) == {"report", "verification", "comparison"})
                 and all(_hash(v) for v in output_hashes.values()), "INVALID_MANIFEST")
        _require(len(modules) == len(manifest.source_sha256) and set(modules) == REQUIRED_MODULES
                 and all(_hash(v) for v in modules.values()), "INVALID_MANIFEST")
        _require(len(libraries) == len(manifest.libraries) and libraries == PINNED
                 and type(manifest.python_version) is str
                 and re.fullmatch(r"3\.12\.[0-9]+", manifest.python_version) is not None
                 and type(manifest.comparison_version) is str
                 and manifest.comparison_version == "ml-optimization-v2-contrasts/1", "INVALID_MANIFEST")
    except (TypeError, ValueError, AttributeError):
        pass
    else:
        return
    raise ContractError("INVALID_MANIFEST")


@dataclass(frozen=True)
class AggregateOutputs:
    report: Mapping[str, Any]
    verification: Mapping[str, Any]
    comparison: Mapping[str, Any]


def _keys(value, required, optional=()):
    _require(type(value) is dict and set(required) <= set(value)
             and set(value) <= set(required) | set(optional), "INVALID_OUTPUT_SCHEMA")


def _enum(value, allowed):
    _require(any(type(value) is type(v) and value == v for v in allowed), "INVALID_OUTPUT_SCHEMA")


def _candidate(value):
    _require(any(_json(value) == _json(asdict(c)) for c in CATALOG), "INVALID_OUTPUT_SCHEMA")


def _aggregate(value):
    _keys(value, ("mean", "std", "valid_folds", "undefined_folds", "failed_folds"))
    for k in ("mean", "std"):
        _require(value[k] is None or (type(value[k]) in (int, float) and isfinite(value[k])), "INVALID_OUTPUT_SCHEMA")
    for k in ("valid_folds", "undefined_folds", "failed_folds"):
        _require(type(value[k]) is int and value[k] >= 0, "INVALID_OUTPUT_SCHEMA")


def _warnings(value):
    _require(type(value) in (list, tuple), "INVALID_OUTPUT_SCHEMA")
    for code in value:
        _enum(code, ("convergence_warning", "model_warning"))


def _group(value):
    _keys(value, ("folds", "summary", "paired_dummy"))
    _keys(value["summary"], ("mae", "rmse", "r2"))
    for summary in value["summary"].values():
        _aggregate(summary)
    paired = value["paired_dummy"]
    _keys(paired, ("mae_difference", "wins", "ties", "losses"))
    _aggregate(paired["mae_difference"])
    for key in ("wins", "ties", "losses"):
        _require(type(paired[key]) is int and paired[key] >= 0, "INVALID_OUTPUT_SCHEMA")
    for fold in value["folds"]:
        _keys(fold, ("repeat", "fold", "candidate", "metrics", "failure", "warning_codes"), ("train_size", "test_size"))
        for key in ("repeat", "fold", "train_size", "test_size"):
            if key in fold:
                _require(type(fold[key]) is int and fold[key] > 0, "INVALID_OUTPUT_SCHEMA")
        if fold["candidate"] is not None:
            _candidate(fold["candidate"])
        _enum(fold["failure"], (None, "fit_failed", "predict_or_metrics_failed", "not_converged", "inner_search_failed"))
        _warnings(fold["warning_codes"])
        if fold["metrics"] is not None:
            _keys(fold["metrics"], ("mae", "rmse", "r2", "r2_undefined_reason"))
            _enum(fold["metrics"]["r2_undefined_reason"], (None, "constant_target", "test_size_lt_2"))
            for k in ("mae", "rmse", "r2"):
                v = fold["metrics"][k]
                _require(v is None or (type(v) in (int, float) and isfinite(v)), "INVALID_OUTPUT_SCHEMA")


def validate_aggregate_outputs(outputs: AggregateOutputs) -> bool:
    """Strict allowlist plus consistency. Returns technical completeness, NEVER permission.

    Incomplete diagnostics may pass the privacy schema and return False.
    Numeric fields are not proof of aggregation; producer provenance is required.
    """
    try:
        _require(type(outputs) is AggregateOutputs, "INVALID_OUTPUT_SCHEMA")
        for item in (outputs.report, outputs.verification, outputs.comparison):
            _json_tree(item)
        r = outputs.report
        _keys(r, ("version", "data_origin", "exploratory_post_v1", "n_samples", "protocol", "runtime",
                  "predictor_sets", "candidates", "inner_audit", "comparisons", "selection",
                  "subset_frequency", "model_frequency", "candidate_frequency", "failed_selection_folds"))
        _enum(r["version"], ("ml-optimization-v2",))
        _enum(r["data_origin"], ("synthetic", "real_authorized"))
        _enum(r["exploratory_post_v1"], (True,))
        _require(type(r["n_samples"]) is int and r["n_samples"] >= 10, "INVALID_OUTPUT_SCHEMA")
        _require(_json(r["protocol"]) == _json(dict(outer_splits=5, inner_splits=3, outer_repeats=3, random_state=42))
                 and _json(r["predictor_sets"]) == _json(dict(SETS))
                 and _json(r["candidates"]) == _json([asdict(c) for c in CATALOG]), "INVALID_OUTPUT_SCHEMA")
        _require(r["runtime"] == {k: PINNED[k] for k in ("numpy", "pandas", "scikit-learn")}, "INVALID_OUTPUT_SCHEMA")
        _keys(r["subset_frequency"], ("A", "B", "C"))
        _keys(r["model_frequency"], FAMILIES)
        for count in [*r["subset_frequency"].values(), *r["model_frequency"].values(), r["failed_selection_folds"]]:
            _require(type(count) is int and count >= 0, "INVALID_OUTPUT_SCHEMA")
        for item in r["candidate_frequency"]:
            _keys(item, ("candidate", "count"))
            _candidate(item["candidate"])
            _require(type(item["count"]) is int and item["count"] >= 0, "INVALID_OUTPUT_SCHEMA")
        _require(set(r["comparisons"]) <= {f"{s}/{m}" for s, _ in SETS for m in FAMILIES}, "INVALID_OUTPUT_SCHEMA")
        for group in [*r["comparisons"].values(), r["selection"]]:
            _group(group)
        for audit in r["inner_audit"]:
            _keys(audit, ("repeat", "fold", "scores"))
            _require(type(audit["repeat"]) is int and type(audit["fold"]) is int, "INVALID_OUTPUT_SCHEMA")
            for score in audit["scores"]:
                _keys(score, ("candidate", "failed_folds", "mae", "rmse", "failure_codes", "warning_codes"))
                _candidate(score["candidate"])
                _require(type(score["failed_folds"]) is int and 0 <= score["failed_folds"] <= 3, "INVALID_OUTPUT_SCHEMA")
                for k in ("mae", "rmse"):
                    _require(score[k] is None or (type(score[k]) in (int, float) and isfinite(score[k])), "INVALID_OUTPUT_SCHEMA")
                _require(type(score["failure_codes"]) in (tuple, list), "INVALID_OUTPUT_SCHEMA")
                for code in score["failure_codes"]:
                    _enum(code, ("fit_failed", "predict_or_metrics_failed", "not_converged"))
                _warnings(score["warning_codes"])
        verification = verify_optimization_v2(r)
        _require(_json(outputs.verification) == _json(asdict(verification)), "INVALID_OUTPUT_SCHEMA")
        # Rebuilding from whitelisted source prevents extra fields anywhere in the
        # comparison/verification, including arbitrary diagnostic text.
        _require(_json(outputs.comparison) == _json(compare_predictor_sets(r)), "INVALID_OUTPUT_SCHEMA")
        return verification.complete
    except (TypeError, ValueError, KeyError, AttributeError, IndexError, OverflowError):
        pass
    raise ContractError("INVALID_OUTPUT_SCHEMA")


class BindingCompatibility(str, Enum):
    SYNTHETIC_DOCUMENTS_ONLY = "synthetic_documents_only"
    PREFLIGHT_FAILED = "preflight_failed"
    REAL_EXECUTOR_UNAVAILABLE = "real_executor_unavailable"
    INVALID_OUTPUT_STRUCTURE = "invalid_output_structure"


class HumanAuthorizationStatus(str, Enum):
    NOT_ESTABLISHED_BY_METADATA = "not_established_by_metadata"


@dataclass(frozen=True)
class ProvenanceOutputBinding:
    hashes_match: bool
    output_structure_valid: bool
    analytical_complete: bool | None
    preparation_state: ExecutionState
    preparation_compatibility: BindingCompatibility
    human_authorization: HumanAuthorizationStatus = HumanAuthorizationStatus.NOT_ESTABLISHED_BY_METADATA
    execution_certified: bool = field(default=False, init=False)
    real_execution_enabled: bool = field(default=False, init=False)

    def __bool__(self):
        raise ContractError("EXPLICIT_BINDING_STATUS_REQUIRED")


def validate_provenance_outputs(manifest: ProvenanceManifest, outputs: AggregateOutputs) -> ProvenanceOutputBinding:
    """Documentary binding ONLY. No combination certifies an experimental execution.

    Malformed graphs/manifest raise sanitized errors; hash mismatch, invalid output
    schema and incompleteness are distinct fields. No Boolean success API.
    """
    validate_manifest(manifest)
    _require(type(outputs) is AggregateOutputs, "INVALID_OUTPUT_SCHEMA")
    try:
        for value in (outputs.report, outputs.verification, outputs.comparison):
            _json_tree(value)
        expected = {name: hashlib.sha256(_json(getattr(outputs, name)).encode("utf-8")).hexdigest()
                    for name in ("report", "verification", "comparison")}
    except (TypeError, ValueError, OverflowError):
        pass
    else:
        try:
            complete = validate_aggregate_outputs(outputs)
        except ContractError:
            complete, structure = None, False
        else:
            structure = True
        if not structure:
            compatibility = BindingCompatibility.INVALID_OUTPUT_STRUCTURE
        elif not manifest.preflight.checks_passed:
            compatibility = BindingCompatibility.PREFLIGHT_FAILED
        elif outputs.report["data_origin"] != "synthetic":
            compatibility = BindingCompatibility.REAL_EXECUTOR_UNAVAILABLE
        else:
            compatibility = BindingCompatibility.SYNTHETIC_DOCUMENTS_ONLY
        return ProvenanceOutputBinding(
            hashes_match=_string_pairs(manifest.output_sha256) == expected,
            output_structure_valid=structure, analytical_complete=complete,
            preparation_state=manifest.state, preparation_compatibility=compatibility)
    raise ContractError("INVALID_OUTPUT_SCHEMA")
