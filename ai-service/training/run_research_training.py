"""Run the authorized research workflow locally without exposing source records.

Use: python -m training.run_research_training --config PRIVATE_CONFIG.json
The CSV, config, reports and trained artifacts must remain outside the repo.
The configuration must confirm institutional/ethical authorization, consent
for training and independent participants. This is a recorded confirmation by
the responsible team, not a substitute for institutional review.
"""

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys
import warnings

import numpy as np

from training.import_forms import import_official_forms_csv
from training.regression_experiments import ExperimentProtocol, default_candidates, run_nested_experiments
from training.regression_inference import (
    InferenceContract, file_sha256, load_private_pipeline, runtime_versions, save_private_pipeline,
)
from training.regression_preprocessing import ALLOWED_PREDICTORS, prepare_regression_data, validate_predictors
from training.research_audit import audit_import


REPOSITORY = Path(__file__).resolve().parents[2]


class TrainingRunError(ValueError):
    """Sanitized local runner error."""


def _write_json(path, content):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(content, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def run_local_training(config: dict) -> dict:
    """Return only status/counts/artifact hashes; never records or predictions.

    No source is opened until all authorization, path and configuration gates
    have passed. Repeated/grouped responses require a different protocol;
    this independent-row runner refuses them rather than using ordinary KFold.
    """
    authorized = ("institutional_ethics_authorized", "training_consent_confirmed",
                  "one_independent_response_per_participant")
    if (not isinstance(config, dict) or any(config.get(key) is not True for key in authorized)
            or type(config.get("authorization_reference")) is not str
            or not config["authorization_reference"].strip()):
        raise TrainingRunError("Autorização, consentimento e independência precisam ser confirmados.")
    try:
        source = Path(config["csv_path"]).expanduser().resolve()
        output = Path(config["output_directory"]).expanduser().resolve()
        selected = validate_predictors(config.get("predictors", ALLOWED_PREDICTORS))
        protocol = ExperimentProtocol(**config.get("protocol", {}))
        if config.get("data_origin", "real_questionnaire") not in ("real_questionnaire", "synthetic_test"):
            raise ValueError()
        if (any(type(value) is not int for value in (protocol.outer_splits, protocol.inner_splits,
                                                     protocol.outer_repeats, protocol.random_state))
                or protocol.outer_splits < 2 or protocol.inner_splits < 2
                or protocol.outer_repeats < 1 or not 0 <= protocol.random_state < 2**32):
            raise ValueError()
        if (source.is_relative_to(REPOSITORY) or output.is_relative_to(REPOSITORY)
                or output == REPOSITORY or source.suffix.lower() != ".csv"
                or output.exists() or not source.is_file()):
            raise ValueError()
    except Exception:
        pass
    else:
        return _run_authorized(config, source, output, selected, protocol)
    raise TrainingRunError("Configuração ou caminhos privados inválidos.")


def _run_authorized(config, source, output, selected, protocol):
    # Importer discards both administrative columns; raw cells never reach logs.
    source_checksum = file_sha256(source)
    imported = import_official_forms_csv(source)
    if file_sha256(source) != source_checksum:
        raise TrainingRunError("Arquivo de origem alterado durante a importação.")
    audit = audit_import(imported, selected)
    data = prepare_regression_data(imported.records, selected)
    output.mkdir(parents=True, exist_ok=False)
    _write_json(output / "audit.private.json", asdict(audit))
    _write_json(output / "protocol.private.json", {
        "protocol": asdict(protocol), "predictors": selected,
        "authorization_reference": config["authorization_reference"],
        "source_sha256": source_checksum, "versions": runtime_versions(),
        "authorization_confirmations": {key: config[key] for key in (
            "institutional_ethics_authorized", "training_consent_confirmed",
            "one_independent_response_per_participant")},
        "candidate_grid": [asdict(candidate) for candidate in default_candidates()],
        "selection_rule": "inner MAE, then RMSE, dispersion and simplicity for exact ties",
        "data_origin": config.get("data_origin", "real_questionnaire"),
        "individual_outputs_saved": False,
    })
    outcome = run_nested_experiments(data, protocol=protocol)
    _write_json(output / "experiments.private.json", asdict(outcome.report))
    _write_json(output / "comparison.aggregate.json", {
        "data_origin": config.get("data_origin", "real_questionnaire"),
        "family_comparisons": [asdict(summary) for summary in outcome.report.family_summaries],
        "selection_procedure": asdict(outcome.report.selection_summary),
        "final_candidate": asdict(outcome.report.final_candidate)
        if outcome.report.final_candidate is not None else None,
        "failure": outcome.report.final_refit_failure,
        "interpretation": "internal nested CV; fold dispersion is not a confidence interval; no clinical validation",
    })
    if outcome.fitted_model is None or outcome.report.final_candidate is None:
        raise TrainingRunError("Experimento incompleto; relatórios privados disponíveis, sem modelo final.")
    if file_sha256(source) != source_checksum:
        raise TrainingRunError("Arquivo de origem alterado durante o experimento; refaça a execução.")
    contract = InferenceContract("esbeu-context-regression/1", outcome.report.final_candidate.name,
                                 selected)
    model_path = output / "context_regressor.private.joblib"
    checksum = save_private_pipeline(outcome.fitted_model, contract, model_path)
    # The only loaded artifact was just generated by this process in a new dir.
    loaded = load_private_pipeline(model_path, trusted=True, expected_sha256=checksum)
    before = outcome.fitted_model.predict(data.X)
    after = loaded["pipeline"].predict(data.X)
    if not np.allclose(before, after, rtol=1e-12, atol=1e-12):
        raise TrainingRunError("Falha na verificação local de persistência.")
    _write_json(output / "inference-contract.private.json", asdict(contract))
    manifest = {"status": "completed", "eligible_records": imported.eligible_count,
                "model_name": contract.model_name, "model_sha256": checksum,
                "data_origin": config.get("data_origin", "real_questionnaire"),
                "versions": runtime_versions(), "out_of_range_policy": "reject"}
    _write_json(output / "run-manifest.private.json", manifest)
    return manifest


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise TrainingRunError("Argumentos inválidos.")


def main(argv=None) -> int:
    try:
        parser = _Parser(description="Treinamento local privado da regressão ESB-eu.")
        parser.add_argument("--config", required=True)
        args = parser.parse_args(argv)
        with Path(args.config).open(encoding="utf-8") as stream:
            config = json.load(stream)
        # Also contain warnings from dependencies at the CLI boundary.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            run_local_training(config)
    except Exception:
        print("Treinamento não concluído; confira a configuração e os relatórios privados locais.",
              file=sys.stderr)
        return 1
    print("Treinamento local concluído; artefatos e relatórios permanecem na pasta privada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
