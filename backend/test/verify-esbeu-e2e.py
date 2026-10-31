"""Isolated PostgreSQL + NestJS + real local FastAPI integration, artificial inputs only.

Never connects to DATABASE_URL from the user's environment. Creates a fresh
database cluster outside the repository and shuts down all test processes.
Requires Python requirements-dev.txt, PostgreSQL tools and installed Node deps.
"""
import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ai-service"))
from app.examples import synthetic_case, synthetic_context  # noqa: E402


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-env", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New directory outside repository")
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--playwright-module", type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(ROOT) or args.private_env.resolve().is_relative_to(ROOT):
        parser.error("Private configuration and test output must be outside repository.")
    output.mkdir(parents=True, exist_ok=False)
    private = dotenv_values(args.private_env)
    if not private.get("BURNOUTSENSE_API_KEY") or private.get("BURNOUTSENSE_TRUST_LOCAL_MODEL") != "true":
        parser.error("Known local model and private key required.")
    pg_port, ai_port, api_port, web_port = (port() for _ in range(4))
    url = f"http://127.0.0.1:{api_port}"
    web_url = f"http://127.0.0.1:{web_port}"
    db = output / "postgres-artificial"
    environment = {**os.environ, "DATABASE_URL": f"postgresql://burnoutsense_test@127.0.0.1:{pg_port}/postgres?schema=public",
                   "NODE_ENV": "test", "PORT": str(api_port), "FRONTEND_URL": web_url,
                   "JWT_ACCESS_SECRET": secrets.token_urlsafe(40), "JWT_REFRESH_SECRET": secrets.token_urlsafe(40),
                   "AI_SERVICE_URL": f"http://127.0.0.1:{ai_port}", "AI_SERVICE_API_KEY": private["BURNOUTSENSE_API_KEY"],
                   "ESBEU_ASSESSMENTS_ENABLED": "true", "DAILY_REMINDER_ENABLED": "false",
                   "SMTP_HOST": "", "SMTP_USER": "", "SMTP_PASS": "", "NEXT_TELEMETRY_DISABLED": "1",
                   "NEXT_PUBLIC_API_URL": url}
    logs = []
    processes = []
    checks = []
    hide = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}

    def run(command, *, cwd=ROOT, env=environment):
        # A Windows database server may inherit a PIPE from pg_ctl and keep it
        # open after pg_ctl exits. Use a file so startup cannot block on EOF.
        command_log = output / "last-command.private.log"
        with command_log.open("wb") as stream:
            result = subprocess.run([str(value) for value in command], cwd=cwd, env=env,
                                    stdout=stream, stderr=subprocess.STDOUT, timeout=180, **hide)
        captured = command_log.read_bytes()
        if result.returncode:
            # Only synthetic test process output; do not print private config.
            text = captured.decode("utf-8", errors="replace")
            for key in (private["BURNOUTSENSE_API_KEY"], environment["JWT_ACCESS_SECRET"], environment["JWT_REFRESH_SECRET"]):
                text = text.replace(key, "[redacted]")
            (output / "command-failure.private.log").write_text(text, encoding="utf-8")
            raise RuntimeError("Test command failed; inspect private local failure log.")
        return captured

    def start(command, label, *, cwd=ROOT, env=environment):
        stream = (output / f"{label}.private.log").open("ab")
        logs.append(stream)
        process = subprocess.Popen([str(value) for value in command], cwd=cwd, env=env,
                                   stdout=stream, stderr=subprocess.STDOUT, **hide)
        processes.append(process)
        return process

    def stop(process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)

    def wait_http(address, process=None):
        for _ in range(120):
            if process is not None and process.poll() is not None:
                raise RuntimeError("Test service exited during startup; inspect its private local log.")
            try:
                if httpx.get(address, timeout=2, trust_env=False).status_code < 500:
                    return
            except httpx.TransportError:
                pass
            time.sleep(0.25)
        raise RuntimeError("Test service did not become ready.")

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    def sql(statement):
        return run([args.pg_bin / "psql.exe", "-h", "127.0.0.1", "-p", pg_port, "-U", "burnoutsense_test",
                    "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement]).decode().strip()

    pg_started = False
    try:
        run([args.pg_bin / "initdb.exe", "-D", db, "-U", "burnoutsense_test", "--auth=trust", "--no-locale", "-E", "UTF8"])
        run([args.pg_bin / "pg_ctl.exe", "-D", db, "-l", output / "postgres.private.log", "-o", f"-h 127.0.0.1 -p {pg_port} -F", "-w", "start"])
        pg_started = True
        prisma = ROOT / "backend/node_modules/prisma/build/index.js"
        # First apply historical migrations to the new artificial-only cluster.
        baseline = output / "baseline-prisma"
        shutil.copytree(ROOT / "backend/prisma", baseline)
        newest = sorted((baseline / "migrations").glob("*_add_esbeu_assessments"))
        for directory in newest:
            # Explicit verified child of the newly created test directory.
            assert directory.resolve().is_relative_to(output)
            shutil.rmtree(directory)
        run([args.node, prisma, "migrate", "deploy", "--schema", baseline / "schema.prisma"])
        sql("INSERT INTO users(id,name,email,\"passwordHash\",\"updatedAt\") VALUES ('synthetic-legacy-user','Synthetic legacy','legacy@example.invalid','unused',NOW());")
        sql('INSERT INTO assessments(id,"userId","studyHours","sleepQuality","stressLevel","anxietyLevel","academicPerformance","screenTime","socialSupport","financialStress","physicalActivity","motivationLevel") '
            "VALUES ('synthetic-legacy-assessment','synthetic-legacy-user',1,1,1,1,1,1,1,1,1,1);")
        run([args.node, prisma, "migrate", "deploy"], cwd=ROOT / "backend")
        check("additive_migration_preserves_historical_row", sql("SELECT count(*) FROM assessments WHERE id='synthetic-legacy-assessment'") == "1")
        run([args.node, prisma, "generate"], cwd=ROOT / "backend")
        run([args.node, ROOT / "backend/node_modules/@nestjs/cli/bin/nest.js", "build"], cwd=ROOT / "backend")
        ai_command = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ai_port, "--no-access-log"]
        ai = start(ai_command, "fastapi", cwd=ROOT / "ai-service", env={**environment, **private})
        backend_command = [args.node, ROOT / "backend/dist/main.js"]
        backend = start(backend_command, "backend", cwd=ROOT / "backend")
        wait_http(f"http://127.0.0.1:{ai_port}/health", ai)
        wait_http(url + "/status", backend)
        password = "Aa9-" + secrets.token_urlsafe(24)
        with httpx.Client(base_url=url, timeout=40, trust_env=False) as client:
            def register(email):
                response = client.post("/auth/register", json={"name": "Synthetic test", "email": email, "password": password})
                check("synthetic_account_registered", response.status_code == 201)
                return {"Authorization": "Bearer " + response.json()["accessToken"]}
            owner = register("owner@example.invalid")
            other = register("other@example.invalid")
            browser_owner = register("browser@example.invalid")
            check("anonymous_access_rejected", client.get("/esbeu-assessments").status_code == 401)
            malformed = client.post("/esbeu-assessments", headers={**owner, "Content-Type": "application/json"}, content='{"artificial-private-marker":')
            check("malformed_json_is_sanitized", malformed.status_code == 400 and "artificial-private-marker" not in malformed.text)
            oversized = client.post("/esbeu-assessments", headers={**owner, "Content-Type": "application/json"}, content=" " * 262145)
            check("backend_body_limit", oversized.status_code == 413)
            form = client.get("/esbeu-assessments/form", headers=owner)
            check("canonical_form_proxied", form.status_code == 200 and len(form.json()["fields"]) == 36)
            payload = {"context": synthetic_context(), "consent": True, "adult": True, "enrolled": True, "consentVersion": form.json()["consent"]["version"]}
            forged = client.post("/esbeu-assessments", headers=owner, json={**payload, "artificial-private-marker": "forbidden"})
            check("unknown_properties_are_sanitized", forged.status_code == 400 and "artificial-private-marker" not in forged.text)
            for key in ("consent", "adult", "enrolled"):
                check("negative_" + key + "_rejected", client.post("/esbeu-assessments", headers=owner, json={**payload, key: False}).status_code == 400)
            check("old_consent_rejected", client.post("/esbeu-assessments", headers=owner, json={**payload, "consentVersion": "old"}).status_code == 400)
            check("null_items_rejected", client.post("/esbeu-assessments", headers=owner, json={**payload, "items": None}).status_code == 400)
            invalid = deepcopy(payload)
            invalid["context"]["email"] = "artificial-private-marker"
            rejected = client.post("/esbeu-assessments", headers=owner, json=invalid)
            check("extra_context_rejected_without_echo", rejected.status_code == 422 and "artificial-private-marker" not in rejected.text)
            response = client.post("/esbeu-assessments", headers=owner, json={**payload, "items": synthetic_case()["items"]})
            check("context_and_optional_items_persisted", response.status_code == 201)
            saved = response.json()
            record_id = saved["id"]
            check("observed_and_estimated_distinct", saved["observedOverall"] == 2 and 0 <= saved["estimatedOverall"] <= 4)
            check("artifact_version_persisted", saved["modelVersion"].startswith("sha256:"))
            detail = client.get(f"/esbeu-assessments/{record_id}", headers=owner)
            check("owner_detail_matches_context", detail.status_code == 200 and detail.json()["context"] == payload["context"])
            check("consent_timestamp_recorded", bool(detail.json()["consentAcceptedAt"]))
            check("foreign_detail_rejected", client.get(f"/esbeu-assessments/{record_id}", headers=other).status_code == 404)
            check("foreign_delete_rejected", client.delete(f"/esbeu-assessments/{record_id}", headers=other).status_code == 404)
            check("foreign_cursor_rejected", client.get("/esbeu-assessments", headers=other, params={"cursor": record_id}).status_code == 404)
            check("malformed_id_rejected", client.get("/esbeu-assessments/not-a-uuid", headers=owner).status_code == 400)
            # Populate artificial copies through SQL to test pagination without changing throttling.
            columns = '"userId",context,"observedItems","estimatedOverall","observedOverall","observedExhaustion","observedDistancing","observedInefficacy","modelName","modelVersion","datasetVersion","contractVersion","formVersion","consentVersion","consentAcceptedAt","adultConfirmed","enrolledConfirmed","createdAt"'
            sql(f'INSERT INTO esbeu_assessments(id,{columns}) SELECT gen_random_uuid()::text,{columns} FROM esbeu_assessments CROSS JOIN generate_series(1,25) WHERE id=\'{record_id}\'')
            first = client.get("/esbeu-assessments", headers=owner).json()
            second = client.get("/esbeu-assessments", headers=owner, params={"cursor": first["nextCursor"]}).json()
            check("pagination_26_records_without_overlap", len(first["items"]) == 25 and len(second["items"]) == 1 and not ({row["id"] for row in first["items"]} & {row["id"] for row in second["items"]}))
            check("summaries_exclude_private_inputs", all("context" not in row and "observedItems" not in row and "userId" not in row for row in first["items"]))
            check("other_owner_history_empty", client.get("/esbeu-assessments", headers=other).json()["items"] == [])
            stop(ai)
            failed = client.post("/esbeu-assessments", headers=owner, json=payload)
            check("ai_offline_has_no_fallback_or_write", failed.status_code == 503 and sql('SELECT count(*) FROM esbeu_assessments') == "26")
            check("history_available_without_ai", client.get(f"/esbeu-assessments/{record_id}", headers=owner).status_code == 200)
            check("owner_deletion", client.delete(f"/esbeu-assessments/{record_id}", headers=owner).status_code == 204)
            check("deleted_detail_not_found", client.get(f"/esbeu-assessments/{record_id}", headers=owner).status_code == 404)
            check("account_deletion_cascades_records", client.delete("/users/me", headers=owner).status_code == 200 and sql('SELECT count(*) FROM esbeu_assessments') == "0")
            ai = start(ai_command, "fastapi-restarted", cwd=ROOT / "ai-service", env={**environment, **private})
            wait_http(f"http://127.0.0.1:{ai_port}/health")
            if args.playwright_module:
                stop(backend)
                backend = start(backend_command, "backend-browser", cwd=ROOT / "backend")
                wait_http(url + "/status")
                run([args.node, ROOT / "frontend/node_modules/next/dist/bin/next", "build"], cwd=ROOT / "frontend")
                start([args.node, ROOT / "frontend/node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", web_port], "frontend", cwd=ROOT / "frontend")
                wait_http(web_url + "/login")
                run([args.node, ROOT / "frontend/tests/esbeu-browser.mjs"], env={**environment,
                    "BURNOUTSENSE_E2E_BASE_URL": web_url, "BURNOUTSENSE_E2E_EMAIL": "browser@example.invalid",
                    "BURNOUTSENSE_E2E_PASSWORD": password, "BURNOUTSENSE_E2E_OUTPUT": str(output),
                    "BURNOUTSENSE_PLAYWRIGHT_MODULE": str(args.playwright_module)})
                check("browser_flow", json.loads((output / "browser.aggregate.json").read_text())["passed"])
            stop(backend)
            backend = start(backend_command, "backend-rollback", cwd=ROOT / "backend", env={**environment, "ESBEU_ASSESSMENTS_ENABLED": "false"})
            wait_http(url + "/status")
            check("rollback_disables_new_writes", client.post("/esbeu-assessments", headers=other, json=payload).status_code == 503)
            check("rollback_keeps_history", client.get("/esbeu-assessments", headers=other).status_code == 200)
        report = {"passed": True, "checks": checks, "data_origin": "artificial_schema_examples_only",
                  "isolated_postgresql": True, "independent_fastapi": True, "real_csv_read": False,
                  "application_database_touched": False, "browser_test": bool(args.playwright_module)}
        (output / "integration.aggregate.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"passed": True, "checks": len(checks), "browser": bool(args.playwright_module)}))
    finally:
        for process in reversed(processes):
            stop(process)
        if pg_started:
            run([args.pg_bin / "pg_ctl.exe", "-D", db, "-m", "fast", "-w", "stop"])
        for stream in logs:
            stream.close()


if __name__ == "__main__":
    main()
