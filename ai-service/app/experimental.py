"""Explicit opt-in loader for a locally generated experimental candidate."""
import hashlib
import json
from pathlib import Path
import re

from app.predictor import RegressionService, ModelUnavailable
from app.schemas import FamilyMetrics
from training.regression_inference import load_private_pipeline
from training.regression_preprocessing import ALLOWED_PREDICTORS
from training.optimization_v2 import default_candidates


class ExperimentalRegressionService(RegressionService):
    def _load(self):
        if self._artifact is not None:
            return self._artifact
        with self._lock:
            if self._artifact is not None:
                return self._artifact
            try:
                if not self.settings.trust_local_model or self.settings.model_dir is None:
                    raise ValueError()
                d = self.settings.model_dir.resolve()
                if d.is_relative_to(Path(__file__).resolve().parents[2]) or (d/'failed.json').exists():
                    raise ValueError()
                m = json.loads((d/'candidate-manifest.private.json').read_bytes())
                if (m['artifact_kind'] != 'experimental-rf-a/1' or m['status'] != 'completed'
                        or m['experimental'] is not True or m['independent_validation'] is not False
                        or m['data_origin'] != 'real_questionnaire' or type(m['eligible_records']) is not int
                        or m['eligible_records'] < 3 or m['model_name'] != 'random_forest'
                        or m['dataset_version'] != self.settings.dataset_version
                        or not re.fullmatch(r'rf-a-candidate-[A-Za-z0-9._-]{1,80}', m['dataset_version'])
                        or not re.fullmatch('[0-9a-f]{64}', m['model_sha256'])):
                    raise ValueError()
                for name in ('context_regressor.private.joblib','v2-reference.aggregate.json','input-schema.json'):
                    if hashlib.sha256((d/name).read_bytes()).hexdigest() != m['artifact_sha256'][name]:
                        raise ValueError()
                if m['artifact_sha256']['context_regressor.private.joblib'] != m['model_sha256']:
                    raise ValueError()
                artifact = load_private_pipeline(d/'context_regressor.private.joblib', trusted=True,
                    expected_sha256=m['model_sha256'])
                if (artifact['contract']['model_name'] != 'random_forest'
                        or tuple(artifact['contract']['predictors']) != ALLOWED_PREDICTORS
                        or tuple(artifact['pipeline'].named_steps['preprocess'].named_steps['validate'].predictors) != ALLOWED_PREDICTORS):
                    raise ValueError()
                from sklearn.ensemble import RandomForestRegressor
                estimator = artifact['pipeline'].named_steps['regressor']
                if type(estimator) is not RandomForestRegressor:
                    raise ValueError()
                from dataclasses import asdict
                allowed = [asdict(c.model) for c in default_candidates() if c.subset=='A' and c.model.name=='random_forest']
                canonical = lambda v: json.dumps(v,sort_keys=True)
                if canonical(m['chosen_candidate']) not in [canonical(c) for c in allowed]:
                    raise ValueError()
                from training.regression_models import build_regression_pipeline
                expected = build_regression_pipeline('random_forest', ALLOWED_PREDICTORS,
                    random_state=42, model_params=dict(m['chosen_candidate']['parameters'])).named_steps['regressor']
                if estimator.get_params() != expected.get_params():
                    raise ValueError()
                raw = json.loads((d/'v2-reference.aggregate.json').read_bytes())
                rows = [FamilyMetrics.model_validate(v).model_dump() for v in raw['family_comparisons']]
                proc = FamilyMetrics.model_validate(raw['selection_procedure']).model_dump()
                if len(rows)!=4 or {v['name'] for v in rows}!={'dummy','ridge','random_forest','svr'} or proc['name']!='inner_selection_procedure':
                    raise ValueError()
                self._comparison = dict(family_comparisons=rows, selection_procedure=proc)
                self._protocol = m['protocol']
                if self._protocol != dict(outer_splits=5,inner_splits=3,outer_repeats=3,random_state=42):
                    raise ValueError()
                self._manifest, self._artifact = m, artifact
                return artifact
            except Exception:
                pass
        raise ModelUnavailable('Candidato experimental indisponível ou incompatível.')

    def predict(self, context):
        return {**super().predict(context), 'experimental': True}

    def info(self):
        return {**super().info(), 'experimental': True, 'validation_scope': 'exploratory_post_selection'}

    def metrics(self):
        return {**super().metrics(), 'scope': 'exploratory_v2_reference_not_candidate_validation'}
