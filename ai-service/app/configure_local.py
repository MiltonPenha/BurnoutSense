"""Create private local configuration; never print credentials or load pickle."""
import argparse
import json
from pathlib import Path
import secrets
from training.regression_inference import file_sha256


def configure(model_dir: Path, destination: Path, dataset_version: str):
    repository = Path(__file__).resolve().parents[2]
    model_dir, destination = model_dir.resolve(), destination.resolve()
    if model_dir.is_relative_to(repository) or destination.is_relative_to(repository):
        raise ValueError()
    if any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in dataset_version) or not 1 <= len(dataset_version) <= 100:
        raise ValueError()
    manifest = json.loads((model_dir / "run-manifest.private.json").read_text(encoding="utf-8"))
    if manifest["status"] != "completed" or file_sha256(model_dir / "context_regressor.private.joblib") != manifest["model_sha256"]:
        raise ValueError()
    if any(c in str(model_dir) for c in "\n\r'${}"):
        raise ValueError()
    with destination.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(f"BURNOUTSENSE_MODEL_DIR='{model_dir.as_posix()}'\n"
                     f"BURNOUTSENSE_DATASET_VERSION={dataset_version}\n"
                     "BURNOUTSENSE_TRUST_LOCAL_MODEL=true\n"
                     f"BURNOUTSENSE_API_KEY={secrets.token_urlsafe(32)}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--trust-generated-model", action="store_true", required=True,
                        help="Somente modelo gerado localmente com origem conhecida.")
    args = parser.parse_args()
    try:
        configure(args.model_dir, args.output, args.dataset_version)
    except Exception:
        parser.exit(1, "Configuração não criada; confira caminhos privados, integridade e destino inexistente.\n")
    print("Configuração privada criada. Credencial não exibida.")


if __name__ == "__main__":
    main()
