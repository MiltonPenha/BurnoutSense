"""CSV boundary for research data; no automatic mapping, scoring or persistence."""

import csv
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import TextIO

from training.form_schema import (
    ADMINISTRATIVE_HEADERS,
    FIELDS_BY_ID,
    IneligibleRecordError,
    ResponseValidationError,
    Value,
    validate_record,
    validate_value,
)


class FormsImportError(ValueError):
    """File or configuration error, with no raw header/cell content."""


@dataclass(frozen=True)
class RowIssue:
    row: int
    kind: str
    field_id: str | None
    reason: str


@dataclass(frozen=True)
class ImportResult:
    rows_read: int
    records: tuple[Mapping[str, Value], ...]
    ineligible_count: int
    rejected_count: int
    issues: tuple[RowIssue, ...]
    excluded_columns: tuple[int, ...]

    @property
    def eligible_count(self) -> int:
        return len(self.records)


HeaderMapping = Mapping[str, str] | Sequence[tuple[str, str]]


def _mapping_pairs(header_mapping: HeaderMapping) -> tuple[tuple[str, str], ...]:
    pairs = tuple(header_mapping.items() if isinstance(header_mapping, Mapping)
                  else header_mapping)
    headers, identifiers = set(), set()
    for pair in pairs:
        if (not isinstance(pair, (tuple, list)) or len(pair) != 2
                or any(type(value) is not str for value in pair)):
            raise FormsImportError("Mapeamento deve conter pares de textos.")
        header, identifier = pair
        if not header or header in ADMINISTRATIVE_HEADERS:
            raise FormsImportError("Cabeçalho vazio ou administrativo no mapeamento.")
        if identifier not in FIELDS_BY_ID:
            raise FormsImportError("Destino fora do esquema analítico.")
        if header in headers or identifier in identifiers:
            raise FormsImportError("Mapeamento duplicado ou ambíguo.")
        headers.add(header)
        identifiers.add(identifier)
    if identifiers != set(FIELDS_BY_ID):
        raise FormsImportError("Mapeamento deve cobrir os 39 campos analíticos.")
    return pairs


def _convert(identifier: str, raw: str) -> Value:
    field = FIELDS_BY_ID[identifier]
    if not raw.strip():
        return validate_value(identifier, None)
    value: object = raw
    if field.data_type == "integer":
        # Labeled alternatives are accepted only with the exact canonical label.
        labeled = {f"{choice} — {label}": choice
                   for choice, label in zip(field.choices, field.labels) if label}
        if raw in labeled:
            value = labeled[raw]
        elif re.fullmatch(r"[+-]?[0-9]+", raw):
            try:
                value = int(raw)
            except ValueError:
                pass  # Keep the text so the canonical validator rejects it safely.
    elif field.data_type == "number":
        # No thousands separators, exponent notation or locale guessing.
        if not re.fullmatch(r"[+-]?[0-9]+(?:[.,][0-9]+)?", raw):
            raise ResponseValidationError(identifier, "decimal inválido")
        value = float(raw.replace(",", "."))
    return validate_value(identifier, value)


def _read(stream: TextIO, pairs: tuple[tuple[str, str], ...],
          delimiter: str) -> ImportResult:
    reader = csv.reader(stream, delimiter=delimiter, strict=True)
    headers = next(reader, None)
    if not headers:
        raise FormsImportError("CSV vazio ou sem cabeçalho.")
    if len(headers) != len(set(headers)):
        raise FormsImportError("Cabeçalhos duplicados.")
    if any(not header for header in headers):
        raise FormsImportError("Cabeçalho vazio.")
    positions = {header: i for i, header in enumerate(headers)}
    if any(header not in positions for header, _ in pairs):
        raise FormsImportError("Cabeçalhos mapeados ausentes; confira o delimitador.")
    columns = tuple((positions[header], identifier) for header, identifier in pairs)
    approved = {index for index, _ in columns}
    excluded = tuple(i + 1 for i in range(len(headers)) if i not in approved)
    records, issues = [], []
    total = ineligible = rejected = 0
    for row_number, row in enumerate(reader, 2):
        total += 1
        if len(row) != len(headers):
            rejected += 1
            issues.append(RowIssue(row_number, "invalid", None,
                                   "Quantidade de células difere do cabeçalho."))
            continue
        try:
            record = {identifier: _convert(identifier, row[index])
                      for index, identifier in columns}
            validated = validate_record(record)
        except ResponseValidationError as error:
            rejected += 1
            issues.append(RowIssue(row_number, "invalid", error.field_id, error.reason))
        except IneligibleRecordError:
            ineligible += 1
            issues.append(RowIssue(row_number, "ineligible", None,
                                   "Critérios de participação não satisfeitos."))
        else:
            records.append(MappingProxyType(validated))
    return ImportResult(total, tuple(records), ineligible, rejected,
                        tuple(issues), excluded)


def import_forms_csv(source: str | Path | TextIO, header_mapping: HeaderMapping,
                     *, delimiter: str = ",", encoding: str = "utf-8-sig") -> ImportResult:
    """Import an explicitly mapped CSV, without changing or closing caller streams.

    Headers match literally. Maps must cover all 39 fields once; extra columns
    are excluded and reported by 1-based position only. Numeric parsing is
    strict; categorical strings are preserved. All fields are validated before
    eligibility, so incomplete negative-consent rows are structurally rejected.
    Row numbers identify logical CSV records (header = 1), not physical lines.
    Encoding applies to paths; text streams must already be decoded correctly.
    File/configuration failures abort the import; cell failures reject one row.
    """
    pairs = _mapping_pairs(header_mapping)
    if (type(delimiter) is not str or len(delimiter) != 1
            or delimiter in ('\r', '\n', '"', '\0')):
        raise FormsImportError("Delimitador deve ser um caractere válido.")
    try:
        if isinstance(source, (str, Path)):
            with open(source, encoding=encoding, newline="") as stream:
                return _read(stream, pairs, delimiter)
        return _read(source, pairs, delimiter)
    except (UnicodeError, LookupError):
        failure = "Falha na codificação do CSV."
    except csv.Error:
        failure = "CSV malformado."
    except OSError:
        failure = "Não foi possível ler o CSV."
    # Raise outside the handler: the error object must not retain raw exceptions.
    raise FormsImportError(failure)
