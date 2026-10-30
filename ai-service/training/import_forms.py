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
    ANALYTICAL_FIELDS,
    ELIGIBILITY_FIELDS,
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

OFFICIAL_ADMINISTRATIVE_HEADERS = (
    "Carimbo de data/hora", "E-mail para recebimento da cópia do TCLE",
)


def official_header_mapping() -> Mapping[str, str]:
    """Literal headers from the schema and the documented export conventions.

    The administrative email occupies physical position 3; numbered analytical
    questions after it use physical order minus one. ESB-eu has no prefix.
    Only the documented work-hours header receives an extra trailing space.
    """
    mapping = {}
    for field in ANALYTICAL_FIELDS:
        if field.group == "esbeu":
            header = field.question
        else:
            number = field.form_order - (1 if field.form_order > 3 else 0)
            header = f"{number}. {field.question}"
        if field.identifier == "work_hours_week":
            header += " "
        if header in mapping:
            raise FormsImportError("Cabeçalhos oficiais ambíguos no esquema.")
        mapping[header] = field.identifier
    return MappingProxyType(mapping)


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
          delimiter: str, allowed_extra_headers: tuple[str, ...] | None) -> ImportResult:
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
    if allowed_extra_headers is not None:
        expected = {header for header, _ in pairs} | set(allowed_extra_headers)
        if set(headers) != expected:
            raise FormsImportError("Cabeçalhos incompatíveis com o formato configurado.")
    columns = tuple((positions[header], identifier) for header, identifier in pairs)
    by_identifier = {identifier: index for index, identifier in columns}
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
            # A valid negative criterion ends participation, even with later blanks.
            for field in ELIGIBILITY_FIELDS:
                criterion = _convert(field.identifier, row[by_identifier[field.identifier]])
                if criterion != field.choices[0]:
                    raise IneligibleRecordError()
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
                     *, delimiter: str = ",", encoding: str = "utf-8-sig",
                     allowed_extra_headers: tuple[str, ...] | None = None) -> ImportResult:
    """Import an explicitly mapped CSV, without changing or closing caller streams.

    Headers match literally. Maps must cover all 39 fields once; extra columns
    are excluded and reported by 1-based position only. Numeric parsing is
    strict; categorical strings are preserved. Eligibility is checked in form
    order: a valid negative skips later fields; earlier missing/invalid criteria
    reject the row. All positive criteria require complete analytical validation.
    If allowed_extra_headers is provided, the exact mapped+extra header set is
    required; otherwise extra columns are discarded as before.
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
                return _read(stream, pairs, delimiter, allowed_extra_headers)
        return _read(source, pairs, delimiter, allowed_extra_headers)
    except (UnicodeError, LookupError):
        failure = "Falha na codificação do CSV."
    except csv.Error:
        failure = "CSV malformado."
    except OSError:
        failure = "Não foi possível ler o CSV."
    # Raise outside the handler: the error object must not retain raw exceptions.
    raise FormsImportError(failure)


def import_official_forms_csv(source: str | Path | TextIO, *, delimiter: str = ",",
                              encoding: str = "utf-8-sig") -> ImportResult:
    """Require the documented 41-column export, without fuzzy header matching."""
    return import_forms_csv(
        source, official_header_mapping(), delimiter=delimiter, encoding=encoding,
        allowed_extra_headers=OFFICIAL_ADMINISTRATIVE_HEADERS,
    )
