"""Opt-in local Ridge comparator, independent of the official model lifecycle."""
import hashlib
import json
from pathlib import Path
import re

from sklearn.linear_model import Ridge

from app.predictor import RegressionService, ModelUnavailable
from training.regression_inference import load_private_pipeline
from training.regression_models import build_regression_pipeline
from training.regression_preprocessing import ALLOWED_PREDICTORS


class ShadowRidgeService(RegressionService):
    def _load(self):
        if self._artifact is not None:
            return self._artifact
        with self._lock:
            if self._artifact is not None:
                return self._artifact
            try:
                s = self.settings
                if (not s.shadow_ridge_enabled or s.environment not in ("local", "test")
                        or not s.trust_shadow_ridge or s.shadow_ridge_dir is None
                        or re.fullmatch(r"[0-9a-f]{64}", s.shadow_ridge_sha256) is None):
                    raise ValueError()
                d = s.shadow_ridge_dir.resolve()
                if (d.is_relative_to(Path(__file__).resolve().parents[2]) or (d/'failed.json').exists()
                        or s.shadow_ridge_dir.is_symlink()):
                    raise ValueError()
                m = json.loads((d/'ridge-candidate-manifest.private.json').read_text(encoding="utf-8"))
                if (m['artifact_kind'] != 'experimental-ridge-dimensional-time/1'
                        or m['status'] != 'completed' or m['experimental'] is not True
                        or m['independent_validation'] is not False or m['model_name'] != 'ridge'
                        or m['model_sha256'] != s.shadow_ridge_sha256
                        or type(m['real_records']) is not int or m['real_records'] < 6
                        or type(m['synthetic_records']) is not int or m['synthetic_records'] != 100
                        or type(m['real_weight']) not in (int,float) or m['real_weight'] != 1.
                        or type(m['synthetic_weight']) not in (int,float) or m['synthetic_weight'] != .25
                        or m['generator']['version'] != 'dimensional-weekly-budget/2'
                        or m['generator']['reserve_hours_week'] != 21
                        or type(m['alpha']) not in (int,float) or m['alpha'] not in (1.,10.)
                        or tuple(m['predictors']) != ALLOWED_PREDICTORS
                        or not re.fullmatch(r'ridge-dimensional-time-candidate-[A-Za-z0-9._-]{1,60}', m['dataset_version'])):
                    raise ValueError()
                for name in ('context_regressor.private.joblib', 'input-schema.json'):
                    if hashlib.sha256((d/name).read_bytes()).hexdigest() != m['artifact_sha256'][name]:
                        raise ValueError()
                if m['artifact_sha256']['context_regressor.private.joblib'] != s.shadow_ridge_sha256:
                    raise ValueError()
                from app.main import context_schema
                from training.regression_inference import runtime_versions
                if (json.loads((d/'input-schema.json').read_text(encoding='utf-8')) != context_schema()
                        or m['libraries'] != runtime_versions()):
                    raise ValueError()
                # Trust and an independently configured hash are required BEFORE unpickling.
                artifact = load_private_pipeline(d/'context_regressor.private.joblib', trusted=True,
                                                 expected_sha256=s.shadow_ridge_sha256)
                contract = artifact['contract'];model = artifact['pipeline']
                if (contract['model_name'] != 'ridge' or tuple(contract['predictors']) != ALLOWED_PREDICTORS
                        or contract['output_name'] != 'esbeu_overall' or contract['output_minimum'] != 0
                        or contract['output_maximum'] != 4
                        or tuple(model.named_steps['preprocess'].named_steps['validate'].predictors) != ALLOWED_PREDICTORS
                        or type(model.named_steps['regressor']) is not Ridge):
                    raise ValueError()
                expected = build_regression_pipeline('ridge', model_params={'alpha':float(m['alpha'])})
                if model.named_steps['regressor'].get_params() != expected.named_steps['regressor'].get_params():
                    raise ValueError()
                self._artifact, self._manifest = artifact, m
                return artifact
            except Exception:
                pass
        raise ModelUnavailable("Candidato shadow indisponível.")

    def predict(self, context):
        self._load()
        # The official dataset configuration is never reused or changed.
        from training.regression_inference import predict_context_scores
        from app.predictor import EstimateRejected
        frame = self.context_frame(context)
        try:
            value = float(predict_context_scores(self._artifact, frame)[0])
        except Exception:
            raise EstimateRejected("Estimativa shadow fora do domínio.") from None
        return dict(experimental=True, esbeu_overall=value, model_name='ridge',
                    dataset_version=self._manifest['dataset_version'],
                    model_version='sha256:'+self._manifest['model_sha256'])
