"""Read-only stdlib environment audit. No installs, data access or experiment."""

import hashlib
from importlib import metadata
import json
from pathlib import Path
import platform
import re
import struct
import sys
import sysconfig


SNAPSHOT = Path(__file__).resolve().parents[1] / "requirements-v2-windows-py312.txt"
NAME = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?")
RELEASE = re.compile(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*")


def valid_name(value):
    return type(value) is str and 1 <= len(value) <= 200 and NAME.fullmatch(value) is not None


def valid_version(value):
    # Deliberate PEP 440 subset: normalized nonnegative integer release segments.
    return type(value) is str and 1 <= len(value) <= 128 and RELEASE.fullmatch(value) is not None


def canonical(name):
    if not valid_name(name):
        raise ValueError("INVALID_DISTRIBUTION_NAME")
    return re.sub(r"[-_.]+", "-", name).lower()


def expected_versions(payload):
    expected = {}
    for line in payload.decode("utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([^=\[\]]+)(\[standard\])?==([^=]+)", line)
        if (not match or not valid_name(match[1]) or not valid_version(match[3])
                or (match[2] is not None and canonical(match[1]) != "uvicorn")
                or canonical(match[1]) in expected):
            raise ValueError("INVALID_SNAPSHOT")
        expected[canonical(match[1])] = match[3]
    if not expected:
        raise ValueError("EMPTY_SNAPSHOT")
    return expected


def _runtime():
    python = platform.python_version()
    implementation = platform.python_implementation()
    target = sysconfig.get_platform()
    reference = (python == "3.12.14" and implementation == "CPython"
                 and sys.platform == "win32" and sysconfig.get_platform() == "win-amd64"
                 and struct.calcsize("P") * 8 == 64 and sys.prefix != sys.base_prefix)
    return reference, {
        "python": python if valid_version(python) else None,
        "implementation": implementation if implementation in ("CPython", "PyPy") else None,
        "platform": target if target in ("win-amd64", "win32", "win-arm64", "linux-x86_64", "linux-aarch64") else None,
    }


def audit(payload):
    expected = expected_versions(payload)
    actual, seen = {}, set()
    counts = dict(invalid_distribution_name=0, invalid_distribution_version=0,
                  duplicate_distribution_name=0, direct_url_metadata=0)
    installed_count = 0
    invalid_version_names = set()
    for distribution in metadata.distributions():
        installed_count += 1
        raw_name = distribution.metadata.get("Name")
        if not valid_name(raw_name):
            counts["invalid_distribution_name"] += 1
            continue  # Do not serialize, normalize or echo this untrusted value.
        name = canonical(raw_name)
        counts["duplicate_distribution_name"] += name in seen
        seen.add(name)
        version = distribution.version
        if not valid_version(version):
            counts["invalid_distribution_version"] += 1
            invalid_version_names.add(name)
            continue  # A version string is NEVER copied into diagnostics.
        actual[name] = version
        counts["direct_url_metadata"] += distribution.read_text("direct_url.json") is not None
    reference, runtime = _runtime()
    versions_match = actual == expected and not any(counts[k] for k in (
        "invalid_distribution_name", "invalid_distribution_version", "duplicate_distribution_name"))
    return {
        "reference_platform_matches": reference,
        "installed_versions_match": versions_match,
        "direct_url_metadata_present": counts["direct_url_metadata"] > 0,
        "matches": reference and versions_match and counts["direct_url_metadata"] == 0,
        "diagnostic_counts": counts,
        "invalid_version_names": sorted(invalid_version_names),
        "expected_distribution_count": len(expected),
        "installed_distribution_count": installed_count,
        "missing": sorted(set(expected) - set(actual)),
        "unexpected": sorted(set(actual) - set(expected)),
        "version_mismatches": sorted(k for k in set(actual) & set(expected) if actual[k] != expected[k]),
        **runtime,
        "snapshot_sha256": hashlib.sha256(payload.replace(b"\r\n", b"\n")).hexdigest(),
        "artifact_hashes_verified": False,
        "real_execution_enabled": False,
    }


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv == ["--self-test"]:
        return run_self_tests()
    if argv:
        print("ENVIRONMENT_ARGUMENTS_INVALID", file=sys.stderr)
        return 2
    try:
        result = audit(SNAPSHOT.read_bytes())
        rendered = json.dumps(result, sort_keys=True, indent=2, allow_nan=False)
    except Exception:
        print("ENVIRONMENT_AUDIT_FAILED", file=sys.stderr)
        return 2
    print(rendered)
    return 0 if result["matches"] else 2


def run_self_tests():
    """Embedded to keep changes within the three authorized files; stdlib only."""
    import contextlib
    import io
    import unittest
    from unittest.mock import patch

    class Distribution:
        def __init__(self, name="numpy", version="1.26.4", url=None):
            self.metadata, self.version, self.url = {"Name": name}, version, url

        def read_text(self, name):
            return self.url

    class Payload:
        def __init__(self, payload=b"numpy==1.26.4", error=None):
            self.payload, self.error = payload, error

        def read_bytes(self):
            if self.error:
                raise self.error
            return self.payload

    class EnvironmentTests(unittest.TestCase):
        def invoke(self, distributions, payload=b"numpy==1.26.4", error=None):
            out, err = io.StringIO(), io.StringIO()
            with patch.dict(globals(), {"SNAPSHOT": Payload(payload, error),
                            "_runtime": lambda: (True, dict(python="3.12.14", implementation="CPython", platform="win-amd64"))}), \
                    patch.object(metadata, "distributions", return_value=distributions), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = main([])
            return code, out.getvalue(), err.getvalue()

        def test_invalid_snapshot_names_versions_and_requirements(self):
            for payload in (b"numpy==banana", b"...==1.0", b"numpy>=1.26.4", b"",
                            b"numpy==1..0", b"numpy==01.0", b"numpy==1.0rc1", b"numpy==1.0+local",
                            b"numpy[standard]==1.0", b"\xff", b"-name==1.0", b"numpy==NaN"):
                with self.subTest(payload=payload):
                    code, out, err = self.invoke([Distribution()], payload)
                    self.assertEqual((code, out, err), (2, "", "ENVIRONMENT_AUDIT_FAILED\n"))

        def test_normalized_names_match(self):
            code, out, err = self.invoke([Distribution("typing-extensions", "4.16.0")], b"Typing_Extensions==4.16.0")
            self.assertEqual(code, 0); self.assertTrue(json.loads(out)["matches"]); self.assertEqual(err, "")

        def test_snapshot_normalized_duplicates_rejected(self):
            code, out, err = self.invoke([], b"Typing_Extensions==4.16.0\ntyping-extensions==4.16.0")
            self.assertEqual((code, out, err), (2, "", "ENVIRONMENT_AUDIT_FAILED\n"))

        def test_missing_extra_and_version_mismatch(self):
            for items, key in (([], "missing"), ([Distribution(), Distribution("extra", "1.0")], "unexpected"),
                               ([Distribution(version="1.26.5")], "version_mismatches")):
                code, out, err = self.invoke(items)
                self.assertEqual(code, 2); self.assertTrue(json.loads(out)[key]); self.assertEqual(err, "")

        def test_installed_duplicates_counted(self):
            code, out, err = self.invoke([Distribution(), Distribution("NUMPY")])
            self.assertEqual(code, 2)
            self.assertEqual(json.loads(out)["diagnostic_counts"]["duplicate_distribution_name"], 1)

        def test_invalid_names_never_echo_sentinels(self):
            for name in ("https://fiction.invalid/token=FAKE_SECRET", r"C:\Fiction\FAKE_SECRET",
                         "/fiction/FAKE_SECRET", "...", "fiction@example.invalid", None, 123):
                code, out, err = self.invoke([Distribution(), Distribution(name)])
                self.assertEqual(code, 2)
                result = json.loads(out)
                self.assertEqual(result["diagnostic_counts"]["invalid_distribution_name"], 1)
                self.assertNotIn("FAKE_SECRET", out + err)
                self.assertNotIn("fiction", out + err)

        def test_missing_metadata_name_counted_without_echo(self):
            item = Distribution(); item.metadata = {}
            code, out, err = self.invoke([item])
            self.assertEqual(code, 2)
            self.assertEqual(json.loads(out)["diagnostic_counts"]["invalid_distribution_name"], 1)
            self.assertEqual(err, "")

        def test_invalid_arguments_not_echoed(self):
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(main(["https://fiction.invalid/FAKE_SECRET"]), 2)
            self.assertEqual(out.getvalue(), "")
            self.assertEqual(err.getvalue(), "ENVIRONMENT_ARGUMENTS_INVALID\n")

        def test_invalid_installed_versions_never_echo_sentinels(self):
            for version in ("banana", "FAKE_SECRET", "https://fiction.invalid/FAKE_SECRET",
                            r"C:\Fiction\FAKE_SECRET", "1..0", None, float("nan")):
                code, out, err = self.invoke([Distribution(version=version)])
                self.assertEqual(code, 2)
                result = json.loads(out)
                self.assertEqual(result["diagnostic_counts"]["invalid_distribution_version"], 1)
                self.assertEqual(result["invalid_version_names"], ["numpy"])
                self.assertNotIn("FAKE_SECRET", out + err); self.assertNotIn("fiction", out + err)

        def test_two_identically_invalid_versions_cannot_match(self):
            code, out, err = self.invoke([Distribution(version="banana")], b"numpy==banana")
            self.assertEqual((code, out, err), (2, "", "ENVIRONMENT_AUDIT_FAILED\n"))

        def test_direct_url_not_echoed(self):
            code, out, err = self.invoke([Distribution(url='{"url":"https://fiction.invalid/FAKE_SECRET"}')])
            self.assertEqual(code, 2); self.assertTrue(json.loads(out)["direct_url_metadata_present"])
            self.assertNotIn("FAKE_SECRET", out + err)

        def test_read_errors_sanitized(self):
            for error in (OSError("FAKE_SECRET"), RuntimeError("FAKE_SECRET")):
                self.assertEqual(self.invoke([], error=error), (2, "", "ENVIRONMENT_AUDIT_FAILED\n"))

        def test_unexpected_metadata_errors_sanitized(self):
            with patch.object(metadata, "distributions", side_effect=RuntimeError("FAKE_SECRET")), \
                    patch.dict(globals(), {"SNAPSHOT": Payload()}):
                out, err = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    self.assertEqual(main([]), 2)
                self.assertEqual(out.getvalue(), ""); self.assertEqual(err.getvalue(), "ENVIRONMENT_AUDIT_FAILED\n")

        def test_wrong_python_platform_architecture_and_venv(self):
            for target, value in (("platform.python_version", "3.14.4"),
                                  ("platform.python_implementation", "PyPy"),
                                  ("sysconfig.get_platform", "linux-x86_64"),
                                  ("struct.calcsize", 4)):
                with patch(target, return_value=value):
                    self.assertFalse(_runtime()[0])
            with patch.object(sys, "prefix", sys.base_prefix):
                self.assertFalse(_runtime()[0])

        def test_invalid_snapshot_does_not_echo_content(self):
            payload=b"https://fiction.invalid/FAKE_SECRET==banana"
            self.assertEqual(self.invoke([], payload), (2, "", "ENVIRONMENT_AUDIT_FAILED\n"))

        def test_actual_reference_has_48_valid_distributions(self):
            result = audit(SNAPSHOT.read_bytes())
            self.assertTrue(result["matches"])
            self.assertEqual(result["expected_distribution_count"], 48)
            self.assertEqual(result["installed_distribution_count"], 48)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(EnvironmentTests)
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
